<script setup lang="ts">
import LoaderCircle from "lucide-vue-next/dist/esm/icons/loader-circle.js";
import { nextTick, ref, watch } from "vue";

import ConnectionBadge from "@/components/status/ConnectionBadge.vue";
import Button from "@/components/ui/Button.vue";
import RefreshButton from "@/components/ui/RefreshButton.vue";
import { clampPort } from "@/lib/format";
import { useConfigStore } from "@/stores/config";
import { useStatusStore } from "@/stores/status";
import { useToastStore } from "@/stores/toasts";

const configStore = useConfigStore();
const statusStore = useStatusStore();
const toastStore = useToastStore();
const editingPort = ref(false);
const portSaving = ref(false);
const portDraft = ref(configStore.config.port);
const portInput = ref<HTMLInputElement | null>(null);

watch(
  () => configStore.config.port,
  (port) => {
    if (!editingPort.value) portDraft.value = port;
  },
);

withDefaults(
  defineProps<{
    switchingWindowMode?: boolean;
  }>(),
  {
    switchingWindowMode: false,
  },
);

const emit = defineEmits<{
  (event: "switch-floating", pointer: { clientX: number; clientY: number; screenX: number; screenY: number }): void;
}>();

function switchFloating(event: MouseEvent) {
  emit("switch-floating", {
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
  });
}

async function beginPortEdit() {
  if (portSaving.value) return;
  portDraft.value = configStore.config.port;
  editingPort.value = true;
  await nextTick();
  portInput.value?.select();
}

function cancelPortEdit() {
  if (portSaving.value) return;
  portDraft.value = configStore.config.port;
  editingPort.value = false;
}

async function savePort() {
  if (portSaving.value || configStore.saving) return;

  const port = clampPort(portDraft.value);
  portDraft.value = port;
  if (port === configStore.config.port) {
    editingPort.value = false;
    return;
  }

  portSaving.value = true;
  const wasRunning = statusStore.status.running;
  try {
    if (wasRunning) {
      await statusStore.stop();
      if (statusStore.error) {
        portDraft.value = configStore.config.port;
        toastStore.error(`停止同步失败：${statusStore.error}`);
        return;
      }
    }

    await configStore.save({
      ...configStore.config,
      port,
    });

    if (configStore.error) {
      portDraft.value = configStore.config.port;
      toastStore.error(`监听端口保存失败：${configStore.error}`);
      if (wasRunning) await statusStore.start();
      return;
    }

    editingPort.value = false;
    if (wasRunning) {
      await statusStore.start();
      if (statusStore.error) {
        toastStore.error(`端口已改为 ${port}，同步启动失败：${statusStore.error}`);
        return;
      }
    }
    toastStore.success(`监听端口已切换为 ${port}`);
  } finally {
    portSaving.value = false;
  }
}
</script>

<template>
  <header class="flex h-16 items-center justify-between border-b border-[color:var(--main-line)] bg-[color:var(--main-bg)] px-6">
    <div class="min-w-0">
      <p class="text-xs text-slate-500">桌面同步控制台</p>
      <p class="truncate text-sm font-medium text-slate-200">
          <span data-i18n-ignore>{{ statusStore.status.deviceName }}</span> · {{ statusStore.status.localIp || "等待网络地址" }}
      </p>
    </div>
    <div class="flex items-center gap-3">
      <ConnectionBadge :state="statusStore.status.state" :label="statusStore.statusLabel" />
      <form
        v-if="editingPort"
        data-titlebar-port-editor
        class="relative flex h-8 w-[108px] items-center gap-2 rounded-lg border border-[color:var(--accent-line)] bg-[color:var(--main-bg-muted)] px-3 shadow-[0_0_0_2px_var(--accent-soft)]"
        :aria-busy="portSaving"
        @submit.prevent="savePort"
      >
        <span class="shrink-0 text-[12px] font-semibold text-[color:var(--muted-text)]">端口</span>
        <label for="titlebar-listen-port" class="sr-only">监听端口</label>
        <input
          id="titlebar-listen-port"
          ref="portInput"
          v-model.number="portDraft"
          class="min-w-0 flex-1 bg-transparent pr-3 text-right font-mono text-[13px] font-bold tabular-nums text-white outline-none"
          type="number"
          min="1"
          max="65535"
          :disabled="portSaving"
          aria-label="监听端口"
          @blur="savePort"
          @keydown.esc.prevent="cancelPortEdit"
        >
        <LoaderCircle
          v-if="portSaving"
          class="absolute right-2 h-3 w-3 animate-spin text-[color:var(--accent-text)]"
        />
      </form>
      <button
        v-else
        data-titlebar-port
        type="button"
        class="inline-flex h-8 w-[108px] cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--main-line-soft)] bg-[color:var(--stat-bg)] px-3 text-slate-300 transition duration-150 hover:border-[color:var(--main-line)] hover:bg-[color:var(--main-bg-muted)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)] disabled:cursor-not-allowed disabled:opacity-50"
        title="点击修改监听端口"
        :aria-label="`监听端口 ${configStore.config.port}，点击修改监听端口`"
        :disabled="portSaving"
        @click="beginPortEdit"
      >
        <span class="shrink-0 text-[12px] font-semibold text-[color:var(--muted-text)]">端口</span>
        <span class="min-w-0 flex-1 text-right font-mono text-[13px] font-bold tabular-nums text-slate-100">{{ configStore.config.port }}</span>
      </button>
      <RefreshButton :refresh="() => statusStore.refresh()" :failed="() => Boolean(statusStore.error)" />
      <Button
        variant="ghost"
        size="sm"
        :disabled="switchingWindowMode"
        @click="switchFloating"
      >
        {{ switchingWindowMode ? "切换中" : "切换浮窗" }}
      </Button>
    </div>
  </header>
</template>
