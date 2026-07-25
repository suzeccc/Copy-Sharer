import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { initializeI18n, setUiLanguage } from "./i18n";
import { getConfig, onAppEvent } from "./lib/tauri";
import router from "./router";
import "./style.css";

async function bootstrap() {
  const isTauriRuntime = "__TAURI_INTERNALS__" in window;
  const initialConfig = isTauriRuntime
    ? await getConfig().catch(() => null)
    : null;
  initializeI18n(initialConfig?.uiLanguage ?? "system");
  if (isTauriRuntime) {
    await onAppEvent("config-updated", (config) => {
      const nextConfig = config as { uiLanguage?: "system" | "zh-CN" | "en-US" };
      setUiLanguage(nextConfig.uiLanguage ?? "system");
    }).catch(() => undefined);
  }

  createApp(App).use(createPinia()).use(router).mount("#app");
}

void bootstrap();
