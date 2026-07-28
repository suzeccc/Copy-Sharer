<script setup lang="ts">
import { computed, ref } from "vue";

import DeviceCard from "@/components/devices/DeviceCard.vue";
import ManualConnectForm from "@/components/devices/ManualConnectForm.vue";
import MobileConnectDialog from "@/components/mobile/MobileConnectDialog.vue";
import NetworkDiagnosticsDialog from "@/components/settings/NetworkDiagnosticsDialog.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import RefreshButton from "@/components/ui/RefreshButton.vue";
import {
  getNetworkDiagnostics,
  openWindowsNetworkSettings,
  repairWindowsFirewall,
} from "@/lib/tauri";
import { useDevicesStore } from "@/stores/devices";
import { useStatusStore } from "@/stores/status";
import { useToastStore } from "@/stores/toasts";
import type { NetworkDiagnosticReport } from "@/types/networkDiagnostics";

const devicesStore = useDevicesStore();
const statusStore = useStatusStore();
const toastStore = useToastStore();
const lanDiscoveryScanning = ref(false);
const showMobileConnectDialog = ref(false);
const networkDiagnosticsDialogOpen = ref(false);
const networkDiagnostics = ref<NetworkDiagnosticReport | null>(null);
const networkDiagnosticsLoading = ref(false);
const networkDiagnosticsRepairing = ref(false);
const networkDiagnosticsError = ref("");
const LAN_DISCOVERY_SETTLE_TIMEOUT_MS = 9000;
const LAN_DISCOVERY_SETTLE_POLL_MS = 120;
const LAN_DISCOVERY_RESPONSE_GRACE_MS = 600;
const recentIps = computed(() =>
  Array.from(
    new Set(
      devicesStore.history
        .map((device) => device.ip.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8),
);
const connectionError = computed(() => devicesStore.error || statusStore.error);
const networkDiagnosticSummary = computed(() => {
  if (networkDiagnosticsLoading.value) return "正在检查网络环境...";
  if (networkDiagnosticsError.value) return "诊断未完成";
  if (!networkDiagnostics.value) return "尚未检测";

  const errorCount = networkDiagnostics.value.checks.filter(
    (item) => item.status === "error",
  ).length;
  const warningCount = networkDiagnostics.value.checks.filter(
    (item) => item.status === "warning" || item.status === "unknown",
  ).length;
  if (errorCount > 0) return `发现 ${errorCount} 项需要处理`;
  if (warningCount > 0) return `${warningCount} 项需要确认`;
  return "局域网入口检查正常";
});

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function hasDiscoveredOnlineDevices() {
  return devicesStore.history.some(
    (device) => !device.connected && device.status === "online",
  );
}

async function waitForLanDiscoveryToSettle(previousScanId: number | null) {
  const deadline = Date.now() + LAN_DISCOVERY_SETTLE_TIMEOUT_MS;
  let finishedAtSeenAt: number | null = null;
  while (Date.now() < deadline) {
    const progress = devicesStore.lanDiscoveryProgress;
    if (hasDiscoveredOnlineDevices()) {
      return;
    }
    if (progress && progress.scanId !== previousScanId && !progress.running) {
      finishedAtSeenAt ??= Date.now();
      if (Date.now() - finishedAtSeenAt >= LAN_DISCOVERY_RESPONSE_GRACE_MS) {
        return;
      }
    }
    await delay(LAN_DISCOVERY_SETTLE_POLL_MS);
  }
}

async function scanLanDevices() {
  if (lanDiscoveryScanning.value) {
    return;
  }

  lanDiscoveryScanning.value = true;
  const knownDeviceIds = new Set(devicesStore.history.map((device) => device.id));
  const previousScanId = devicesStore.lanDiscoveryProgress?.scanId ?? null;
  toastStore.info("正在扫描局域网设备...");

  try {
    await devicesStore.refresh();
    await waitForLanDiscoveryToSettle(previousScanId);
    const discoveredDevices = devicesStore.history.filter(
      (device) => !device.connected && device.status === "online",
    );
    const newDeviceCount = discoveredDevices.filter(
      (device) => !knownDeviceIds.has(device.id),
    ).length;

    if (newDeviceCount > 0) {
      toastStore.success(`发现 ${newDeviceCount} 台新设备`);
      return;
    }

    if (discoveredDevices.length > 0) {
      toastStore.success(`已发现 ${discoveredDevices.length} 台局域网设备`);
      return;
    }

    toastStore.info("未发现局域网设备，请确认对方已启动 CopyShare 并允许防火墙访问");
  } catch (error) {
    toastStore.error(error instanceof Error ? error.message : "扫描局域网设备失败");
  } finally {
    lanDiscoveryScanning.value = false;
  }
}

function openNetworkDiagnosticsDialog() {
  networkDiagnosticsDialogOpen.value = true;
  if (!networkDiagnostics.value && !networkDiagnosticsLoading.value) {
    void loadNetworkDiagnostics();
  }
}

async function loadNetworkDiagnostics(showSuccess = false) {
  if (networkDiagnosticsLoading.value || networkDiagnosticsRepairing.value) return;

  networkDiagnosticsLoading.value = true;
  networkDiagnosticsError.value = "";
  try {
    networkDiagnostics.value = await getNetworkDiagnostics();
    if (showSuccess) toastStore.success("网络诊断已刷新");
  } catch (error) {
    networkDiagnosticsError.value = String(error);
  } finally {
    networkDiagnosticsLoading.value = false;
  }
}

async function repairFirewall() {
  if (networkDiagnosticsLoading.value || networkDiagnosticsRepairing.value) return;

  networkDiagnosticsRepairing.value = true;
  networkDiagnosticsError.value = "";
  try {
    networkDiagnostics.value = await repairWindowsFirewall();
    toastStore.success("CopyShare 专用网络防火墙规则已修复");
  } catch (error) {
    networkDiagnosticsError.value = String(error);
    toastStore.error(`防火墙修复失败：${String(error)}`);
  } finally {
    networkDiagnosticsRepairing.value = false;
  }
}

async function openSystemNetworkSettings() {
  try {
    await openWindowsNetworkSettings();
  } catch (error) {
    toastStore.error(`无法打开 Windows 网络设置：${String(error)}`);
  }
}
</script>

<template>
  <div class="grid gap-6">
    <section
      class="grid gap-5"
      :class="[
        devicesStore.connected.length ? 'xl:grid-cols-[0.85fr_1.15fr]' : '',
      ]"
    >
      <Card>
        <p class="text-sm font-semibold text-white">快速配置</p>
        <p class="mt-2 text-sm leading-6 text-[color:var(--muted-text)]">
          CopyShare 会自动发现同一局域网内正在运行的设备；也可以手动输入对方 IPv4 地址和端口连接。要双向同步，两台电脑都需要在设备列表里信任对方。
        </p>
        <div data-device-action-grid class="mt-5 grid gap-3 lg:grid-cols-2">
          <div
            data-lan-discovery-card
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--main-line-soft)] bg-[color:var(--field-bg)] p-4"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-white">局域网自动发现</p>
              <p class="mt-1 text-xs leading-5 text-[color:var(--muted-text)]">扫描同网段 CopyShare 电脑设备。</p>
            </div>
            <Button
              data-lan-discovery-scan-button
              class="shrink-0"
              variant="secondary"
              :disabled="devicesStore.loading || lanDiscoveryScanning"
              @click="scanLanDevices"
            >
              {{ lanDiscoveryScanning ? "正在扫描..." : "扫描局域网设备" }}
            </Button>
          </div>
          <div
            data-mobile-connect-card
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--main-line-soft)] bg-[color:var(--field-bg)] p-4"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-white">手机连接</p>
              <p class="mt-1 text-xs leading-5 text-[color:var(--muted-text)]">手机扫码临时传输剪贴板，无需安装 App。</p>
            </div>
            <Button
              data-mobile-connect-dialog-button
              class="shrink-0"
              variant="secondary"
              @click="showMobileConnectDialog = true"
            >
              打开二维码连接
            </Button>
          </div>
        </div>
        <div class="mt-4 rounded-lg border border-[color:var(--main-line-soft)] bg-[color:var(--panel-bg-soft)] p-4">
          <ManualConnectForm
            :ip="devicesStore.connectDraft.ip"
            :port="devicesStore.connectDraft.port"
            :recent-ips="recentIps"
            :loading="devicesStore.loading"
            @update:ip="devicesStore.setConnectDraftIp"
            @update:port="devicesStore.setConnectDraftPort"
            @connect="devicesStore.connect"
          />
        </div>
        <div
          v-if="connectionError"
          data-device-connection-error
          class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100"
        >
          <p class="min-w-0 flex-1">{{ connectionError }}</p>
          <Button
            data-device-network-diagnostics-button
            class="shrink-0"
            size="sm"
            variant="secondary"
            @click="openNetworkDiagnosticsDialog"
          >
            开始诊断
          </Button>
        </div>
      </Card>

      <Card v-if="devicesStore.connected.length">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-white">已连接设备</p>
            <p class="mt-2 text-sm text-[color:var(--muted-text)]">已信任并保持连接的设备，只保留断开操作。</p>
          </div>
          <RefreshButton :refresh="() => devicesStore.refresh()" :failed="() => Boolean(devicesStore.error)" />
        </div>
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          <DeviceCard
            v-for="device in devicesStore.connected"
            :key="device.id"
            :device="device"
            mode="connected"
            @disconnect="devicesStore.disconnect"
            @reject="devicesStore.reject"
            @trust="devicesStore.trust"
          />
        </div>
      </Card>
    </section>

    <Card>
      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-white">历史连接设备列表</p>
          <p class="mt-1 text-xs text-[color:var(--muted-text)]">连接成功、等待确认和已断开的设备都会保留在这里。</p>
        </div>
      </div>
      <div v-if="devicesStore.history.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DeviceCard
          v-for="device in devicesStore.history"
          :key="device.id"
          :device="device"
          mode="status"
          @disconnect="devicesStore.disconnect"
          @reconnect="devicesStore.connect"
          @reject="devicesStore.reject"
          @trust="devicesStore.trust"
        />
      </div>
      <div v-else class="rounded-lg border border-dashed border-[color:var(--main-line-soft)] px-4 py-10 text-center text-sm text-[color:var(--subtle-text)]">
        输入对方 IP 后点击“连接”，设备会作为历史记录显示在这里。
      </div>
    </Card>

    <MobileConnectDialog v-model="showMobileConnectDialog" />
    <NetworkDiagnosticsDialog
      :open="networkDiagnosticsDialogOpen"
      :report="networkDiagnostics"
      :loading="networkDiagnosticsLoading"
      :repairing="networkDiagnosticsRepairing"
      :error="networkDiagnosticsError"
      :summary="networkDiagnosticSummary"
      @close="networkDiagnosticsDialogOpen = false"
      @refresh="loadNetworkDiagnostics(true)"
      @repair="repairFirewall"
      @open-network-settings="openSystemNetworkSettings"
    />
  </div>
</template>
