import { createApp } from "vue";
import "./styles.css";
import App from "./App.vue";
import { registerServiceWorker } from "./pwa";

createApp(App).mount("#app");
void registerServiceWorker();
