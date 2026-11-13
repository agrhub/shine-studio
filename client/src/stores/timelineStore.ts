import { defineStore } from 'pinia';
import { core } from '@/utils/project';
import { useTimelineStore as useComposableTimelineStore } from '~/composables/useTimelineStore';
import { usePlaybackStore } from '~/composables/usePlaybackStore';
import type { Clip, Track } from '@/types/timeline';
import type { Command as TimelineCommand, RenderJob, ParityCheckResult } from '@/types/api';
import i18n from '@/i18n';
import { ElMessage } from 'element-plus';

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    seriesId: 'series-001',
    episodeId: 'episode-001',
    renderJob: null as RenderJob | null,
    isRendering: false,
    parityResult: null as ParityCheckResult | null,
  }),

  getters: {
    composableStore() {
      return useComposableTimelineStore();
    },
    playbackStore() {
      return usePlaybackStore();
    },
    tracks(): Track[] {
      return this.composableStore.state.value.tracks || [];
    },
    clips(): Record<string, Clip> {
      return this.composableStore.state.value.clips || {};
    },
    selectedClipId(): string | null {
      const selected = this.composableStore.state.value.selectedClipIds;
      return selected && selected.length > 0 ? selected[0] : null;
    },
    selectedClip(): Clip | null {
      if (!this.selectedClipId) return null;
      return this.clips[this.selectedClipId] || null;
    },
    duration(): number {
      return this.playbackStore.state.value.duration || 30;
    },
    playhead(): number {
      return this.playbackStore.state.value.currentTime || 0;
    },
    zoom(): number {
      return 100;
    },
    canUndo(): boolean {
      return (core as any).history?.canUndo?.() ?? true;
    },
    canRedo(): boolean {
      return (core as any).history?.canRedo?.() ?? true;
    },
  },

  actions: {
    undo() {
      try {
        if (typeof (core as any).undo === 'function') {
          (core as any).undo();
          ElMessage.info(i18n.global.t('editor.undoBtn') || 'Undo action');
        }
      } catch (e) {
        console.warn('[TimelineStore] Undo notice:', e);
      }
    },

    redo() {
      try {
        if (typeof (core as any).redo === 'function') {
          (core as any).redo();
          ElMessage.info(i18n.global.t('editor.redoBtn') || 'Redo action');
        }
      } catch (e) {
        console.warn('[TimelineStore] Redo notice:', e);
      }
    },

    executeCommand(cmd: TimelineCommand) {
      if (!cmd) return;
      const { type, payload } = cmd;
      switch (type) {
        case 'clip.update':
        case 'MOVE_CLIP':
        case 'ADJUST_VOLUME':
          this.clipUpdate(payload.clipId, payload.patch || payload);
          break;
        case 'clip.split':
        case 'SPLIT_CLIP':
          this.clipSplit(payload.clipId, payload.splitTime || payload.splitTimeUs / 1_000_000);
          break;
        case 'clip.add':
        case 'ADD_EFFECT':
          this.clipAdd(payload.trackId || 'track-1', payload.clip || payload);
          break;
        case 'clip.remove':
        case 'DELETE_CLIP':
          this.clipRemove(payload.clipId);
          break;
        default:
          console.log('[TimelineStore] Unhandled command type:', type, payload);
      }
    },

    execute(cmd: TimelineCommand) {
      this.executeCommand(cmd);
    },

    executeMany(cmds: TimelineCommand[]) {
      if (Array.isArray(cmds)) {
        cmds.forEach((cmd) => this.executeCommand(cmd));
      }
    },

    clipAdd(trackIdOrClip: string | Partial<Clip>, clipData?: Partial<Clip>) {
      const trackId = typeof trackIdOrClip === 'string' ? trackIdOrClip : (trackIdOrClip.trackId || 'track-1');
      const baseData = typeof trackIdOrClip === 'string' ? clipData : trackIdOrClip;
      const clipId = baseData?.id || `clip-${Date.now()}`;

      try {
        if ((core as any).clip && typeof (core as any).clip.add === 'function') {
          (core as any).clip.add({
            id: clipId,
            trackId,
            ...baseData,
          });
        }
      } catch (e) {
        console.warn('[TimelineStore] OpenVideo core.clip.add notice:', e);
      }

      this.composableStore.updateClip(clipId, {
        id: clipId,
        trackId,
        ...baseData,
      });
    },

    clipRemove(clipId: string) {
      try {
        if ((core as any).clip && typeof (core as any).clip.delete === 'function') {
          (core as any).clip.delete(clipId);
        }
      } catch (e) {
        console.warn('[TimelineStore] OpenVideo core.clip.delete notice:', e);
      }

      this.composableStore.removeClips([clipId]);
    },

    clipUpdate(clipId: string, patch: Partial<Clip>) {
      try {
        if ((core as any).clip && typeof (core as any).clip.update === 'function') {
          (core as any).clip.update(clipId, patch);
        }
      } catch (e) {
        console.warn('[TimelineStore] OpenVideo core.clip.update notice:', e);
      }

      this.composableStore.updateClip(clipId, patch);
    },

    clipSplit(clipId: string, splitTime: number) {
      const splitTimeUs = Math.round(splitTime * 1_000_000);
      try {
        if ((core as any).clip && typeof (core as any).clip.split === 'function') {
          (core as any).clip.split(splitTimeUs, clipId);
        }
      } catch (e) {
        console.warn('[TimelineStore] OpenVideo core.clip.split notice:', e);
      }
      ElMessage.success(i18n.global.t('editor.splitClipBtn') || 'Clip split successfully');
    },

    selectClip(clipId: string | null) {
      if (clipId) {
        this.composableStore.selectClip(clipId);
      } else {
        this.composableStore.clearSelection();
      }
    },
  },
});
