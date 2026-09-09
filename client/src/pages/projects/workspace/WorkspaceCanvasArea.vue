<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/useProjectStore';
import CanvasPanel from '@/components/editor/CanvasPanel.vue';
import Timeline from '@/components/editor/timeline/Timeline.vue';

const props = defineProps<{
  isEpisodeLoading: boolean;
}>();

const { t } = useI18n();
const projectStore = useProjectStore();

const timelineHeight = ref(150);
const isResizingTimeline = ref(false);
const previewContainerRef = ref<HTMLElement | null>(null);
const canvasDimensions = ref({ width: 320, height: 568 });
let previewResizeObserver: ResizeObserver | null = null;

function updateCanvasFit() {
  if (!previewContainerRef.value) return;
  const rect = previewContainerRef.value.getBoundingClientRect();
  const padX = 48;
  const padY = 96;
  const maxW = Math.max(160, rect.width - padX);
  const maxH = Math.max(200, rect.height - padY);

  const targetW = projectStore.canvasSize?.width || 1080;
  const targetH = projectStore.canvasSize?.height || 1920;
  const aspect = targetW / targetH;

  let fittedW = maxH * aspect;
  let fittedH = maxH;
  if (fittedW > maxW) {
    fittedW = maxW;
    fittedH = fittedW / aspect;
  }
  canvasDimensions.value = {
    width: Math.round(fittedW),
    height: Math.round(fittedH),
  };
}

function startTimelineResize(e: MouseEvent) {
  isResizingTimeline.value = true;
  const startY = e.clientY;
  const startHeight = timelineHeight.value;

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaY = startY - moveEvent.clientY;
    const newHeight = Math.min(650, Math.max(160, startHeight + deltaY));
    timelineHeight.value = newHeight;
    updateCanvasFit();
  }

  function onMouseUp() {
    isResizingTimeline.value = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

watch(
  () => [projectStore.canvasSize?.width, projectStore.canvasSize?.height],
  () => {
    updateCanvasFit();
  }
);

onMounted(() => {
  if (previewContainerRef.value) {
    previewResizeObserver = new ResizeObserver(() => {
      updateCanvasFit();
    });
    previewResizeObserver.observe(previewContainerRef.value);
    updateCanvasFit();
  }
});

onUnmounted(() => {
  if (previewResizeObserver) {
    previewResizeObserver.disconnect();
    previewResizeObserver = null;
  }
});

defineExpose({
  updateCanvasFit,
});
</script>

<template>
  <main
    v-loading="isEpisodeLoading"
    :element-loading-text="t('workspace.loadingEpisodeTimeline', 'Loading Episode Timeline...')"
    element-loading-background="rgba(0, 0, 0, 0.65)"
    class="flex-1 flex flex-col min-w-0 bg-[var(--el-bg-color-page)] relative z-0"
  >
    <!-- Center Preview Area with OpenVideo CanvasPanel -->
    <div ref="previewContainerRef" class="flex-1 flex items-center justify-center p-3 relative overflow-hidden min-h-0">
      <div class="w-full h-full rounded-2xl overflow-hidden relative border shadow-sm flex items-center justify-center" style="background-color: var(--el-bg-color); border-color: var(--el-border-color-light);">
        <CanvasPanel class="w-full h-full" />
      </div>
    </div>

    <!-- Draggable Resizer Bar between Canvas Preview & Timeline -->
    <div
      class="h-2 hover:h-2.5 transition-all cursor-row-resize flex items-center justify-center group select-none z-20 border-y"
      style="background-color: var(--el-border-color-lighter); border-color: var(--el-border-color);"
      @mousedown="startTimelineResize"
    >
      <div class="w-12 h-1 rounded-full transition-colors" style="background-color: var(--el-text-color-placeholder);" />
    </div>

    <!-- Timeline Container (Resizable Bottom Panel) -->
    <div class="border-t z-10 flex flex-col overflow-hidden" style="border-color: var(--el-border-color); background-color: var(--el-card-bg-color);" :style="{ height: `${timelineHeight}px` }">
      <Timeline class="w-full h-full" />
    </div>
  </main>
</template>
