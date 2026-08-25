# 手机速记中继自建迁移（阿里云 + MySQL）设计

## 背景

手机速记当前经 Cloudflare Worker + KV 中转（`worker/index.ts`，绑定 `inbox.minidesk.online`）。免费额度带来了三层约束：每码写入 60 条/天、队列 200 条、桌面端定时拉取间隔为 1 小时（降低对中转的请求压力）。现迁移到自己的阿里云服务器（`ssh aliyun`）上的 Python 后端 + MySQL，拆除次数限制，拉取间隔回归 5 分钟。

机器现状（2026-08-25 勘察）：CentOS 7，系统 Python 3.6 过老但 `/opt/python3.9.6` 可用（pip 21，PyPI 可达）；nginx 1.20.1 已监听 80/443 但未配置任何真实站点；supervisord 3.4.0 已安装；MySQL 8.0.46（3306）；阿里云 VPC 内网 IP，公网经 NAT + 安全组。**机器在国内且域名无 ICP 备案**——80/443 上的域名 Web 服务会被备案探针拦截，服务必须走非常规端口。

## 目标

1. 中继迁到自建后端：Python 3.9 + Flask + PyMySQL + gunicorn，单文件应用，协议与 Worker 完全一致（前端仅改一个 URL 常量）。
2. 数据存 MySQL 专库专表，专用账号，应用不使用 root。
3. 完全不做次数限制：无每日写入上限、无队列上限、无读取限制；只保留输入校验。
4. 条目保留 30 天自动清理（与现 TTL 语义一致）。
5. 桌面端定时拉取间隔 1 小时 → 5 分钟。
6. 端到端加密模型不变：服务器只见 SHA-256(配对码) 路由键与 AES-GCM 密文。

## 非目标

- 不做双向同步、账号体系、按条删除（沿用现有设计：多桌面共用码时删除会饿死其他设备，回收交给保留期）。
- 不改加密方案（PBKDF2 600k + AES-GCM）、配对码格式、水位线去重逻辑。
- 不迁移 Cloudflare Pages 上的应用托管——SPA 仍在 Pages，仅中继地址变更。
- 不做多租户/鉴权升级——路由键即凭证的现有威胁模型保持不变。

## 总体数据流

```
手机表单 → AES-GCM 加密（配对码派生密钥） → POST https://relay.minidesk.online:8443/inbox/H(码) → MySQL（密文，保留 30 天）
桌面端（启动/聚焦/每 5 分钟/Ctrl+S）→ GET /inbox/H(码) → 解密 → 水位线过滤 → 合并到落点 → persistNow
```

与现状唯一的差异是中继实现与地址；`inboxClient.ts`、`crypto.ts`、`pull.ts` 的全部代码原样保留。

## 后端设计

新增 `server/` 目录，与 `worker/` 并列，自成一个可独立部署的小项目。

### 技术栈

- Flask（单文件 `app.py`，路由 / JSON / 错误处理 / CORS 全用框架能力）
- PyMySQL + `cryptography`（MySQL 8 默认 `caching_sha2_password` 认证需要）
- gunicorn，绑定 `127.0.0.1:8787`（仅本机，由 nginx 反代）
- 运行时：`/opt/python3.9.6` 建独立 venv，依赖仅上述三包 + 版本锁定

### 接口（与 Worker 线上协议逐字段一致）

- `POST /inbox/{keyHash}`：body `{ id, payload }`。校验 `keyHash` 匹配 `[0-9a-f]{64}`（404 路由不匹配）、`id` 为 1–64 字符字符串、`payload` 非空且 base64 折算密文 ≤ 4KB（413），非法返回 `{ "error": "bad_request" }` 400。写入用 `INSERT ... ON DUPLICATE KEY UPDATE`——同 id 重试覆盖，幂等语义与 Worker 一致（覆盖时 `created_at` 一并刷新）。成功返回 `{ "ok": true }`。
- `GET /inbox/{keyHash}`：返回 `{ "items": [{ "id", "payload", "createdAt" }] }`，按 `created_at, id` 升序。无条目返回空数组。不限读取次数、不限返回条数。
- `OPTIONS`：返回 CORS 预检 204。
- `GET /healthz`：无 CORS 的健康检查，供部署验证。
- 错误语义：400 `bad_request` / 404 `not_found` / 405 `method_not_allowed` / 413 `payload_too_large` / 500 `internal`。**不再有 429/409**（前端 `inboxClient` 对这两个状态的映射保留，属防御性兼容，可命中不了）。
- CORS：照抄 Worker 的 `ALLOWED_ORIGINS` 环境变量白名单逻辑（放行 Pages 域名与本地调试 origin），`Vary: Origin`。
- 日志策略与 Worker 一致：不记录 body 与 keyHash。

### 数据库

```sql
CREATE DATABASE minidesk_inbox CHARACTER SET utf8mb4;
CREATE TABLE inbox_items (
  key_hash   CHAR(64) ASCII NOT NULL,
  id         VARCHAR(64)   NOT NULL,
  payload    TEXT          NOT NULL,
  created_at BIGINT        NOT NULL,  -- epoch 毫秒，服务器时钟
  PRIMARY KEY (key_hash, id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE USER 'minidesk_inbox'@'localhost' IDENTIFIED BY '<随机生成>';
GRANT SELECT, INSERT, UPDATE, DELETE ON minidesk_inbox.* TO 'minidesk_inbox'@'localhost';
```

- root 密码仅部署时建库建号使用，不出现在应用配置与仓库中。
- 应用凭据（MySQL 密码、`ALLOWED_ORIGINS`）放服务器上 `/opt/minidesk-inbox/.env`（chmod 600），gunicorn 启动时注入。

### 保留期清理

每次成功 POST 后执行 `DELETE FROM inbox_items WHERE created_at < now - 30d`（走 `idx_created`）。个人量级下是毫秒级操作，不需要 cron / 定时器；表大小自然收敛，桌面端水位线去重使条目消失无副作用。

### 暴露方式（国内无备案）

- 子域名 `relay.minidesk.online` A 记录 DNS 直解（灰云）到机器公网 IP。**不复用** `inbox.minidesk.online`：老 Worker 保持在线，新旧并行，验证后切换下线，零风险过渡。
- 证书：acme.sh 以 **DNS-01**（Cloudflare API token，仅 `minidesk.online` 的 DNS 编辑权限）签发 Let's Encrypt，不开 80 端口，自动续期 + `nginx -s reload`。
- nginx 新增 `/etc/nginx/conf.d/minidesk-inbox.conf`：`listen 8443 ssl http2`，反代 `127.0.0.1:8787`，`client_max_body_size 8k`。8443 避开备案探针（只扫 80/443）。
- 前端默认中继地址：`https://relay.minidesk.online:8443`（`VITE_INBOX_WORKER_URL` 本地覆盖机制保留）。

### 进程管理

supervisord program 配置：`/opt/minidesk-inbox/venv/bin/gunicorn -b 127.0.0.1:8787 app:app`，`autorestart`，日志到 `/opt/minidesk-inbox/logs/`。

## 前端改动

1. `src/sync/config.ts`：`INBOX_WORKER_URL` 默认值 → `https://relay.minidesk.online:8443`；`INBOX_PULL_INTERVAL_MS` → `5 * 60 * 1000`（聚焦节流 60 秒、启动/聚焦/Ctrl+S 触发、15 秒超时均不变）。
2. `src/components/MobileInboxCapture.vue`：删除 `MAX_LINES_PER_SEND`（20 行/次上限，其唯一意义是省每日配额，配额已不存在）及对应提示；移除 textarea 的 `maxlength` 属性（HTML maxlength 只能约束总字符数，行数不再设限），单行 500 字上限仍由发送时 `slice` 保证——那是数据形状不是限额。
3. `src/state/i18n.ts`：仅移除 `mobileInboxErrorTooManyLines` 一条文案；`rate_limited` / `queue_full` 等其余文案保留（防御性状态映射仍在）。

## 发布与切换顺序

1. **部署后端**（与线上无任何交互）：MySQL 建库建号 → 代码就位 `/opt/minidesk-inbox` → venv 装依赖 → supervisord 起进程 → acme.sh 签证书 → nginx 8443 → `curl` 契约自测。需要用户两件事：阿里云安全组放行 8443/TCP；提供 Cloudflare API token。
2. **前端发版**：改 URL 与间隔、去行数上限，`npm test` 通过后走 `/release-mini-desk` 发版（Pages 部署 + SW 自动更新）。
3. **实测**：手机发一条提醒事项与一条便签，桌面端 5 分钟内自动出现。
4. **下线老链路**（验证后择日）：删除 Worker 自定义域路由并 `wrangler delete`，删除 KV 数据；`worker/` 目录、`worker/__tests__`、`npm run deploy:worker` 脚本与相关文档从仓库移除。旧客户端在下次打开页面时经 SW 更新到新地址。

## 测试

- **后端 pytest**（`server/tests/`，契约测试对照 `worker/__tests__` 语义）：POST/GET 往返、同 id 幂等覆盖、GET 按 createdAt 升序、非法 body/id/payload 的 400 与 413、路由不匹配 404、方法不允许 405、CORS 白名单放行与拒绝、保留期清理删除过期行。用 `MINIDESK_TEST_MYSQL` 指向临时 schema，测试自建自删，可在服务器或本机跑。
- **前端 vitest**：`config.ts` 断言（新 URL、5 分钟间隔）、`MobileInboxCapture` 去上限后的行为（多行仍逐条加密串行发送）、`inboxClient` 契约不回归。

## 安全考量

- MySQL 专用账号仅授 `minidesk_inbox.*`，root 凭据不落应用配置；`.env` chmod 600。
- 端到端加密不变：服务器被攻破也只能拿到密文与路由哈希。
- 8443 非常规端口 + DNS-01 签证书，规避无备案域名在 80/443 的拦截，也不暴露 80。
- CORS 白名单沿用；无次数限制的滥用风险由路由哈希的不可猜测性（SHA-256 of 60-bit 配对码）兜底，与 Worker 时代一致。
- 现有 MySQL 3306 监听公网（`[::]:3306`）不在本设计范围内，但建议另行收紧为仅本机或安全组封禁（单独事项，不阻塞本次迁移）。

## 回滚

切换验证前的任何时刻，前端回滚只需把 `INBOX_WORKER_URL` 默认值改回 `https://inbox.minidesk.online` 重新发版；期间老 Worker 始终在线。MySQL 表为纯密文队列，删库重导无心智负担。
