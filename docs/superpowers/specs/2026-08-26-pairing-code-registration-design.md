# 配对码注册制设计（修复任意 12 位码可配对/假发送成功）

## 背景

实测发现：手机端输入任意格式合法的 12 位码都能"配对"并"发送成功"。根因是现有中继的零知识模型——服务端只认 SHA-256(配对码) 做路由，从不感知"哪些码有效"；只有主动清除/轮换过的码会进 `revoked_keys` 返回 410。未注册码的 POST 写入死队列后返回 ok，形成假成功（消息 30 天后被保留期清扫，无人可见）。

这在 2026-08-25 的注销设计里是明确的非目标（"不做配对码注册制"），实测体验推翻了该取舍：**需要注册制——桌面端生成/保存配对码时向中继注册 key_hash，未注册的码手机配对被拒、发送报错。**

## 目标

1. 未注册（不存在）的配对码：手机输码配对被拒，提示到桌面端获取。
2. 已注销（清除/轮换）的配对码：输码配对被拒（提示失效）；发送时报错并引导换码（410 路径已上线，本设计复用）。
3. 存量已配对的码无感迁移：桌面端升级后首次启动自动注册，用户零操作。
4. 手机弱网不阻断速记：输码验证请求失败时 fail-open 放行配对，发送时服务端门控兜底。

## 非目标

- 不改配对码格式、加密方案、水位线、读即消费、注销语义（注销即永久，注册不复活）。
- 不做账号体系；"知道码即拥有该通道全部权限"的信任模型不变（注册/状态端点同凭据）。
- GET 拉取保持宽松：未注册码返回空列表不报错（升级窗口容错，桌面只 GET 已配置的码且启动时会注册）。

## 已拍板决策

| 决策点 | 结论 |
|---|---|
| 输码验证的网络失败策略 | **fail-open**：验证请求失败（非"码不存在"）直接放行配对，发送时兜底 |
| 注销码能否被重新注册复活 | **不能**：注册用 INSERT IGNORE，已注销行永久保持 revoked |

## 后端设计（`server/`）

### Schema：单表三态

```sql
CREATE TABLE pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

行状态：无行＝unknown（从未注册）；`revoked_at IS NULL`＝active；`revoked_at` 非空＝revoked。永久保留（同原注销表语义，30 天保留期仅清 `inbox_items`）。

生产迁移脚本 `server/migrations/2026-08-26-pairing-keys.sql`（一次性，root 执行）：

```sql
CREATE TABLE IF NOT EXISTS pairing_keys (...同上...);
INSERT INTO pairing_keys (key_hash, registered_at, revoked_at)
  SELECT key_hash, revoked_at, revoked_at FROM revoked_keys;
DROP TABLE revoked_keys;
```

### 端点

- `POST /inbox/<key_hash>/register`：`INSERT IGNORE INTO pairing_keys`（幂等，不复活 revoked 行）。恒返回 `{"ok": true}`。key_hash 格式非法 404。自带 OPTIONS 预检（CORS 方法 GET/POST/DELETE/OPTIONS 不变）。
- `GET /inbox/<key_hash>/status`：`{"status": "active" | "revoked" | "unknown"}`（查单行）。
- `POST /inbox/<key_hash>`（改造）：单连接内先查 `pairing_keys`——无行 → `404 {"error": "unknown_code"}`；`revoked_at` 非空 → `410 {"error": "revoked"}`；否则照原逻辑写入+清扫。
- `DELETE /inbox/<key_hash>`（改造）：清队列 + upsert 置 `revoked_at`（`INSERT ... ON DUPLICATE KEY UPDATE revoked_at`，未注册过的码被清除也落 revoked 行）→ `{"ok": true}`，幂等。
- `GET /inbox/<key_hash>`：不变（宽松，未知码空列表）。
- 客户端只发格式合法的 hash，POST 得 404 即判定 unknown_code（body 错误码 `unknown_code` 区别于路由级 `not_found`，供人工排查）。

### conftest

`db` fixture 改为 TRUNCATE `inbox_items` + `pairing_keys`；schema.sql 替换为新表（测试库整库重建，天然覆盖）。

## 桌面端设计（注册方）

- `inboxClient.ts` 新增 `registerInboxKey(keyHash): Promise<boolean>`：`POST /inbox/<hash>/register`，超时/非 2xx/异常一律 false，不抛。
- **启动注册（迁移 + 自愈）**：`App.vue` `onMounted` 对所有 `workspace.inbox` 存在的工作区，`void inboxKeyHash(code).then(registerInboxKey)`（静默，失败不弹泡——与拉取失败同级降级，下次启动重试）。
- **显式注册**：`handleInboxUpdate` 在 `inbox !== null` 时（保存/轮换后）注册当前码；失败弹警告气泡「配对码注册失败，手机暂时无法配对，下次启动会自动重试」（`appMounted` 守卫，同注销警告模式）。清除/轮换的注销分支不变。
- i18n 新键 `inboxRegisterFailed`（zh/en）。

## 手机端设计（验证 + 兜底）

- `inboxClient.ts` 新增 `checkInboxKeyStatus(keyHash): Promise<"active" | "revoked" | "unknown" | null>`：`GET /status`，网络/解析失败返回 null。
- **输码验证**（`confirmMobileInboxCode` 改 async）：格式通过 → 输码按钮进入「验证中…」禁用态 → 查 status：
  - `active` → 走现有配对流程（写 hash、记忆）
  - `unknown` → 就近错误「配对码不存在，请到桌面端获取」（留在输码表单）
  - `revoked` → 「配对码已失效，请到桌面端获取新配对码」
  - `null` → **fail-open 直接配对**（发送时兜底）
- **自动配对路径不验证**：URL fragment 与本地记忆直接进入速记页，发送时兜底（避免启动联网依赖）。
- **发送兜底**：`InboxPostFailure` 增 `"unknown_code"`（`postFailureForStatus` 映射 404）；`errorTextFor` 增文案「配对码不存在，请到桌面端重新配对」；换码按钮的显示条件从仅 `code_revoked` 扩为 `code_revoked || unknown_code`（同为"码不可用，引导更换"）。
- i18n 新键：`mobileInboxChecking`（"验证中…"）、`mobileInboxCodeUnknown`、`mobileInboxCodeRevoked`（输码时）、`mobileInboxErrorUnknown`（发送时），均 zh/en。

## 迁移与发布顺序（避免线上断档）

1. 后端代码完成但**先不部署**（`deploy.sh` 手动可控）。
2. 发布前端 1.0.146（含启动自动注册）→ 桌面打开一次，存量码全部注册。
3. aliyun 执行迁移 SQL（建表 + backfill + DROP `revoked_keys`）→ `./deploy.sh` 上线 POST 门控。
4. 顺序颠倒的后果：桌面未升级期间，存量码的手机发送得 404 → 旧手机版（1.0.145）显示"服务暂时不可用"（不误导但体验差）。按 1→2→3 执行即可避免。

## 边界与威胁模型

- **注册/状态端点凭据**：与 POST 相同（key_hash）——知道码即可查询/注册，不新增攻击面；伪造注册需要先知道码，而知道码本就拥有通道。
- **碰撞**：随机新码与已注册/已注销码碰撞概率可忽略（60 bit）。
- **旧手机版兼容**：1.0.145 手机向未注册码发送得 404 → 归入通用"服务暂时不可用"；配对流程无验证（无新提示），发送时报错——不误导。
- **register 幂等**：重复注册、注册已 active 码均为 no-op；注册已 revoked 码不复活（拍板决策）。
- **桌面离线生成配对码**：保存时注册失败仅警告，码仍写入本地；下次启动自动补注册。期间手机验证得 unknown。

## 测试

### pytest（`server/tests/test_inbox.py`）

- register：幂等（两次 ok）；不复活 revoked 行（先 DELETE 再 register，status 仍 revoked）。
- status 三态：未注册 unknown；注册后 active；DELETE 后 revoked。
- POST 门控：unknown → 404 `unknown_code`；revoked → 410；active → 200 正常收发（回归）。
- DELETE：未注册码被清除后 POST 得 410（落 revoked 行）。
- 405 Allow 头与 CORS 含新路由方法；非法 hash 404。

### vitest（`src/__tests__/`）

- `sync-inbox-client.test.ts`：`registerInboxKey` 成败/超时/请求形状；`checkInboxKeyStatus` 四返回值（含网络失败 null）；`postFailureForStatus` 404→`unknown_code`。
- `mobile-inbox-capture.test.ts`：发送遇 unknown_code 显示新文案且换码按钮可见；非失效错误仍无按钮。
- `app-render.test.ts`：启动注册（配对工作区各一次、未配对不发）；保存/轮换后注册新码；注册失败警告气泡；输码验证四分支（active 配对成功 / unknown 与 revoked 留在表单并提示 / 网络 fail-open 配对成功）；fragment/remembered 自动配对不触发 status 请求。
- `i18n.test.ts`：新键 zh/en 齐全。
