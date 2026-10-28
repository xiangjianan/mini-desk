import { createApp } from "vue";
import "./styles.css";
import "./desk.css";
import "./mobile.css";
import App from "./App.vue";
import { registerServiceWorker } from "./pwa";
import { preventNativeContextMenu } from "./utils/contextMenu";
import { trackPointerButtonFocus } from "./utils/pointerButtonFocus";

document.addEventListener("contextmenu", preventNativeContextMenu, true);
trackPointerButtonFocus(document);

createApp(App).mount("#app");
void registerServiceWorker();
