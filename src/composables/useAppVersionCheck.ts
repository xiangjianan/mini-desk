import { ref } from "vue";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  clearStaticCaches,
  fetchLatestAppVersion,
  getIndexAppVersion,
  getStoredAppVersion,
  markAppVersionSeen,
} from "../state/version";

/**
 * App version watcher: seeds the running version, polls the deployed
 * index.html for a newer one, and marks the running version as seen in
 * localStorage so a fresh visit doesn't re-prompt.
 */
export function useAppVersionCheck(isMounted: () => boolean) {
  const appVersion = ref(getIndexAppVersion());
  const availableAppVersion = ref(appVersion.value);
  const storedAppVersion = ref<string | null>(null);
  const versionPromptVisible = ref(false);
  const versionCheckTimer = ref<number | undefined>();

  function checkAppVersion(): void {
    storedAppVersion.value = getStoredAppVersion();
    if (storedAppVersion.value !== appVersion.value) {
      markAppVersionSeen(appVersion.value);
      storedAppVersion.value = appVersion.value;
    }
    availableAppVersion.value = appVersion.value;
    versionPromptVisible.value = false;
  }

  async function checkLatestAppVersion(): Promise<void> {
    const latestVersion = await fetchLatestAppVersion();
    if (!isMounted() || !latestVersion) return;

    if (latestVersion === appVersion.value) {
      availableAppVersion.value = appVersion.value;
      versionPromptVisible.value = false;
      return;
    }

    availableAppVersion.value = latestVersion;
    versionPromptVisible.value = true;
  }

  async function updateStaticVersion(): Promise<void> {
    await clearStaticCaches();
    versionPromptVisible.value = false;
    window.location.reload();
  }

  function startPolling(): void {
    versionCheckTimer.value = window.setInterval(() => {
      void checkLatestAppVersion();
    }, APP_VERSION_CHECK_INTERVAL_MS);
  }

  function clearTimers(): void {
    window.clearInterval(versionCheckTimer.value);
    versionCheckTimer.value = undefined;
  }

  return {
    appVersion,
    availableAppVersion,
    storedAppVersion,
    versionPromptVisible,
    checkAppVersion,
    checkLatestAppVersion,
    updateStaticVersion,
    startPolling,
    clearTimers,
  };
}
