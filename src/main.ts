import { createApp } from "vue";
import "./styles.css";
import "./desk.css";
import App from "./App.vue";
import { registerServiceWorker } from "./pwa";
import { preventNativeContextMenu } from "./utils/contextMenu";

document.addEventListener("contextmenu", preventNativeContextMenu, true);

createApp(App).mount("#app");
void registerServiceWorker();
