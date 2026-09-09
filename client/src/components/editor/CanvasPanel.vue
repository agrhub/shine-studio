<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, markRaw, reactive, watch } from 'vue';
import { Studio, fontManager, registerCustomTransition, registerCustomEffect } from '@openvideo/engine-pixi';
import { useStudioStore } from '@/composables/useStudioStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTheme } from '@/composables/useTheme';
import { core } from '@/utils/project';
import { generateUUID } from '@/utils/id';
import { CUSTOM_TRANSITIONS } from './transition-custom';
import { CUSTOM_EFFECTS } from './effect-custom';
import StudioCanvasContextMenu from './StudioCanvasContextMenu.vue';
import type { ContextMenuState } from './StudioCanvasContextMenu.vue';
import { SECONDARY_FONT, SECONDARY_FONT_URL } from './constants/constants.ts';

const STUDIO_CONFIG = {
  fps: 30,
  interactivity: true,
  spacing: 20,
};

const props = defineProps<{
  onReady?: () => void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const studioRef = shallowRef<Studio | null>(null);
const { setStudio } = useStudioStore();
const projectStore = useProjectStore();
const { theme } = useTheme();

const contextMenuState = reactive<ContextMenuState>({
  isOpen: false,
  position: { x: 0, y: 0 },
  target: null,
});

const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const selectedIds = core.store.getState().selectedIds;
  const hasSelection = selectedIds.length > 0;

  contextMenuState.isOpen = true;
  contextMenuState.position = { x: e.clientX, y: e.clientY };
  contextMenuState.target = hasSelection ? 'object' : 'background';
};

const handleContextMenuClose = () => {
  contextMenuState.isOpen = false;
  contextMenuState.target = null;
};

// Handle dimension changes
watch(() => projectStore.canvasSize, (newSize) => {
  if (studioRef.value) {
    studioRef.value.setSize(newSize.width, newSize.height);
  }
  core.execute({
    id: generateUUID(),
    type: 'project.updateSettings',
    payload: { width: newSize.width, height: newSize.height },
  });
}, { deep: true });

// React to Theme changes (Light vs Dark mode for editor container background)
watch(theme, (newTheme) => {
  if (studioRef.value) {
    const editorBg = newTheme === 'dark' ? '#18181b' : '#f4f4f5';
    (studioRef.value as any).setBackgroundColor?.(editorBg);
    (studioRef.value as any).requestRender?.();
  }
}, { immediate: true });

let resizeObserver: ResizeObserver | null = null;
let unsubCore: (() => void) | null = null;

const initializeStudio = async () => {
  if (!canvasRef.value) return;

  // Register custom effects & transitions
  CUSTOM_TRANSITIONS.forEach((t) => {
    registerCustomTransition(t.key, t as any);
  });
  CUSTOM_EFFECTS.forEach((e) => {
    registerCustomEffect(e.key, e as any);
  });

  // Create studio instance
  const initialEditorBg = theme.value === 'dark' ? '#18181b' : '#f4f4f5';
  const instance = markRaw(new Studio({
    width: projectStore.canvasSize.width,
    height: projectStore.canvasSize.height,
    ...STUDIO_CONFIG,
    backgroundColor: initialEditorBg,
    artboardColor: '#000000',
    canvas: canvasRef.value,
    core: core,
    previewScale: 0.75,
  }));
  studioRef.value = instance;

  // Defensive patch for TimelineModel to prevent recursive reentrancy in reconcileTracks
  // and protect against undefined tracks or missing clipIds during studio sync.
  // if (instance && (instance as any).timeline) {
  //   const tmProto = Object.getPrototypeOf((instance as any).timeline);
  //   if (tmProto && !tmProto._reconcileTracksPatched) {
  //     tmProto._reconcileTracksPatched = true;

  //     const origSetTracks = tmProto.setTracks;
  //     if (typeof origSetTracks === 'function') {
  //       tmProto.setTracks = async function (tracks: any[]) {
  //         const safeTracks = Array.isArray(tracks)
  //           ? tracks.filter(Boolean).map((t: any) => ({
  //               ...t,
  //               clipIds: Array.isArray(t?.clipIds) ? t.clipIds : [],
  //             }))
  //           : [];
  //         return origSetTracks.call(this, safeTracks);
  //       };
  //     }

  //     tmProto.reconcileTracks = function () {
  //       if (this._isReconciling) return;
  //       this._isReconciling = true;
  //       try {
  //         if (!Array.isArray(this.tracks)) {
  //           this.tracks = [];
  //           return;
  //         }
  //         const existingClipIds = new Set((this.clips || []).map((c: any) => c?.id).filter(Boolean));
  //         for (let i = this.tracks.length - 1; i >= 0; i--) {
  //           const track = this.tracks[i];
  //           if (!track) {
  //             this.tracks.splice(i, 1);
  //             continue;
  //           }
  //           if (!Array.isArray(track.clipIds)) {
  //             track.clipIds = [];
  //           }
  //           const validClipIds = track.clipIds.filter((id: string) => existingClipIds.has(id));
  //           if (validClipIds.length !== track.clipIds.length) {
  //             track.clipIds = validClipIds;
  //           }
  //           if (track.clipIds.length === 0) {
  //             this.tracks.splice(i, 1);
  //             if (!this.studio?.isRestoring) {
  //               this.studio?.emit?.('track:removed', { trackId: track.id });
  //             }
  //           }
  //         }
  //         if (this.tracks.length === 0 && !this.studio?.isRestoring) {
  //           this.studio?.emit?.('track:order-changed', { tracks: this.tracks });
  //         }
  //       } finally {
  //         this._isReconciling = false;
  //       }
  //     };
  //   }
  // }

  // // Defensive patch for Studio.applyGlobalEffects & updateFrame to prevent rendering pipeline crashes
  // if (instance) {
  //   if (typeof (instance as any).applyGlobalEffects === 'function') {
  //     const origApplyGlobalEffects = (instance as any).applyGlobalEffects;
  //     (instance as any).applyGlobalEffects = async function (time: number) {
  //       try {
  //         return await origApplyGlobalEffects.call(this, time);
  //       } catch (effErr) {
  //         console.warn('[Studio] applyGlobalEffects caught error, continuing safely:', effErr);
  //       }
  //     };
  //   }
  //   if (typeof (instance as any).updateFrame === 'function') {
  //     const origUpdateFrame = (instance as any).updateFrame;
  //     (instance as any).updateFrame = async function (time: number) {
  //       try {
  //         return await origUpdateFrame.call(this, time);
  //       } catch (frameErr) {
  //         console.warn('[Studio] updateFrame caught error, continuing safely:', frameErr);
  //       }
  //     };
  //   }
  // }

  try {
    await Promise.all([
      fontManager.loadFonts([
        {
          name: SECONDARY_FONT,
          url: SECONDARY_FONT_URL,
        },
      ]),
      instance.ready,
    ]);
    props.onReady?.();
  } catch (error) {
    console.error('Failed to initialize studio:', error);
  }

  setStudio(instance as any);

  // Subscribe to core store setting updates (Artboard Background Color ONLY)
  unsubCore = core.store.subscribe((state) => {
    const s = (state as any)?.settings || {};
    const color = s.artboardColor || s.bgColor || s.backgroundColor || "#000000";
    if (color && studioRef.value) {
      (studioRef.value as any).setArtboardColor?.(color);
      (studioRef.value as any).requestRender?.();
    }
  });

  const canvasElement = canvasRef.value;
  const parentElement = canvasElement.parentElement;

  if (parentElement) {
    resizeObserver = new ResizeObserver(() => {
      if (studioRef.value && (studioRef.value as any).updateArtboardLayout) {
        (studioRef.value as any).updateArtboardLayout();
      }
    });
    resizeObserver.observe(parentElement);
  }
};

onMounted(() => {
  initializeStudio();
});

onUnmounted(() => {
  if (unsubCore) {
    try {
      unsubCore();
    } catch (err) {
      // ignore
    }
    unsubCore = null;
  }

  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch (err) {
      // ignore
    }
    resizeObserver = null;
  }

  const instance = studioRef.value;
  studioRef.value = null;
  setStudio(null);

  if (instance) {
    try {
      instance.destroy();
    } catch (err) {
      console.error('Failed to destroy studio:', err);
    }
  }
});
</script>

<template>
  <div
    class="h-full w-full flex flex-col min-h-0 min-w-0 bg-background rounded-sm relative"
    @contextmenu="handleContextMenu"
  >
    <canvas
      ref="canvasRef"
      class="h-full w-full object-contain"
    />

    <!-- Context Menu -->
    <StudioCanvasContextMenu
      :state="contextMenuState"
      @close="handleContextMenuClose"
    />
  </div>
</template>
