<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useStudioStore } from '~/composables/useStudioStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { GEMINI_SPEECH_LANGUAGES, getLanguageByCode } from '@/constants/geminiLanguages';
import { core } from '@/utils/project';
import { Button } from '@/components/ui/button';
import { Log } from '@openvideo/engine-pixi';
import { useExport } from '@/composables/useExport';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Video, Music, Clock, Settings, Mic, Subtitles, Globe, Layers } from 'lucide-vue-next';
import { toast } from 'vue-sonner';

// ─── Option Definitions ─────────────────────────────────────────────────────

const VIDEO_CODECS = [
  { value: 'avc1.640033', label: 'H.264 (AVC)' },
  { value: 'hvc1.1.6.L153.B0', label: 'H.265 (HEVC)' },
  { value: 'vp09.00.51.08', label: 'VP9' },
];

const AUDIO_CODECS = [
  { value: 'aac', label: 'AAC' },
  { value: 'opus', label: 'Opus' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
];

const VIDEO_FORMATS = [
  { value: 'mp4', label: 'MP4', codecs: ['avc1.640033', 'hvc1.1.6.L153.B0', 'vp09.00.51.08'] },
  { value: 'webm', label: 'WebM', codecs: ['vp09.00.51.08'] },
  { value: 'mkv', label: 'MKV', codecs: ['avc1.640033', 'hvc1.1.6.L153.B0', 'vp09.00.51.08'] },
  { value: 'mov', label: 'MOV', codecs: ['avc1.640033', 'hvc1.1.6.L153.B0'] },
];

const AUDIO_FORMATS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
];

const FRAME_RATES = [
  { value: '23.976', label: '23.976 fps (Film)' },
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps (PAL)' },
  { value: '29.97', label: '29.97 fps (NTSC)' },
  { value: '30', label: '30 fps' },
  { value: '50', label: '50 fps' },
  { value: '59.94', label: '59.94 fps (NTSC)' },
  { value: '60', label: '60 fps' },
];

const SAMPLE_RATES = [
  { value: '44100', label: '44.1 kHz' },
  { value: '48000', label: '48 kHz' },
];

interface ResolutionPreset {
  value: string;
  label: string;
  badge: string;
  bitrate: number;
  fps: number;
  codec: string;
  format: string;
}

const RESOLUTION_GROUPS: { group: string; items: ResolutionPreset[] }[] = [
  {
    group: 'Standard',
    items: [
      { value: '1280x720', label: 'HD', badge: '720p', bitrate: 7_000_000, fps: 30, codec: 'avc1.640033', format: 'mp4' },
      { value: '1920x1080', label: 'Full HD', badge: '1080p', bitrate: 12_000_000, fps: 30, codec: 'avc1.640033', format: 'mp4' },
      { value: '2560x1440', label: '2K Quad HD', badge: '1440p', bitrate: 24_000_000, fps: 30, codec: 'vp09.00.51.08', format: 'mp4' },
      { value: '3840x2160', label: '4K Ultra HD', badge: '2160p', bitrate: 64_000_000, fps: 30, codec: 'vp09.00.51.08', format: 'mp4' },
    ],
  },
  {
    group: 'Social Media',
    items: [
      { value: '1080x1920', label: 'YouTube Shorts', badge: '1080p', bitrate: 12_000_000, fps: 30, codec: 'avc1.640033', format: 'mp4' },
      { value: '3840x2160', label: 'YouTube 4K', badge: '2160p', bitrate: 64_000_000, fps: 30, codec: 'vp09.00.51.08', format: 'mp4' },
      { value: '1080x1920', label: 'Instagram Reels', badge: '1080p', bitrate: 12_000_000, fps: 30, codec: 'avc1.640033', format: 'mp4' },
      { value: '1080x1920', label: 'TikTok', badge: '1080p', bitrate: 12_000_000, fps: 30, codec: 'avc1.640033', format: 'mp4' },
    ],
  },
  {
    group: 'Web',
    items: [
      { value: '1280x720', label: 'HD', badge: '720p', bitrate: 5_000_000, fps: 30, codec: 'vp09.00.51.08', format: 'webm' },
      { value: '1920x1080', label: 'Full HD', badge: '1080p', bitrate: 8_000_000, fps: 30, codec: 'vp09.00.51.08', format: 'webm' },
    ],
  },
];

const RESOLUTION_PRESETS = RESOLUTION_GROUPS.flatMap((g) => g.items);

function getLanguageName(code: string | undefined): string {
  if (!code) return '';
  if (code === 'mute') return 'Mute (No Voice)';
  if (code === 'off') return 'Off (No Subtitles)';
  const langObj = getLanguageByCode(code);
  return langObj?.nativeName || langObj?.language || code;
}

// ─── Component Props ─────────────────────────────────────────────────────────

interface ExportModalProps {
  open: boolean;
}

const props = defineProps<ExportModalProps>();
const emit = defineEmits(['update:open', 'exported']);

const seriesStore = useSeriesStore();
const { state: studioState } = useStudioStore();
const studio = computed(() => studioState.value.studio);
const studioOpts = computed(() => (studio.value as any)?.getOptions?.() || { width: 1920, height: 1080, fps: 30 });

// ─── Step State ───────────────────────────────────────────────────────────────
type Step = 'preset' | 'advanced' | 'exporting';
const step = ref<Step>('preset');
const isExporting = ref(false);
const exportProgress = ref(0);
const exportBlobUrl = ref<string | null>(null);
const exportStartTime = ref<number | null>(null);
const exportCombinator = ref<any>(null);

// ─── Multi-Language Voiceover & Caption Options ─────────────────────────────
const renderMode = ref<'single' | 'all'>('single');
const selectedVoiceLang = ref<string>();
const selectedCaptionLang = ref<string>();
const batchCurrentIndex = ref<number>(0);
const batchTotalCount = ref<number>(0);
const batchCurrentLang = ref<string>();

const availableLanguages = computed<string[]>(() => {
  const set = new Set<string>();
  const pri = seriesStore.currentSeries?.language || 'en-US';
  set.add(pri);
  if (Array.isArray(seriesStore.dubbingLanguages)) {
    seriesStore.dubbingLanguages.forEach((l: string) => l && set.add(l));
  }
  if (Array.isArray(seriesStore.captionLanguages)) {
    seriesStore.captionLanguages.forEach((l: string) => l && set.add(l));
  }
  (seriesStore.masterTracks || []).forEach((t: any) => {
    if (t.id?.startsWith('track_voiceover_')) {
      const code = t.id.replace('track_voiceover_', '').replace(/_/g, '-');
      if (code) set.add(code);
    }
    if (t.id?.startsWith('track_caption_')) {
      const code = t.id.replace('track_caption_', '').replace(/_/g, '-');
      if (code) set.add(code);
    }
  });
  return Array.from(set);
});

// ─── Export Settings ──────────────────────────────────────────────────────────
const includeVideo = ref(true);
const videoCodec = ref('avc1.640033');
const quality = ref('12000000');
const format = ref('mp4');
const fps = ref('30');
const resolution = ref('Full HD');

const includeAudio = ref(true);
const audioCodec = ref('aac');
const audioSampleRate = ref('48000');

const maxDuration = computed(() => (studio.value as any)?.getMaxDuration?.() || 0);

// ─── Watchers for auto-switching formats ──────────────────────────────────────
watch(includeVideo, (val) => {
  if (!val && format.value === 'mp4') {
    format.value = 'mp3';
  } else if (val && ['mp3', 'wav', 'flac', 'ogg'].includes(format.value)) {
    format.value = 'mp4';
  }
});

watch(format, (val) => {
  if (includeVideo.value) {
    const f = VIDEO_FORMATS.find((x) => x.value === val);
    if (f && videoCodec.value && !f.codecs.includes(videoCodec.value)) {
      videoCodec.value = f.codecs[0] || 'avc1.42E01E';
    }
  }
  if (val === 'webm') {
    if (!['opus', 'vorbis'].includes(audioCodec.value)) audioCodec.value = 'opus';
  } else {
    if (['opus', 'vorbis'].includes(audioCodec.value)) audioCodec.value = 'aac';
  }
});

watch(resolution, (val) => {
  if (!includeVideo.value) return;
  const preset = RESOLUTION_PRESETS.find((r) => r.label === val);
  if (!preset) return;
  quality.value = String(preset.bitrate);
  const height = Number(preset.value.split('x')[1]);
  if (height > 1080) {
    videoCodec.value = 'vp09.00.51.08';
    if (format.value === 'mov') format.value = 'mp4';
  }
});

// ─── Helper to Build Filtered ProjectData ─────────────────────────────────────
function buildCustomProjectData(voiceLang?: string, capLang?: string) {
  const state = core.store.getState();
  const allTracks = (seriesStore.masterTracks && seriesStore.masterTracks.length > 0)
    ? seriesStore.masterTracks
    : ((state.tracks as any[]) || []);
  const allClips = (seriesStore.masterClips && Object.keys(seriesStore.masterClips).length > 0)
    ? seriesStore.masterClips
    : (state.clips || {});

  const primaryCode = seriesStore.currentSeries?.language || 'en-US';
  const targetVoice = voiceLang !== undefined ? voiceLang : (selectedVoiceLang.value || primaryCode);
  const targetCap = capLang !== undefined ? capLang : (selectedCaptionLang.value || primaryCode);

  const safeCapLang = targetCap !== 'off' ? targetCap.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const targetCaptionTrackId = safeCapLang ? `track_caption_${safeCapLang}` : '';

  const safeVoiceLang = targetVoice !== 'mute' ? targetVoice.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const targetVoiceTrackId = safeVoiceLang ? `track_voiceover_${safeVoiceLang}` : '';

  const filteredTracks = JSON.parse(JSON.stringify(allTracks)).filter((track: any) => {
    if (!track || typeof track !== 'object') return false;
    if (!Array.isArray(track.clipIds)) track.clipIds = [];

    const isCaptionTrack = track.type === 'Caption' || track.id?.startsWith('track_caption') || track.id?.startsWith('track_captions');
    const isVoiceTrack = track.type === 'Audio' && (track.id?.startsWith('track_voiceover') || track.id?.startsWith('track_voice'));

    if (isCaptionTrack) {
      if (targetCap === 'off') return false;
      if (targetCaptionTrackId && (track.id === targetCaptionTrackId || track.id === `track_caption_${targetCap}`)) return true;
      const trackLang = track.language || track.id?.replace(/^track_captions?_?/, '');
      return trackLang === targetCap || trackLang?.startsWith(targetCap.split('-')[0]);
    }

    if (isVoiceTrack) {
      if (targetVoice === 'mute') return false;
      if (targetVoiceTrackId && (track.id === targetVoiceTrackId || track.id === `track_voiceover_${targetVoice}`)) return true;
      const trackLang = track.language || track.id?.replace(/^track_voiceovers?_?/, '');
      return trackLang === targetVoice || trackLang?.startsWith(targetVoice.split('-')[0]);
    }

    return true;
  });

  filteredTracks.forEach((track: any) => {
    const isCaptionTrack = track.type === 'Caption' || track.id?.startsWith('track_caption');
    const isVoiceTrack = track.type === 'Audio' && (track.id?.startsWith('track_voiceover') || track.id?.startsWith('track_voice'));
    if (isCaptionTrack) track.visible = true;
    if (isVoiceTrack) {
      track.muted = false;
      track.visible = true;
    }
  });

  const activeTrackIds = new Set(filteredTracks.map((t: any) => t.id));
  const filteredClips: Record<string, any> = {};

  Object.keys(allClips).forEach((clipId) => {
    const clip = allClips[clipId];
    if (!clip) return;
    if (!clip.trackId || activeTrackIds.has(clip.trackId)) {
      filteredClips[clipId] = { ...clip, visible: true };
    }
  });

  return {
    settings: JSON.parse(JSON.stringify(state.settings || {})),
    tracks: filteredTracks,
    clips: filteredClips,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const resetState = () => {
  if (exportCombinator.value) {
    exportCombinator.value.destroy();
    exportCombinator.value = null;
  }
  if (exportBlobUrl.value) {
    URL.revokeObjectURL(exportBlobUrl.value);
    exportBlobUrl.value = null;
  }
  exportStartTime.value = null;
  isExporting.value = false;
  exportProgress.value = 0;
  batchCurrentIndex.value = 0;
  batchTotalCount.value = 0;
  batchCurrentLang.value = '';
  step.value = 'preset';
};

const handleClose = () => {
  emit('update:open', false);
  resetState();
};

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    resetState();
  } else {
    selectedVoiceLang.value = seriesStore.activePreviewVoiceLang || seriesStore.currentSeries?.language || 'vi-VN';
    selectedCaptionLang.value = seriesStore.activePreviewCaptionLang || seriesStore.currentSeries?.language || 'vi-VN';
  }
});

onUnmounted(() => resetState());

const applyPreset = (preset: ResolutionPreset) => {
  resolution.value = preset.label;
  quality.value = String(preset.bitrate);
  fps.value = String(preset.fps);
  videoCodec.value = preset.codec;
  format.value = preset.format;
};

// ─── Suppress rAF during export ──────────────────────────────────────────────
const { startExport: runExport } = useExport();

// ─── Start Export ─────────────────────────────────────────────────────────────
const startExport = async (targetPreset?: ResolutionPreset) => {
  if (!studio.value) return;
  step.value = 'exporting';
  isExporting.value = true;
  exportProgress.value = 0;
  exportBlobUrl.value = null;
  exportStartTime.value = Date.now();

  try {
    const activePreset = targetPreset || RESOLUTION_PRESETS.find((r) => r.label === resolution.value);
    const settings = {
      includeVideo: includeVideo.value,
      videoCodec: videoCodec.value,
      quality: quality.value,
      format: format.value,
      fps: fps.value,
      resolution: resolution.value,
      includeAudio: includeAudio.value,
      audioCodec: audioCodec.value,
      audioSampleRate: audioSampleRate.value,
    };

    // ── Batch All Versions Render ──
    if (renderMode.value === 'all' && availableLanguages.value.length > 0) {
      const langs = availableLanguages.value;
      batchTotalCount.value = langs.length;
      const outputsMap: Record<string, string> = {};
      let lastThumbnail: any = null;

      for (let i = 0; i < langs.length; i++) {
        const lang = langs[i];
        batchCurrentIndex.value = i + 1;
        batchCurrentLang.value = getLanguageName(lang);
        exportProgress.value = 0;

        const targetCap = selectedCaptionLang.value === 'off' ? 'off' : lang;
        const customData = buildCustomProjectData(lang, targetCap);
        const result = await runExport(settings, activePreset, (v: number) => {
          // Calculate overall progress across batch
          const overall = (i + v) / langs.length;
          exportProgress.value = overall;
        }, customData);

        if (result?.video) {
          outputsMap[lang] = result.video;
          lastThumbnail = result.thumbnail;
        }
      }

      isExporting.value = false;
      setTimeout(() => {
        handleClose();
      }, 1200);

      toast.success(`Rendered ${Object.keys(outputsMap).length} language versions successfully!`);
      emit('exported', outputsMap, lastThumbnail);
      return;
    }

    // ── Single Version Render ──
    const customData = buildCustomProjectData(selectedVoiceLang.value, selectedCaptionLang.value);
    const result = await runExport(settings, activePreset, (v: number) => {
      exportProgress.value = v;
    }, customData);

    isExporting.value = false;
    if (result?.video) {
      setTimeout(() => {
        handleClose();
      }, 1200);

      const chosenLang = selectedVoiceLang.value || seriesStore.currentSeries?.language || 'en-US';
      const outputPayload = { [chosenLang]: result.video };
      emit('exported', outputPayload, result?.thumbnail);
    }
  } catch (error: any) {
    toast.error('Failed to export: ' + error.message);
    isExporting.value = false;
    step.value = 'advanced';
  }
};

const elapsedTimeLabel = computed(() => {
  if (exportProgress.value <= 0 || !exportStartTime.value) return 'preparing…';
  const elapsed = Date.now() - exportStartTime.value;
  const remaining = (elapsed / exportProgress.value - elapsed) / 1000;
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  return `${mins}m ${secs}s left`;
});

const summaryPills = computed(() => [
  { label: 'Format', value: format.value.toUpperCase() },
  { label: 'FPS', value: fps.value },
  {
    label: 'Resolution',
    value: includeVideo.value
      ? (() => {
          const p = RESOLUTION_PRESETS.find((r) => r.label === resolution.value);
          return p ? `${p.badge} (${p.value.replace('x', '×')})` : `${studioOpts.value.width}×${studioOpts.value.height}`;
        })()
      : 'N/A',
  },
  { label: 'Track Mode', value: renderMode.value === 'all' ? `All (${availableLanguages.value.length})` : `${getLanguageName(selectedVoiceLang.value)}` },
  { label: 'Audio', value: includeAudio.value ? 'On' : 'Off' },
  { label: 'Subtitles', value: selectedCaptionLang.value === 'off' ? 'Off' : getLanguageName(selectedCaptionLang.value) },
]);
</script>

<template>
  <Dialog :open="props.open" @update:open="(v) => !v && handleClose()">
    <DialogContent
      class="max-w-[440px] border border-border p-0 text-foreground shadow-2xl overflow-hidden rounded-2xl bg-background/95 backdrop-blur-2xl max-h-[85vh] flex flex-col"
      :show-close-button="false"
    >
      <!-- ── STEP 1: Preset Picker ─────────────────────────────── -->
      <div v-if="step === 'preset'" class="flex flex-col max-h-[85vh] overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-border/50">
          <div>
            <DialogTitle class="text-sm font-semibold tracking-tight">Export Video</DialogTitle>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ (maxDuration / 1e6).toFixed(1) }}s · {{ studioOpts.width }}×{{ studioOpts.height }}
            </p>
          </div>
          <Button variant="ghost" class="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:bg-muted" @click="handleClose">✕</Button>
        </div>

        <!-- Multi-Language Voiceover & Caption Version Selector -->
        <div class="mx-5 mt-3.5 p-3 rounded-xl border border-border bg-card flex flex-col gap-2 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold flex items-center gap-1.5 text-foreground">
              <Globe class="w-3.5 h-3.5 text-primary" />
              Voiceover &amp; Subtitle Options
            </span>
            <!-- Mode Toggle: Single vs All -->
            <div class="flex items-center gap-1 bg-muted/80 p-0.5 rounded-lg border border-border/50 text-[10px]">
              <button
                type="button"
                :class="['px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer', renderMode === 'single' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground']"
                @click="renderMode = 'single'"
              >
                Single
              </button>
              <button
                type="button"
                :class="['px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer', renderMode === 'all' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground']"
                @click="renderMode = 'all'"
              >
                All Versions ({{ availableLanguages.length }})
              </button>
            </div>
          </div>

          <!-- If Single Version: Choose Voiceover & Subtitle -->
          <div v-if="renderMode === 'single'" class="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
            <div>
              <label class="text-[10px] text-muted-foreground flex items-center gap-1 mb-1 font-medium">
                <Mic class="w-3 h-3 text-emerald-500" />
                Voiceover Track
              </label>
              <Select :model-value="selectedVoiceLang" @update:model-value="(val) => val && (selectedVoiceLang = String(val))">
                <SelectTrigger class="h-7 text-xs bg-muted/60 border-border rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent class="text-xs">
                  <SelectItem v-for="lang in availableLanguages" :key="'voice_' + lang" :value="lang">
                    {{ getLanguageName(lang) }}
                  </SelectItem>
                  <SelectItem value="mute">Mute (No Voice)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label class="text-[10px] text-muted-foreground flex items-center gap-1 mb-1 font-medium">
                <Subtitles class="w-3 h-3 text-teal-500" />
                Burned Subtitles
              </label>
              <Select :model-value="selectedCaptionLang" @update:model-value="(val) => val && (selectedCaptionLang = String(val))">
                <SelectTrigger class="h-7 text-xs bg-muted/60 border-border rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent class="text-xs">
                  <SelectItem v-for="lang in availableLanguages" :key="'cap_' + lang" :value="lang">
                    {{ getLanguageName(lang) }}
                  </SelectItem>
                  <SelectItem value="off">Off (No Subtitles)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- If All Versions: Show list of languages to be rendered -->
          <div v-else class="pt-2 border-t border-border/40 flex flex-wrap gap-1.5 items-center">
            <span class="text-[10px] text-muted-foreground">Will render {{ availableLanguages.length }} separate videos:</span>
            <span
              v-for="lang in availableLanguages"
              :key="'badge_' + lang"
              class="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium border border-primary/20"
            >
              {{ getLanguageName(lang) }}
            </span>
          </div>
        </div>

        <div class="px-5 py-3.5 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
          <div v-for="group in RESOLUTION_GROUPS" :key="group.group">
            <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {{ group.group }}
            </p>
            <div class="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              <button
                v-for="preset in group.items"
                :key="group.group + preset.label"
                class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 transition-colors text-left group cursor-pointer"
                @click="() => { applyPreset(preset); startExport(preset); }"
              >
                <span class="text-sm text-foreground">{{ preset.label }}</span>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted-foreground tabular-nums">{{ preset.badge }}</span>
                  <span class="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                    {{ preset.format.toUpperCase() }}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <!-- Custom / Advanced -->
          <div>
            <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Advanced</p>
            <div class="rounded-xl border border-border bg-card overflow-hidden">
              <button
                class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 transition-colors text-left cursor-pointer"
                @click="step = 'advanced'"
              >
                <span class="text-sm text-foreground">Custom Settings</span>
                <Settings class="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── STEP 2: Advanced Settings ─────────────────────────── -->
      <div v-else-if="step === 'advanced'" class="flex flex-col max-h-[85vh] overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-border/50">
          <div>
            <DialogTitle class="text-sm font-semibold tracking-tight">Custom Export</DialogTitle>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ studioOpts.width }}×{{ studioOpts.height }} · {{ (maxDuration / 1e6).toFixed(1) }}s
            </p>
          </div>
          <Button variant="ghost" class="h-7 px-2 text-xs rounded-lg text-muted-foreground hover:bg-muted cursor-pointer" @click="step = 'preset'">
            ← Back
          </Button>
        </div>

        <div class="px-5 py-4 flex flex-col gap-3 overflow-y-auto flex-1 overscroll-contain">
          <!-- Voiceover & Caption in Advanced Section -->
          <div class="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium flex items-center gap-1.5">
                <Globe class="w-3.5 h-3.5 text-primary" />
                Language Track Version
              </span>
              <div class="flex items-center gap-1 bg-muted/80 p-0.5 rounded-lg border border-border/50 text-[10px]">
                <button
                  type="button"
                  :class="['px-2 py-0.5 rounded-md font-medium cursor-pointer', renderMode === 'single' ? 'bg-primary text-white' : 'text-muted-foreground']"
                  @click="renderMode = 'single'"
                >
                  Single
                </button>
                <button
                  type="button"
                  :class="['px-2 py-0.5 rounded-md font-medium cursor-pointer', renderMode === 'all' ? 'bg-primary text-white' : 'text-muted-foreground']"
                  @click="renderMode = 'all'"
                >
                  All Versions ({{ availableLanguages.length }})
                </button>
              </div>
            </div>

            <div v-if="renderMode === 'single'" class="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span class="text-[10px] text-muted-foreground block mb-1">Voiceover</span>
                <Select :model-value="selectedVoiceLang" @update:model-value="(val) => val && (selectedVoiceLang = String(val))">
                  <SelectTrigger class="h-8 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="lang in availableLanguages" :key="'adv_v_' + lang" :value="lang">
                      {{ getLanguageName(lang) }}
                    </SelectItem>
                    <SelectItem value="mute">Mute (No Voice)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span class="text-[10px] text-muted-foreground block mb-1">Subtitles</span>
                <Select :model-value="selectedCaptionLang" @update:model-value="(val) => val && (selectedCaptionLang = String(val))">
                  <SelectTrigger class="h-8 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="lang in availableLanguages" :key="'adv_c_' + lang" :value="lang">
                      {{ getLanguageName(lang) }}
                    </SelectItem>
                    <SelectItem value="off">Off (No Subtitles)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <!-- Video Section -->
          <div class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border">
              <div class="flex items-center gap-2">
                <Video class="w-3.5 h-3.5 text-muted-foreground" />
                <span class="text-xs font-medium">Video</span>
              </div>
              <Switch :checked="includeVideo" @update:checked="includeVideo = $event" />
            </div>
            <div :class="['px-4 py-3 flex flex-col gap-3 transition-opacity', !includeVideo && 'opacity-30 pointer-events-none']">
              <!-- Resolution -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Resolution</span>
                <Select :model-value="resolution" @update:model-value="(val) => val && (resolution = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem value="HD">720p</SelectItem>
                    <SelectItem value="Full HD">1080p</SelectItem>
                    <SelectItem value="2K Quad HD">1440p</SelectItem>
                    <SelectItem value="4K Ultra HD">2160p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <!-- Bitrate -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Bitrate (Mbps)</span>
                <input
                  type="number"
                  :value="Math.round(Number(quality) / 1_000_000)"
                  @input="quality = String(Number(($event.target as HTMLInputElement).value) * 1_000_000)"
                  min="1"
                  max="200"
                  class="h-8 w-36 rounded-md bg-muted border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <!-- Codec -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Codec</span>
                <Select :model-value="videoCodec" @update:model-value="(val) => val && (videoCodec = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="c in VIDEO_CODECS" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <!-- Format -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Format</span>
                <Select :model-value="format" @update:model-value="(val) => val && (format = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="f in VIDEO_FORMATS" :key="f.value" :value="f.value">{{ f.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <!-- Frame Rate -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Frame Rate</span>
                <Select :model-value="fps" @update:model-value="(val) => val && (fps = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="fr in FRAME_RATES" :key="fr.value" :value="fr.value">{{ fr.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <!-- Audio Section -->
          <div class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border">
              <div class="flex items-center gap-2">
                <Music class="w-3.5 h-3.5 text-muted-foreground" />
                <span class="text-xs font-medium">Audio</span>
              </div>
              <Switch :checked="includeAudio" @update:checked="includeAudio = $event" />
            </div>
            <div :class="['px-4 py-3 flex flex-col gap-3 transition-opacity', !includeAudio && 'opacity-30 pointer-events-none']">
              <!-- Audio-only format if no video -->
              <div v-if="!includeVideo" class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Format</span>
                <Select :model-value="format" @update:model-value="(val) => val && (format = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="f in AUDIO_FORMATS" :key="f.value" :value="f.value">{{ f.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <!-- Audio Codec -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Codec</span>
                <Select :model-value="audioCodec" @update:model-value="(val) => val && (audioCodec = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="c in AUDIO_CODECS" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <!-- Sample Rate -->
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs text-muted-foreground shrink-0">Sample Rate</span>
                <Select :model-value="audioSampleRate" @update:model-value="(val) => val && (audioSampleRate = String(val))">
                  <SelectTrigger class="h-8 w-36 text-xs bg-muted border-border rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent class="text-xs">
                    <SelectItem v-for="sr in SAMPLE_RATES" :key="sr.value" :value="sr.value">{{ sr.label }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between mt-1">
            <div class="flex items-center gap-1.5 text-muted-foreground">
              <Clock class="w-3 h-3" />
              <span class="text-[11px]">{{ (maxDuration / 1e6).toFixed(2) }}s</span>
            </div>
            <div class="flex gap-2">
              <Button
                variant="ghost"
                class="h-8 px-4 text-xs rounded-lg text-muted-foreground cursor-pointer"
                @click="handleClose"
              >
                Cancel
              </Button>
              <Button
                class="h-8 px-5 text-xs rounded-lg font-semibold cursor-pointer"
                @click="startExport()"
              >
                {{ renderMode === 'all' ? `Export All (${availableLanguages.length})` : 'Export Video' }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── STEP 3: Exporting Progress ─────────────────────────── -->
      <div v-else-if="step === 'exporting'" class="flex flex-col p-6 gap-5">
        <div>
          <DialogTitle class="text-sm font-semibold flex items-center gap-2">
            <Loader2 class="h-4 w-4 animate-spin text-primary" />
            <span>{{ renderMode === 'all' ? `Batch Rendering All Versions (${batchCurrentIndex}/${batchTotalCount})` : 'Exporting Video…' }}</span>
          </DialogTitle>
          <p class="text-xs text-muted-foreground mt-1">
            <span v-if="renderMode === 'all' && batchCurrentLang" class="text-primary font-medium">Currently: {{ batchCurrentLang }} · </span>
            {{ format.toUpperCase() }} · {{ studioOpts.width }}×{{ studioOpts.height }}
          </p>
        </div>

        <!-- Summary pills -->
        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="pill in summaryPills"
            :key="pill.label"
            class="rounded-lg border border-border bg-card px-3 py-2"
          >
            <p class="text-[10px] text-muted-foreground mb-0.5">{{ pill.label }}</p>
            <p class="text-xs font-medium text-foreground truncate">{{ pill.value }}</p>
          </div>
        </div>

        <!-- Progress bar -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-muted-foreground font-medium">
              {{ renderMode === 'all' ? `Overall Progress` : 'Render Progress' }}
            </span>
            <span class="text-xs font-mono text-muted-foreground">
              {{ Math.round(exportProgress * 100) }}% · {{ elapsedTimeLabel }}
            </span>
          </div>
          <div class="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              :style="{ width: `${exportProgress * 100}%` }"
            />
          </div>
        </div>

        <Button
          variant="ghost"
          class="w-full h-9 text-xs rounded-xl border border-border bg-card text-muted-foreground cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          @click="handleClose"
        >
          Cancel Export
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
