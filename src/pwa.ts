import { ref } from "vue";

export const SW_REGISTER_URL = "/sw.js";

/** 新版 Service Worker 已进入 waiting（通道 2 更新就绪），供版本红点消费。 */
export const swUpdateReady = ref(false);

/** 生产环境注册 Service Worker 并监听新 SW 进入 waiting；开发环境与不支持环境直接跳过。 */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_REGISTER_URL);
    if (registration.waiting) swUpdateReady.value = true;

    const watchInstallingWorker = (): void => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // controller 存在说明这是一次更新而非首次安装。
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          swUpdateReady.value = true;
        }
      });
    };

    // 注册返回时可能已有 worker 在安装（updatefound 早于监听器挂载就触发过），立即补挂。
    watchInstallingWorker();
    registration.addEventListener("updatefound", watchInstallingWorker);
  } catch {
    // 注册失败静默降级：应用本身不依赖 SW（spec §7）。
  }
}

/** 让 waiting 中的新 SW 立即接管；随后由调用方清空缓存并刷新。 */
export async function activateWaitingServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // 无注册或 postMessage 失败都不阻塞更新流程。
  }
}
