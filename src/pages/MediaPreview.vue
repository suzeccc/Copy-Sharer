<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import FolderOpen from "lucide-vue-next/dist/esm/icons/folder-open.js";
import ImageIcon from "lucide-vue-next/dist/esm/icons/image.js";
import Minus from "lucide-vue-next/dist/esm/icons/minus.js";
import PlaySquare from "lucide-vue-next/dist/esm/icons/square-play.js";
import RotateCcw from "lucide-vue-next/dist/esm/icons/rotate-ccw.js";
import ZoomIn from "lucide-vue-next/dist/esm/icons/zoom-in.js";
import ZoomOut from "lucide-vue-next/dist/esm/icons/zoom-out.js";
import X from "lucide-vue-next/dist/esm/icons/x.js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import HistoryImageThumb from "@/components/history/HistoryImageThumb.vue";
import {
  getNextMediaPreviewImageOffset,
  getNextMediaPreviewImageScale,
  MEDIA_PREVIEW_IMAGE_MIN_SCALE,
  shouldPanMediaPreviewImage,
  type MediaPreviewImagePoint,
} from "@/lib/mediaPreviewImagePanZoom";
import type { MediaPreviewKind, MediaPreviewPayload } from "@/lib/tauri";
import {
  closeWindow,
  getConfig,
  minimizeWindow,
  onAppEvent,
  openHistoryFileLocation,
  startWindowDrag,
} from "@/lib/tauri";
import { startWindowDragFromMouseEvent } from "@/lib/windowDrag";
import { useToastStore } from "@/stores/toasts";
import type { AppConfig, AppTheme } from "@/types/config";

const route = useRoute();
const toastStore = useToastStore();

const previewKind = ref<MediaPreviewKind>("image");
const historyId = ref("");
const title = ref("媒体预览");
const videoSrc = ref("");
const videoError = ref("");
const videoRef = ref<HTMLVideoElement | null>(null);
const imagePreviewScale = ref(MEDIA_PREVIEW_IMAGE_MIN_SCALE);
const imagePreviewOffset = ref<MediaPreviewImagePoint>({ x: 0, y: 0 });
const isImagePreviewPanning = ref(false);
const imagePreviewDragPointerId = ref<number | null>(null);
let mediaPreviewUnlisten: UnlistenFn | null = null;
let themeUnlisten: UnlistenFn | null = null;
let isUnmounted = false;
let imagePreviewDragOriginPointer: MediaPreviewImagePoint | null = null;
let imagePreviewDragOriginOffset: MediaPreviewImagePoint | null = null;

const isImage = computed(() => previewKind.value === "image");
const isVideo = computed(() => previewKind.value === "video");
const subtitle = computed(() => (isImage.value ? "图片预览" : "视频预览"));
const imagePreviewZoomLabel = computed(() => `${Math.round(imagePreviewScale.value * 100)}%`);
const imagePreviewTransformStyle = computed(() => ({
  cursor: shouldPanMediaPreviewImage(imagePreviewScale.value)
    ? isImagePreviewPanning.value
      ? "grabbing"
      : "grab"
    : "zoom-in",
  transform: `translate3d(${imagePreviewOffset.value.x}px, ${imagePreviewOffset.value.y}px, 0) scale(${imagePreviewScale.value})`,
  transition: isImagePreviewPanning.value ? "none" : "transform 140ms ease",
}));

function queryValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function payloadFromRoute(): MediaPreviewPayload {
  const kind = queryValue(route.query.kind) === "video" ? "video" : "image";
  return {
    kind,
    historyId: queryValue(route.query.historyId),
    title: queryValue(route.query.title) || "媒体预览",
    src: queryValue(route.query.src) || undefined,
  };
}

function releaseVideoElement() {
  const video = videoRef.value;
  if (!video) {
    return;
  }

  video.pause();
  video.removeAttribute("src");
  video.load();
}

function resetImagePreviewTransform() {
  finishImagePreviewDrag();
  imagePreviewScale.value = MEDIA_PREVIEW_IMAGE_MIN_SCALE;
  imagePreviewOffset.value = { x: 0, y: 0 };
}

function setImagePreviewScale(nextScale: number) {
  imagePreviewScale.value = nextScale;
  if (nextScale === MEDIA_PREVIEW_IMAGE_MIN_SCALE) {
    imagePreviewOffset.value = { x: 0, y: 0 };
    finishImagePreviewDrag();
  }
}

function zoomImageIn() {
  setImagePreviewScale(getNextMediaPreviewImageScale(imagePreviewScale.value, -120));
}

function zoomImageOut() {
  setImagePreviewScale(getNextMediaPreviewImageScale(imagePreviewScale.value, 120));
}

function applyMediaPreviewPayload(payload: MediaPreviewPayload) {
  resetImagePreviewTransform();
  releaseVideoElement();
  previewKind.value = payload.kind;
  historyId.value = payload.historyId;
  title.value = payload.title || "媒体预览";
  videoSrc.value = payload.kind === "video" ? payload.src ?? "" : "";
  videoError.value = "";
}

function applyMediaPreviewTheme(theme: AppTheme) {
  document.documentElement.dataset.appTheme = theme;
  document.body.dataset.appTheme = theme;
}

async function bindMediaPreviewTheme() {
  try {
    const config = await getConfig();
    if (!isUnmounted) {
      applyMediaPreviewTheme(config.theme);
    }
  } catch (error) {
    console.warn("Unable to load media preview theme", error);
  }

  const unlisten = await onAppEvent<AppConfig>("config-updated", (config) => {
    applyMediaPreviewTheme(config.theme);
  });

  if (isUnmounted) {
    unlisten();
    return;
  }

  themeUnlisten = unlisten;
}

async function bindMediaPreviewPayloadUpdates() {
  const unlisten = await listen<MediaPreviewPayload>(
    "media-preview-open",
    (event) => {
      applyMediaPreviewPayload(event.payload);
    },
  );

  if (isUnmounted) {
    unlisten();
    return;
  }

  mediaPreviewUnlisten = unlisten;
}

function handleWindowDrag(event: MouseEvent) {
  startWindowDragFromMouseEvent(event, startWindowDrag);
}

function finishImagePreviewDrag(event?: Event) {
  if (
    event instanceof PointerEvent &&
    event.currentTarget instanceof HTMLElement &&
    imagePreviewDragPointerId.value === event.pointerId &&
    event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  isImagePreviewPanning.value = false;
  imagePreviewDragPointerId.value = null;
  imagePreviewDragOriginPointer = null;
  imagePreviewDragOriginOffset = null;
}

function pointerFromEvent(event: MouseEvent | PointerEvent): MediaPreviewImagePoint {
  return { x: event.clientX, y: event.clientY };
}

function handleImagePreviewWheel(event: WheelEvent) {
  setImagePreviewScale(getNextMediaPreviewImageScale(imagePreviewScale.value, event.deltaY));
}

function handleImagePreviewDragPress(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  isImagePreviewPanning.value = true;
  imagePreviewDragPointerId.value = event.pointerId;
  imagePreviewDragOriginPointer = pointerFromEvent(event);
  imagePreviewDragOriginOffset = { ...imagePreviewOffset.value };
}

function handleImagePreviewDragMove(event: PointerEvent) {
  if (
    !isImagePreviewPanning.value ||
    imagePreviewDragPointerId.value !== event.pointerId ||
    !imagePreviewDragOriginPointer ||
    !imagePreviewDragOriginOffset
  ) {
    return;
  }

  imagePreviewOffset.value = getNextMediaPreviewImageOffset(
    imagePreviewDragOriginOffset,
    imagePreviewDragOriginPointer,
    pointerFromEvent(event),
  );
}

function handleVideoPreviewError() {
  if (videoError.value) {
    return;
  }

  videoError.value = "无法播放此视频，可能是文件编码不受当前播放器支持。";
  toastStore.error("无法播放此视频");
}

async function revealSourceFile() {
  if (!historyId.value) {
    return;
  }

  try {
    await openHistoryFileLocation(historyId.value);
  } catch (error) {
    toastStore.error(`打开文件位置失败：${String(error)}`);
  }
}

function handlePreviewKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    void closeWindow();
    return;
  }
  if (!isImage.value) {
    return;
  }
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomImageIn();
  } else if (event.key === "-") {
    event.preventDefault();
    zoomImageOut();
  } else if (event.key === "0") {
    event.preventDefault();
    resetImagePreviewTransform();
  }
}

onMounted(async () => {
  isUnmounted = false;
  applyMediaPreviewPayload(payloadFromRoute());
  window.addEventListener("keydown", handlePreviewKeydown);
  void bindMediaPreviewTheme();
  void bindMediaPreviewPayloadUpdates();
});

onUnmounted(() => {
  isUnmounted = true;
  mediaPreviewUnlisten?.();
  mediaPreviewUnlisten = null;
  themeUnlisten?.();
  themeUnlisten = null;
  window.removeEventListener("keydown", handlePreviewKeydown);
  finishImagePreviewDrag();
  releaseVideoElement();
});
</script>

<template>
  <section
    data-media-preview-window
    data-media-preview-transparent-canvas
    class="relative h-screen w-screen overflow-hidden bg-transparent text-slate-100"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-px rounded-[17px] border border-white/[0.08] bg-black/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_55px_rgba(0,0,0,0.18)] backdrop-blur-[3px]"
    />

    <header
      class="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3"
      data-window-drag-region
      @mousedown.capture="handleWindowDrag"
    >
      <div
        data-media-preview-glass-chrome
        class="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.14] bg-[#0c1218]/65 p-1.5 pr-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
        data-window-drag-region
      >
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.07] text-[color:var(--accent-text)]">
          <ImageIcon v-if="isImage" class="h-4 w-4" />
          <PlaySquare v-else class="h-4 w-4" />
        </span>
        <div class="min-w-0" data-window-drag-region>
          <p data-i18n-ignore class="max-w-[360px] truncate text-[13px] font-semibold text-white/95">{{ title }}</p>
          <p class="text-[10px] font-medium tracking-[0.08em] text-white/55">{{ subtitle }}</p>
        </div>
      </div>
      <div
        data-media-preview-glass-chrome
        class="flex shrink-0 items-center gap-1 rounded-xl border border-white/[0.14] bg-[#0c1218]/65 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
      >
        <button
          data-media-preview-minimize-button
          class="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-white/75 transition hover:border-white/10 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)]"
          type="button"
          aria-label="隐藏预览"
          title="隐藏"
          data-window-control
          @click="minimizeWindow"
        >
          <Minus class="h-4 w-4" />
        </button>
        <button
          class="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-white/75 transition hover:border-red-300/20 hover:bg-red-500/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50"
          type="button"
          aria-label="关闭预览"
          title="关闭"
          data-window-control
          @click="closeWindow"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main class="absolute inset-0 overflow-hidden px-3 pb-[4.75rem] pt-[4.75rem]">
      <div
        v-if="isImage"
        class="relative grid h-full touch-none place-items-center overflow-hidden rounded-2xl border border-white/[0.10] bg-black/[0.08] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
        data-media-preview-image-drag-surface
        @wheel.prevent="handleImagePreviewWheel"
        @pointerdown.left="handleImagePreviewDragPress"
        @pointermove="handleImagePreviewDragMove"
        @pointerup="finishImagePreviewDrag"
        @pointercancel="finishImagePreviewDrag"
        @lostpointercapture="finishImagePreviewDrag"
        @contextmenu="finishImagePreviewDrag"
        @dragstart.prevent="finishImagePreviewDrag"
      >
        <HistoryImageThumb
          v-if="historyId"
          data-media-preview-image
          :history-id="historyId"
          :max-size="1600"
          variant="preview"
          :alt="title"
          class="!border-white/[0.12] !bg-black/[0.10] shadow-[0_22px_54px_rgba(0,0,0,0.42)] max-h-full max-w-full select-none rounded-xl object-contain will-change-transform"
          :style="imagePreviewTransformStyle"
          draggable="false"
        />
      </div>

      <div v-else class="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3">
        <div class="overflow-hidden rounded-2xl border border-white/[0.12] bg-black/45 shadow-[0_22px_54px_rgba(0,0,0,0.42)]">
          <video
            v-if="videoSrc"
            ref="videoRef"
            data-media-preview-video
            :src="videoSrc"
            class="h-full max-h-full w-full bg-black object-contain"
            preload="metadata"
            controls
            autoplay
            playsinline
            @error="handleVideoPreviewError"
          />
          <p
            v-else
            class="grid h-full place-items-center px-5 text-center text-sm font-medium text-[color:var(--floating-muted-text)]"
          >
            暂无可预览的视频文件
          </p>
        </div>
        <div
          v-if="videoError"
          class="flex items-center justify-between gap-3 rounded-xl border border-amber-200/20 bg-[#18140b]/70 px-3 py-2 text-xs font-medium text-amber-100 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl"
        >
          <span>{{ videoError }}</span>
          <button
            class="shrink-0 rounded-md border border-amber-200/20 px-2 py-1 transition hover:bg-amber-200/10"
            type="button"
            @click="revealSourceFile"
          >
            打开位置
          </button>
        </div>
      </div>
    </main>

    <div
      v-if="isImage"
      data-media-preview-glass-toolbar
      class="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/[0.14] bg-[#0c1218]/75 p-1.5 text-white shadow-[0_14px_38px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
    >
      <button
        class="grid h-8 w-8 place-items-center rounded-lg text-white/72 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)] disabled:cursor-default disabled:opacity-35"
        type="button"
        aria-label="缩小图片"
        title="缩小"
        :disabled="imagePreviewScale === MEDIA_PREVIEW_IMAGE_MIN_SCALE"
        @click="zoomImageOut"
      >
        <ZoomOut class="h-4 w-4" />
      </button>
      <span
        data-media-preview-zoom-label
        class="min-w-[52px] px-1 text-center font-mono text-[11px] font-semibold tabular-nums text-white/88"
      >
        {{ imagePreviewZoomLabel }}
      </span>
      <button
        class="grid h-8 w-8 place-items-center rounded-lg text-white/72 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)]"
        type="button"
        aria-label="放大图片"
        title="放大"
        @click="zoomImageIn"
      >
        <ZoomIn class="h-4 w-4" />
      </button>
      <span aria-hidden="true" class="mx-1 h-5 w-px bg-white/[0.12]" />
      <button
        class="grid h-8 w-8 place-items-center rounded-lg text-white/72 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)]"
        type="button"
        aria-label="重置图片"
        title="重置缩放"
        @click="resetImagePreviewTransform"
      >
        <RotateCcw class="h-4 w-4" />
      </button>
      <button
        v-if="historyId"
        class="grid h-8 w-8 place-items-center rounded-lg text-white/72 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-line)]"
        type="button"
        aria-label="打开文件位置"
        title="打开文件位置"
        @click="revealSourceFile"
      >
        <FolderOpen class="h-4 w-4" />
      </button>
    </div>

    <span
      class="pointer-events-none absolute bottom-4 right-4 z-20 hidden items-center gap-1 rounded-lg border border-white/[0.10] bg-black/40 px-2 py-1 text-[10px] font-medium text-white/55 backdrop-blur-xl sm:flex"
    >
      <kbd class="rounded border border-white/10 bg-white/[0.06] px-1 font-mono text-[9px] text-white/70">Esc</kbd>
      关闭
    </span>
  </section>
</template>
