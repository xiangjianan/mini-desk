# 配对码注销联动与手机速记体验优化设计

## 背景

手机速记配对目前只有"创建/轮换/清除"三个本地动作，与中继后端完全解耦：

- 桌面端"清除配对"只删本地 `workspace.inbox` 字段；中继上该配对码的队列原样留存，靠 30 天保留期自然过期。
- "轮换配对码"承诺"旧地址立即失效"，实际只是桌面端不再读取——旧手机仍可向死队列发送，且发送返回 ok（假成功）。
- 手机端对失效码毫无感知，也没有引导换码的路径。
- 切换到已配对的工作空间不会立即拉取：轮询 `watch(hasInboxConfigured)` 只启停定时器，两个已配对空间互切时连 watch 都不触发，新数据最长要等一个 5 分钟周期。
- 手机速记的提醒事项/便签共用同一个占位词；右下角伙伴 GIF 在已配对进入速记态时仍常驻"建议在浏览器打开"；发送成功只有一行文字，无按钮态/动画/触觉反馈。

## 目标

1. 桌面端清除配对时，同步删除中继上该配对码的全部数据，并登记注销——此后手机端向该码发送立刻得到 410。
2. 轮换配对码与清除同路径注销旧码，兑现"旧地址立即失效"。
3. 手机端收到 410 时行内提示"配对码已失效"＋"去更换配对码"按钮，回到输码表单且草稿不丢。
4. 切换到已配对的工作空间（以及配对保存成功）时立即拉取一次。
5. 手机端占位词按提醒事项/便签区分；配对后隐藏右下角"建议在浏览器打开"；发送成功/失败增加动画与触觉反馈。

## 非目标

- 不改配对码格式、加密方案（PBKDF2 + AES-GCM）、水位线去重、读即消费语义。
- 不做配对码注册制——服务端仍不感知"哪些码有效"，只登记"哪些码被主动注销过"。码永久有效，除非注销。
- 不做多租户/账号体系；"知道码即拥有该通道全部权限"的威胁模型不变。
- 不改 `worker/`（遗留 Worker 原样退役，新端点仅存在于自建中继）。

## 核心语义（两条保留策略）

| 数据 | 保留策略 |
|---|---|
| `inbox_items`（消息密文） | 30 天保留期，随 POST 清扫（现状不变） |
| `revoked_keys`（注销记录） | **永久保留，只增不删**——注销后 410 永远生效；每行几十字节，量级可忽略 |

配对码本身永久有效：已配对的手机可以一直发送，没有任何过期。

## 后端设计（`server/`）

### 注销表

```sql
CREATE TABLE revoked_keys (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  revoked_at BIGINT NOT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

### 端点与语义

- 新增 `DELETE /inbox/<key_hash>`：单事务内
  1. `DELETE FROM inbox_items WHERE key_hash = %s`（该队列全部条目，含未读）；
  2. `INSERT INTO revoked_keys ... ON DUPLICATE KEY UPDATE revoked_at = ...`（幂等）。

  幂等语义：重复注销、注销从未存在过的码都返回 `{"ok": true}`。key_hash 格式非法仍走现有 404。**不删除 `revoked_keys` 的任何行**——POST 的 30 天清扫只清 `inbox_items`。
- `POST /inbox/<key_hash>` 前置检查：key_hash 命中 `revoked_keys` → `410 {"error":"revoked"}`（新错误码）。
- `GET /inbox/<key_hash>` 不变：注销后队列已空，自然返回空列表（多桌面共用码场景下另一端轮询无感，不报错）。
- CORS：`Access-Control-Allow-Methods` 与 405 的 `Allow` 头补 `DELETE`。
- 日志策略不变：不记录 body 与 keyHash。

### 部署

- `schema.sql` 增加 `revoked_keys` 表；测试库由 conftest 重建整库，天然覆盖。
- 生产库手动执行一次 `CREATE TABLE IF NOT EXISTS`（deploy.sh 只 rsync + 重启，不引入迁移机制）。

## 桌面端设计

### 清除/轮换联动注销

- `inboxClient.ts` 新增 `revokeInboxKey(keyHash: string): Promise<boolean>`：`DELETE` + 既有超时；任何失败（网络/超时/非 2xx）返回 false，不抛异常。
- 触发点在 `App.vue` 的 `handleInboxUpdate`（不在弹窗内）：替换 state **前**取目标工作区旧 `inbox.code`，满足任一条件即对旧 keyHash 发注销：
  - `inbox === null`（清除）；
  - `inbox.code !== oldCode`（轮换）。

  保存未改码不触发。弹窗组件保持纯 UI；未来新增配对变更入口自动覆盖。
- 失败策略（已拍板）：本地照常清除/轮换 + `persistNow()`，不 await 注销；注销 promise 返回 false 时气泡警告"云端清理失败，数据将在 30 天保留期内自动过期"（成功时维持现有"已清除手机配对"提示）。
- 轮换确认弹窗现有文案（"未读取的条目将无法解密"）与删除未读数据的语义一致，不改。

### 切换已配对空间立即拉取

```ts
watch([() => state.activeWorkspaceId, hasInboxConfigured], ([, configured]) => {
  if (configured) {
    startInboxPolling();
    void pullInboxes();
  } else {
    stopInboxPolling();
  }
});
```

- 覆盖：切到已配对空间（含两个已配对空间互切，`activeWorkspaceId` 变化触发）、配对保存成功（false→true）、切到未配对空间停轮询（现有行为）。
- 不加节流：切换是明确用户动作，已有 in-flight 守卫串行化，每次切换一轮 GET 量级可忽略。

## 手机端设计

### 410 失效提示与换码流程

- `postFailureForStatus` 增加映射 `410 → "code_revoked"`（`InboxPostFailure` 新成员，`errorTextFor` 穷尽性校验随之扩展）。
- `MobileInboxCapture` 错误区在 `code_revoked` 时额外渲染"去更换配对码"按钮 → emit `change-code` → App 调既有 `forgetMobileInboxCode()`（清本地记忆 + URL fragment，回输码表单）。
- **草稿上提**：`draft` 从组件 ref 提升到 `App.vue`（`v-model` 传入）。换码导致组件卸载重挂后输入内容不丢；注销流程中未发送的行已由 failAt 放回输入框，换码后直接重发即可，不重复已成功行。
- 文案（zh/en 双语）：错误"配对码已失效，可能已在桌面端被清除"＋按钮"去更换配对码"。

### 占位词区分（仅提示词，行为不变）

- 提醒事项：zh `每行一条提醒，如：周五前取快递` / en `One reminder per line, e.g. Pick up the package Friday`
- 便签：zh `写一段便签，可换行，换行会保留…` / en `Write a note — line breaks are kept…`
- placeholder 随 kind 切换（computed）；多行拆分与桌面落点行为维持现状（便签逐行落行＝保留换行的"一段文本"）。

### 配对后隐藏右下角提示

`activeCompanionVisible` 改为 `(isMobileBlocked && mobileInboxCode === null) || companionVisible`：已配对进入速记态时右下角 GIF 气泡整体隐藏；未配对落地页（含"建议在浏览器打开"文案）保持不变。

### 发送反馈

- 发送中：按钮禁用 + 轻微脉动。
- 成功：按钮短暂切换"✓ 已发送"绿色态（约 2.5s 后复位为"发送"），状态行滑入动画；`navigator.vibrate(20)` 触觉反馈（不支持的机型静默忽略）。
- 失败：错误行抖动动画 + `navigator.vibrate([40, 60, 40])`。
- 所有动画包 `prefers-reduced-motion: reduce` 降级。

## 边界与威胁模型

- **注销端点授权**：与 POST 同凭据（key_hash = SHA-256(码)）——知道码即拥有该通道全部权限（含销毁），与现状一致，不新增攻击面。
- **多桌面共用码**（导入场景）：一端清除＝整条通道注销，另一端轮询得空、其手机得 410。与现有"共享通道"警告（`importedPayloadHasInbox`）语义一致，文档记录即可。
- **删除失败残留**：极端情况下（网络故障）注销未登记，手机端继续假成功发送，数据进死队列后被 30 天保留期清扫；本地配对已清，桌面不再读取。可接受，气泡已警告。
- **重新配对撞码**：12 位 base32 ≈ 60 bit 随机，新码与已注销旧码碰撞概率可忽略；即使碰撞，表现为新配对秒失效（410），重新生成即可。
- **旧客户端兼容**：不认识 410 的旧移动端把它归入通用 `server` 错误提示，不引导换码但也不假成功；协议纯增量，无破坏。

## 测试

### pytest（`server/tests/test_inbox.py` 扩展）

- DELETE 后：该 key 的条目全删、POST 得 410 `revoked`、GET 得空 items。
- DELETE 幂等：连续两次都 `{"ok": true}`。
- 未注销的 key：POST/GET 行为与现状完全一致（回归）。
- 非法 key_hash 的 DELETE → 404。
- CORS/preflight：`Access-Control-Allow-Methods` 含 DELETE。
- 注销记录不被 30 天清扫误删：种一条过期 `revoked_at`，触发 POST 清扫后仍存在；同时 `inbox_items` 过期行照常被清。
- `db` fixture 增加 `TRUNCATE TABLE revoked_keys`。

### vitest（`src/__tests__/` 扩展）

- `sync-inbox-client.test.ts`：`revokeInboxKey` 成功/失败/超时；`postFailureForStatus` 410→`code_revoked` 映射。
- `mobile-inbox-capture.test.ts`：占位词随 kind 切换；410 错误文案＋"去更换配对码"按钮 emit `change-code`；draft 经 `v-model` 上提后换码重挂保留；成功态按钮文案/复位、失败抖动 class、reduced-motion 样式存在。
- `workspace-inbox.test.ts`（或 App 级）：清除触发 `revokeInboxKey`（旧码）、轮换触发（旧码≠新码）、保存同码不触发、注销失败出现警告气泡。
- `app-render.test.ts` 或新增：切到已配对工作区立即调用拉取、切到未配对不发请求。
- `i18n.test.ts`：新增键在 zh/en 双语齐全。

## 发布

- 后端：aliyun 手动建表 → `server/deploy.sh` 发布。
- 前端：`src/state/changelog.ts` 增加更新日志条目、版本号 bump，走既有 release 流程（单独提交）。
