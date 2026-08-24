# 手机速记（单向收件箱）设计

## 背景

Mini Desk 是本地优先的纯静态 PWA（Cloudflare Pages，零后端），移动端按 `2026-05-23-mobile-desktop-handoff-design.md` 完全阻断为「请在电脑端打开」引导页。跨设备需求评估结论：

- 不做双向同步：单用户多设备场景的冲突合并成本高，且第一方托管完整看板数据与「不上传任何用户数据」的产品定位冲突。
- 不做 BYO 云盘：浏览器跨域调坚果云 WebDAV 会被 CORS 阻断，GitHub Gist + PAT 对「随手记一笔」的摩擦过大。
- 采用单向收件箱：手机只做录入表单，数据经第一方中转（只存密文）送达桌面端合并。手机→云→电脑，不回传。

本功能为「手机记一笔、电脑接着用」场景服务：待办与便签文字的快速采集，不是移动版看板。

## 目标

1. 每个工作区可独立配置一个配对码；未配置的工作区完全不参与同步（零轮询、零请求）。
2. 手机端访问带配对码的地址即可录入待办/便签，提交后经中转到达桌面端。
3. 中转服务器只见密文：配对码兼作加密密钥，路由键只使用配对码的哈希；条目 TTL 到期即删，无账号、无日志。
4. 配对配置随工作区导出/导入自然迁移，迁移后不产生重复导入。
5. 桌面端在现有保存语义下合并新条目并给出气泡提示。

## 非目标

- 不做双向同步（桌面端内容不回流手机）。
- 不收图片，只收文字。
- 不做多用户/账号体系。
- 不做历史回溯：条目过期即弃，无回收站。
- 不解锁移动端看板功能。

## 总体数据流

```
手机表单 → AES-GCM 加密（配对码派生密钥） → POST /inbox/H(码) → KV（密文，TTL 30 天）
桌面端（启动/聚焦/定时/Ctrl+S）→ GET /inbox/H(码) → 解密 → 水位线过滤 → 合并到落点 → persistNow
```

- `H(码)` = SHA-256(配对码) 的 hex，仅作服务端路由键；服务器不知道码就无法解密内容，也无法写入有效内容。
- 配对码出现在 URL fragment（`#inbox=码`）中，fragment 不发给服务器，不进日志。

## 中转 Worker

新增 `worker/` 目录（Cloudflare Worker + KV，零依赖），部署脚本 `npm run deploy:worker`，与现有 `deploy:cloudflare` 并列。

### 接口

- `POST /inbox/:keyHash`：body `{ id, payload }`，`id` 为客户端生成的条目 ID，`payload` 为 base64 密文。服务端存 `{ id, payload, createdAt }`，TTL 30 天。同一 `keyHash` 下重复 `id` 视为重试，覆盖旧条目而非新增（幂等），手机端网络失败重试不会产生重复。
- `GET /inbox/:keyHash`：返回 `{ items: [{ id, payload, createdAt }] }`，按 `createdAt` 升序。
- 不提供按条删除：多台电脑可能共用一个码，删除会饿死其他设备；回收交给 TTL。

### 约束与防滥用

- `keyHash` 必须匹配 `[0-9a-f]{64}`，否则 400。
- 单条 payload ≤ 4KB（413）。
- 每码队列 ≤ 200 条（409）。
- 每码写入 ≤ 60 条/天（429，KV 计数器按天滚动，最终一致即可）。
- CORS 仅放行应用自身域名；不记录 body 与 keyHash 日志。
- HTTPS 由 Cloudflare 默认保障。

## 加密方案

- 配对码：12 位 Crockford base32（字母表 `0-9 A-Z` 去除 `I L O U`，≈60 bit 熵），`crypto.getRandomValues` 生成。
- 密钥派生：PBKDF2-SHA256，600,000 次迭代，盐为每条提交独立随机的 16 字节。
- 加密：AES-GCM，12 字节随机 nonce。
- 密文格式：`base64(salt[16B] || nonce[12B] || ciphertext)`。
- 明文 JSON：`{ kind: "todo" | "note", text: string, createdAt: number }`（手机端生成的时间戳仅作参考显示；水位线使用服务端 `createdAt`）。
- 全部使用内置 Web Crypto API，不引入加密依赖。
- 已接受的权衡：路由键为无盐单次 SHA-256，码熵 ≈60 bit——仅当攻击者能读取中转方存储（内部人员/平台泄露）时才可离线爆破码值。鉴于明文价值（个人速记）、TTL 30 天与爆破成本不匹配，接受该风险；若日后提升安全等级，可将路由键同样过慢速 KDF。
- 已接受的边界（2026-08-24 最终审查补记）：KV 为最终一致存储，若条目 X（createdAt=T）因传播延迟晚于其后写入的条目 Y（T+Δ）才对拉取可见，而桌面端已在 Y 可见时把水位线推进过 T，X 将被水位线永久跳过（丢单条速记，不损毁数据）。概率低（传播窗口秒级、拉取间隔 1 小时，轮询越少撞上传播窗口的机会越少），后果有界，接受不改；如日后需消除，可改「已见 ID 集合 + 水位线」混合去重。

## 状态模型

```ts
// src/types.ts
interface WorkspaceInbox {
  code: string                              // 12 位 Crockford base32
  todoListId: TodoListId                    // 待办落点（该工作区的清单）
  noteTarget: string                        // 便签落点（目标空间 Tab 的 id，失效回退第一个空间）
  lastSeenAt: number                        // 已消费水位线（服务端毫秒时间戳）
}

// WorkspaceData 增加可选字段 inbox?: WorkspaceInbox
```

- 字段存在即启用该工作区的同步；删除字段即停用（旧地址随之失效，未读条目自然过期）。
- 去重采用水位线而非已见 ID 集合：拉取时跳过 `createdAt <= lastSeenAt` 的条目，合并后将 `lastSeenAt` 推进到本批最大 `createdAt`。水位线存在工作区数据内，随导出迁移，新机器导入后不会重灌历史条目。
- `defaultWorkspace()` 不含 `inbox` 字段；`serialize.ts` 原样序列化（体积极小，无需裁剪）。

## 桌面端

### 配对 UI

- 入口在 `WorkspaceSwitcher` 每个工作区菜单内（「导出此空间」旁新增「配对手机」），打开配对面板。
- 面板内容：配对码展示、完整地址 `https://<域名>/#inbox=<码>`、二维码（新增 `qrcode` 依赖渲染 canvas）、轮换按钮（重新生成码，保留落点与水位线；旧队列换键后自然过期）、清除配对（删除 `inbox` 字段）、落点选择（待办清单下拉 + 便签落点下拉，动态列出该工作区全部空间 Tab 的实际标题，默认第一个空间）。

### 拉取与合并

- 新增 `src/sync/` 模块：`crypto.ts`（派生/加解密）、`inboxClient.ts`（Worker API 客户端，Worker URL 为常量配置）、`pairing.ts`（码生成/校验、地址拼装）、`pull.ts`（拉取合并编排）。
- 触发时机：页面加载完成、window focus（60 秒节流）、每 1 小时定时器、Ctrl+S 顺带。仅当存在任一配置了 `inbox` 的工作区时才注册定时器。
- 每次拉取遍历所有配置了 `inbox` 的工作区（`Promise.allSettled` 并发），逐个解密、按 `kind` 路由：
  - `todo`：向 `todos[todoListId]` 追加 `{ id: 新ID, text, done: false }`。
  - `note`：向目标空间 `spaces[noteTarget]` 的 `lines` 追加一行 `{ text, indent: 0 }`（目标空间已被删则回退第一个空间），并同步刷新 `workspaceLines`/`storageLines` 投影字段，维持「投影 = spaces[0]/spaces[1]」的既有不变量。
- 明文校验：`text` 裁剪到 500 字；解密失败或格式非法的条目跳过，但仍参与水位线推进，不阻塞其他条目。
- 合并属于结构性修改，走现有状态助手 + `persistNow()` 立即保存。
- 有新条目时用现有 `CompanionBubble` 提示：「工作区「XX」收到 N 条来自手机的记录」（i18n 双语）。

## 手机端

- 复用现有移动端阻断壳（`App.vue` 的 `isMobileBlocked` 分支），不新增移动端看板能力。
- URL 带 `#inbox=<码>` 时显示速记表单；引导页上增加「输入配对码」入口供手动输码。
- 表单：待办/便签切换 + 文本框（≤500 字）+ 提交。提交时派生密钥、加密、POST；成功后清空文本框并给出轻量成功反馈，失败给行内提示可重试。
- 提示文案沿用现有气泡视觉语言与 i18n。

## 导出与导入

- 导出：`inbox` 是 `WorkspaceData` 普通字段，`exportWorkspaceById` 自动携带，无需特判。
- 导入：`normalizeWorkspaceData` 新增 `normalizeWorkspaceInbox` 清洗——码不匹配 `/^[0-9A-HJKMNP-TV-Z]{12}$/`（Crockford base32，排除 I/L/O/U）则丢弃整个 `inbox`；`todoListId` 不在该工作区清单中则回退第一个清单；`noteTarget` 不在该工作区空间 id 中则回退第一个空间 id；`lastSeenAt` 非有限数回退 0。
- 安全提示：配对码即密钥，导出文件携带它意味着「分享导出文件 = 分享该工作区的手机录入通道」。导入检测到带 `inbox` 时提示：若文件来自他人，建议导入后轮换配对码。

## 错误处理

- 桌面端拉取失败（网络/429/409）静默跳过，等下次触发重试；不弹错误气泡。
- 手机端提交失败按状态码给行内提示（429 限流、409 队列满、413 超长、网络失败），保留已输入文本。
- 解密失败条目仅 `console.warn`，不中断批次。
- Worker 对非法请求一律 400/404，不回显内部信息。

## 测试计划

### 单元测试

- `crypto.ts`：加解密往返、错误码解密失败、密文格式。
- `pairing.ts`：码格式、字母表合法性、地址拼装。
- `pull.ts`：水位线过滤（跳过已消费、批次推进）、kind 路由落点、非法条目跳过且水位线照常推进、多工作区并发。
- `normalizeWorkspaceInbox`：各回退分支与整字段丢弃。
- Worker handler（mock KV）：keyHash 校验、限长、队列上限、每日限流、TTL 写入参数、CORS 头。

### 手动验证

- `wrangler dev` 起本地 Worker，客户端常量指向 localhost。
- 窄视口模拟手机端：带 fragment 打开 → 录入待办与便签 → 桌面端加载/聚焦/Ctrl+S 触发拉取 → 合并到指定落点 → 气泡提示。
- 重复拉取无重复导入；导出工作区到另一浏览器导入后拉取不重灌历史。

## 默认参数

| 参数 | 值 |
|---|---|
| 配对码 | 12 位 Crockford base32（≈60 bit） |
| KDF | PBKDF2-SHA256，600,000 次迭代，每条独立 16B 盐 |
| 条目 TTL | 30 天 |
| 队列上限 | 200 条/码 |
| 单条密文 | ≤ 4KB |
| 明文长度 | ≤ 500 字 |
| 写入限流 | 60 条/天/码 |
| 拉取频率 | 定时 1 小时 + 聚焦节流 60 秒 + 启动 + Ctrl+S |
| 待办落点默认 | 该工作区第一个清单 |
| 便签落点默认 | 第一个空间 Tab（`spaces[0]`） |

## 变更记录

### 2026-08-24 便签落点改为目标空间 Tab（spaceId）

首次实现进行到配对弹窗（Task 8）前复核看板实际结构，发现本设计对便签落点的前提有误：

- 设计假设 `noteLines` / `workspaceLines` / `storageLines` 是三个可见的行编辑面板，便签落点「三栏任选」。
- 实际看板中可见的行编辑器只有 SpacePanel 的空间 Tab（`spaces[].lines`）；`workspaceLines`/`storageLines` 是 `syncLegacySpaceLines()` 从 `spaces[0]`/`spaces[1]` 单向复制出的兼容投影字段（UI 从不读取），`noteLines` 更是彻底无渲染的遗留字段。
- 后果：若维持原设计，手机端发送的便签无论选择哪个落点，桌面端都不可见。

经用户确认，落点模型调整为：

- `WorkspaceInbox.noteTarget` 由闭合枚举 `"note" | "workspace" | "storage"` 改为 `string`，存目标空间的 id。
- 配对面板的便签落点下拉动态列出该工作区全部空间 Tab 的实际标题（含用户新建 Tab），默认第一个空间；不再需要静态落点文案键（原 `inboxTargetNotes` 删除）。
- 拉取合并写入 `spaces[noteTarget].lines`，目标失效回退第一个空间，并同步刷新两个投影字段维持既有不变量。
- 导入清洗：`noteTarget` 不在该工作区空间 id 中则回退第一个空间 id。

### 2026-08-25 定时拉取间隔 5 分钟 → 1 小时

- 动机：每次拉取为 1 次 KV list + 最多 200 次 get（全量拉回后按水位线去重）。5 分钟轮询单设备约 5.8 万读/天，占 KV 免费额度（10 万读/天）近六成，多设备共用配对码即超；1 小时间隔降至约 5 千读/天。
- 拉取为 GET，Worker 侧不计数：间隔调整不影响每日 60 条的写入限流与 200 条队列上限。
- 实际延迟影响小：聚焦（60 秒节流）、启动、Ctrl+S 触发点保留，回到电脑点一下窗口即同步。
