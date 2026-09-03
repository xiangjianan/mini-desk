export const INBOX_POLISH_PREF_KEY = "mini-desk-inbox-polish";

/** 手机速记 AI 润色开关：默认关闭（原文直存），开启后发送内容经服务端 LLM 润色再同步到桌面端。
 *  仅存手机浏览器本地，不进桌面端 state（换设备需重新选择）。 */
export function loadInboxPolishPref(storage: Storage = localStorage): boolean {
  return storage.getItem(INBOX_POLISH_PREF_KEY) === "1";
}

/** 调用方仅在用户切换开关时写入；load 侧对非法值自愈为默认关闭。 */
export function saveInboxPolishPref(enabled: boolean, storage: Storage = localStorage): void {
  storage.setItem(INBOX_POLISH_PREF_KEY, enabled ? "1" : "0");
}
