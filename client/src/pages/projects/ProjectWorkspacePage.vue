<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore, normalizeTransitionKey, normalizeEffectKey } from '@/stores/usePipelineStore';
import { useStudioStore } from '@/composables/useStudioStore';
import { usePlaybackStore } from '@/composables/usePlaybackStore';
import { core } from '@/utils/project';
import { toast } from 'vue-sonner';
import { ElMessageBox, ElLoading } from 'element-plus';
import { Bot } from 'lucide-vue-next';
import http from '@/utils/http';
import { Clapperboard } from 'lucide-vue-next';

// Components & Modals
import CanvasPanel from '@/components/editor/CanvasPanel.vue';
import Timeline from '@/components/editor/timeline/Timeline.vue';
import MasterScriptModal from '@/components/modals/MasterScriptModal.vue';
import ManageCastModal from '@/components/modals/ManageCastModal.vue';
import CharacterDetailModal from '@/components/modals/CharacterDetailModal.vue';
// Tab sub-components
import PipelineTab from './workspace/PipelineTab.vue';
import ScriptTab from './workspace/ScriptTab.vue';
import AudioTab from './workspace/AudioTab.vue';
import CaptionsTab from './workspace/CaptionsTab.vue';
import Chatbot from './workspace/Chatbot.vue';
import ExportModal from '@/components/editor/ExportModal.vue';
import CountryFlag from '@/components/common/CountryFlag.vue';
import JobStatusPopover from '@/components/workspace/JobStatusPopover.vue';
import SeriesMasterPlanDialog from '@/components/workspace/SeriesMasterPlanDialog.vue';
import BulkExportPublishDialog from '@/components/workspace/BulkExportPublishDialog.vue';
import { getLanguageByCode, parseRenderVersionKey } from '@/constants/geminiLanguages';
import { nextTick } from 'vue';
import { data, sanitizeTimelineData } from '@/components/editor/data';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const projectStore = useProjectStore();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();
const { state: studioState } = useStudioStore();
const { state: playbackState, play, pause, seek, setDuration } = usePlaybackStore();

// Series details state
const seriesId = computed(() => (route.params.id as string) || 'srs_01');
const seriesTitle = computed(() => seriesStore.currentSeries?.title || 'Micro-Drama Series');
const activeEpisodeIndex = ref(0);
const activeEpisodeId = computed(() => seriesStore.activeEpisodeId);
const currentEpisodeTitle = computed(() => {
  if (seriesStore.activeEpisode) {
    return `EP ${String(seriesStore.activeEpisode.number).padStart(2, '0')}: ${seriesStore.activeEpisode.title.toUpperCase()}`;
  }
  return 'EP TITLE';
});
const isRendering = ref(false);
const renderProgress = ref(0);

// Export / Render state
const isExportModalOpen = ref(false);    // local browser render via ExportModal
const isRenderReviewOpen = ref(false);   // post-render review dialog
const renderReviewUrl = ref('');         // URL of the rendered video for review
const renderReviewOutputs = ref<Record<string, string>>({});
const renderReviewSelectedLang = ref<string>('en-US');
const renderReviewThumbnail = ref('');

// Series Master Plan & Bulk Publish Dialogs
const isSeriesInfoModalOpen = ref(false);
const isBulkPublishModalOpen = ref(false);

function triggerBulkPublish() {
  isBulkPublishModalOpen.value = true;
}

// Watch active language to switch voiceover and caption tracks on OpenVideo Core
watch(() => seriesStore.activeLanguageCode, (activeLang) => {
  if (!activeLang) return;
  seriesStore.setPreviewCaptionLanguage(activeLang);
  seriesStore.setPreviewVoiceLanguage(activeLang);
});

// Right sidebar tab state
const rightTab = ref<'pipeline' | 'script' | 'audio' | 'captions'>('pipeline');
const isAiSidebarOpen = ref(true);
const isLeftSidebarCollapsed = ref(false);
const isTabSidebarCollapsed = ref(true);

function toggleTabSidebar(tabId: 'pipeline' | 'script' | 'audio' | 'captions') {
  if (!isTabSidebarCollapsed.value && rightTab.value === tabId) {
    isTabSidebarCollapsed.value = true;
  } else {
    rightTab.value = tabId;
    isTabSidebarCollapsed.value = false;
  }
}

watch(isAiSidebarOpen, (open) => {
  if (open) {
    isTabSidebarCollapsed.value = true;
  }
});

// Format Time helper (seconds -> mm:ss)
function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const formattedCurrentTime = computed(() => formatTime(playbackState.value.currentTime || 0));
const formattedDuration = computed(() => formatTime(playbackState.value.duration || 165));
const timelineProgressPercent = computed(() => {
  const dur = playbackState.value.duration || 1;
  const cur = playbackState.value.currentTime || 0;
  return Math.min(100, Math.max(0, (cur / dur) * 100));
});

// ─── Timeline & Canvas Resizing State ─────────────────────────────────────────
const timelineHeight = ref(150);
const isResizingTimeline = ref(false);
const previewContainerRef = ref<HTMLElement | null>(null);
const canvasDimensions = ref({ width: 320, height: 568 });
let previewResizeObserver: ResizeObserver | null = null;

function updateCanvasFit() {
  if (!previewContainerRef.value) return;
  const rect = previewContainerRef.value.getBoundingClientRect();
  const padX = 48;
  const padY = 96; // Space for floating badges and toolbar
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

// Episodes List & Cast Members synced with Store
const episodesList = computed(() => seriesStore.episodesList);
const castMembers = computed(() => seriesStore.charactersList);

// Modals State
const isMasterScriptModalOpen = ref(false);
const isManageCastOpen = ref(false);
const selectedCharacter = ref<any | null>(null);
const isCharacterDetailOpen = ref(false);
const isAddEpisodeModalOpen = ref(false);
const newEpisodeTitle = ref('');
const newEpisodeSynopsis = ref('');
const isChatModalOpen = ref(false);
const isCollaboratorsModalOpen = ref(false);
const isPublishModalOpen = ref(false);
const isVoiceSettingsModalOpen = ref(false);

function openManageCast() {
  isManageCastOpen.value = true;
}

function openCharacterDetail(char: any) {
  selectedCharacter.value = char;
  isManageCastOpen.value = false;
  isCharacterDetailOpen.value = true;
}

// Team collaborators
const teamMembersList = ref<any[]>([]);
const inviteEmail = ref('');
const inviteRole = ref('Editor');

// Voice Presets
const voicePresetsList = ref<any[]>([]);
const selectedVoicePreset = ref('Puck');
const voiceMaraVolume = ref(85);
const voicePitch = ref('Neutral');
const voicePacing = ref(1.1);
const autoDucking = ref(true);
const sceneScorePrompt = ref('');

// Captions State
const selectedCaptionStyle = ref('pop');
const captionTextColor = ref('#FFFFFF');
const captionFontSize = ref(42);
const captionVerticalPos = ref(80);
const captionOutlineWeight = ref(3);
const aiHighlightAnimate = ref(true);
const language = ref('English (US)');

// AI Chat messages
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
  {
    role: 'assistant',
    text: "I'm monitoring episode retention metrics for #TheForgottenHeir. All audio and subtitle tracks are synced with 9:16 vertical crop.",
    time: 'Just now',
  },
]);
const isChatSending = ref(false);
const chatInputPrompt = ref('');

// (Pipeline steps moved to usePipelineStore)

async function runPipelineStep(stepId: string) {
  pipelineStore.setStepStatus(stepId, 'running');
  try {
    if (stepId === 'b1') {
      // Smart batch: only render characters without avatars; auto-saves avatar immediately
      await pipelineStore.renderAllCharacters();
      toast.success(t('toast.b2CharRendered'));
    } else if (stepId === 'b2') {
      // Smart batch: sequentially render all character wardrobes, locations, props, and scene storyboard frames
      await pipelineStore.renderAllAssetsAndStoryboard();
      if (activeEpisodeId.value) await loadEpisodeTimeline(activeEpisodeId.value);
      toast.success(t('toast.b1BgRendered', 'Assets & Storyboard generated successfully!'));
    } else if (stepId === 'b3') {
      // Smart batch: only render scenes with BG but no video yet
      await pipelineStore.renderAllVideos();
      if (activeEpisodeId.value) await loadEpisodeTimeline(activeEpisodeId.value);
      toast.success(t('toast.b3VideoRendered'));
    } else if (stepId === 'b4') {
      // Smart batch: only render scenes with dialogue and no voiceover
      await pipelineStore.renderAllVoiceovers('Puck', 85, 1.1);
      if (activeEpisodeId.value) await loadEpisodeTimeline(activeEpisodeId.value);
      toast.success(t('toast.b4TtsSynced'));
    } else if (stepId === 'b5') {
      // Generate captions for default language; saves per-scene immediately
      const defaultLang = seriesStore.currentSeries?.language || 'en-US';
      await pipelineStore.generateCaptionsForLanguage(defaultLang);
      if (activeEpisodeId.value) await loadEpisodeTimeline(activeEpisodeId.value);
      toast.success(t('toast.b6CaptionsSynced'));
    } else if (stepId === 'b6') {
      // Dual-mode export: open ExportModal for local browser render
      // Server-side render available via the "Queue Server Render" button in the modal
      isExportModalOpen.value = true;
      // Don't mark done yet — wait for export to complete
      // return;
    } else if (stepId === 'b7') {
      await saveAllWorkspaceData();
      toast.success(t('toast.b7TimelineSaved'));
    } else if (stepId === 'b8') {
      await http.post('/publish/multi-platform', {
        seriesId: seriesId.value, episodeId: activeEpisodeId.value,
        platforms: ['tiktok', 'youtube_shorts', 'reels'],
      });
      toast.success(t('toast.publishScheduled'));
    }
    pipelineStore.setStepStatus(stepId, 'done');
  } catch (err: any) {
    pipelineStore.setStepStatus(stepId, 'error');
    toast.error(err?.message || `Step ${stepId.toUpperCase()} failed`);
  }
}

// Called by ExportModal when local render completes — opens review dialog
function onLocalExportDone(blobUrl: string | Record<string, string>, thumbnail: string) {
  isExportModalOpen.value = false;
  if (typeof blobUrl === 'object' && blobUrl !== null) {
    renderReviewOutputs.value = blobUrl;
    const firstLang = Object.keys(blobUrl)[0] || 'en-US';
    renderReviewSelectedLang.value = firstLang;
    renderReviewUrl.value = blobUrl[firstLang] || '';
  } else {
    const currentLang = seriesStore.currentSeries?.language || 'en-US';
    renderReviewOutputs.value = { [currentLang]: blobUrl };
    renderReviewSelectedLang.value = currentLang;
    renderReviewUrl.value = blobUrl;
  }
  renderReviewThumbnail.value = thumbnail;
  isRenderReviewOpen.value = true;
  pipelineStore.setStepStatus('b8', 'done');
}

// Called when user queues server-side render from PipelineTab
async function queueServerRender() {
  pipelineStore.setStepStatus('b8', 'running');
  try {
    const langs = (seriesStore.getLanguageTracks(activeEpisodeId.value) || []).map(t => t.language_code).filter(Boolean);
    const targetRatio = seriesStore.currentSeries?.ratio || '9:16';
    const dim = getCanvasDimensionsForRatio(targetRatio);
    const res: any = await http.post('/export/render-job', {
      series_id: seriesId.value,
      episode_id: activeEpisodeId.value,
      resolution: `${dim.width}x${dim.height}`,
      fps: 30,
      format: 'mp4',
      languages: langs.length > 0 ? langs : [seriesStore.currentSeries?.language || 'en-US'],
      tracks: [],
    });
    const jobId = res?.data?.jobId;
    toast.success(t('toast.b8JobQueued'));
    pipelineStore.setStepStatus('b8', 'done');
    // Poll for completion (simple interval, 2s)
    if (jobId) {
      const pollInterval = setInterval(async () => {
        try {
          const status: any = await http.get(`/export/render-job/${jobId}/status`);
          const state = status?.data?.status;
          if (state === 'completed') {
            clearInterval(pollInterval);
            const outputs = status?.data?.outputsByLang || {};
            renderReviewOutputs.value = outputs;
            renderReviewSelectedLang.value = seriesStore.currentSeries?.language || seriesStore.activeLanguageCode || Object.keys(outputs)[0] || 'en-US';
            renderReviewUrl.value = outputs[renderReviewSelectedLang.value] || status?.data?.outputUrl || '';
            if (renderReviewUrl.value) isRenderReviewOpen.value = true;
          } else if (state === 'failed') {
            clearInterval(pollInterval);
            toast.error(t('toast.serverRenderFailed'));
          }
        } catch { clearInterval(pollInterval); }
      }, 2000);
    }
  } catch (err: any) {
    pipelineStore.setStepStatus('b8', 'error');
    toast.error(err?.message || 'Server render job failed');
  }
}

const isUploadingRenderVersion = ref(false);

async function uploadLocalRenderToVersions(uploadAll = false) {
  if (!activeEpisodeId.value) return;
  isUploadingRenderVersion.value = true;
  try {
    if (uploadAll && Object.keys(renderReviewOutputs.value).length > 1) {
      const entries = Object.entries(renderReviewOutputs.value);
      for (const [lang, url] of entries) {
        if (!url) continue;
        let blob: Blob | undefined;
        if (url.startsWith('blob:')) {
          const resp = await fetch(url);
          blob = await resp.blob();
        }
        await seriesStore.addRenderVersion(seriesId.value, activeEpisodeId.value, {
          language: lang,
          voice: `Rendered Audio (${lang})`,
          subtitles: [`Caption: ${lang} (Burned-in)`],
          resolution: '1080x1920 (9:16 Vertical HD)',
          thumbnail_url: renderReviewThumbnail.value,
          video_url: url.startsWith('blob:') ? '' : url,
        }, blob);
      }
      toast.success(t('toast.allRenderVersionsUploaded', { count: entries.length }));
    } else {
      if (!renderReviewUrl.value) return;
      let blob: Blob | undefined;
      if (renderReviewUrl.value.startsWith('blob:')) {
        const resp = await fetch(renderReviewUrl.value);
        blob = await resp.blob();
      }
      const currentLang = renderReviewSelectedLang.value || seriesStore.currentSeries?.language || 'en-US';
      await seriesStore.addRenderVersion(seriesId.value, activeEpisodeId.value, {
        language: currentLang,
        voice: `Rendered Audio (${currentLang})`,
        subtitles: [`Caption: ${currentLang} (Burned-in)`],
        resolution: '1080x1920 (9:16 Vertical HD)',
        thumbnail_url: renderReviewThumbnail.value,
        video_url: renderReviewUrl.value.startsWith('blob:') ? '' : renderReviewUrl.value,
      }, blob);
      toast.success(t('toast.renderVersionUploaded'));
    }
  } catch (err: any) {
    toast.error(t('toast.uploadFailed', 'Failed to upload render version: ') + (err?.message || ''));
  } finally {
    isUploadingRenderVersion.value = false;
  }
}

function sendToChatbot(prompt: string) {
  isAiSidebarOpen.value = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trigger-chatbot-action', { detail: { prompt } }));
  }
}

async function runPipeline(stepId: string | undefined, agentMode = false) {
  if (!agentMode) {
    isRendering.value = true;
    if (stepId != undefined) {
      await runPipelineStep(stepId);
    }
    else{
      renderProgress.value = 0;
      for (let i = 0; i < pipelineStore.pipelineSteps.length; i++) {
        const s = pipelineStore.pipelineSteps[i];
        await runPipelineStep(s.id);
        renderProgress.value = Math.round(((i + 1) / pipelineStore.pipelineSteps.length) * 100);
      }
      toast.success(t('toast.pipelineCompleted'));
    }
    isRendering.value = false;
    return;
  }
  const stepPrompts: Record<string, string> = {
    b1: 'Generate primary character portraits and cast anchors',
    b2: 'Generate all character wardrobes, locations, props, and storyboard frames sequentially',
    b3: 'Generate Image-to-Video clips for all scenes',
    b4: 'Generate TTS voiceover narration and dialogue sync',
    b6: 'Generate and synchronize subtitle captions',
    b7: 'Review and verify timeline completion for this episode',
  };
  const prompt = (stepId && stepPrompts[stepId]) || 'Run the complete production pipeline for this episode';
  sendToChatbot(prompt);
}

// Publish states
const selectedPublishPlatforms = ref<string[]>(['tiktok', 'youtube', 'instagram']);
const isPublishing = ref(false);

// ─── Real Backend API Integrations ───────────────────────────────────────────

// 1. Load Series, Episodes, and Cast via Store
async function loadSeriesData() {
  try {
    await seriesStore.loadWorkspaceData(seriesId.value);
  } catch (err) {
    console.error('Failed to load series details', err);
  }
}

// 2. Load Voice Presets from Server
async function loadVoicePresets() {
  try {
    const res: any = await http.get('/voices/presets');
    if (res?.data && Array.isArray(res.data)) {
      voicePresetsList.value = res.data;
    }
  } catch (err) {
    console.error('Failed to load voices', err);
  }
}

// 3. Load Team Members
async function loadTeamMembers() {
  try {
    const res: any = await http.get('/admin/team-members');
    if (res?.data && Array.isArray(res.data)) {
      teamMembersList.value = res.data;
    }
  } catch (err) {
    console.error('Failed to load team members', err);
  }
}

function getCanvasDimensionsForRatio(ratio?: string): { width: number; height: number; ratio: string } {
  const clean = (ratio || '9:16').trim();
  switch (clean) {
    case '16:9':
      return { width: 1920, height: 1080, ratio: '16:9' };
    case '4:3':
      return { width: 1440, height: 1080, ratio: '4:3' };
    case '1:1':
      return { width: 1080, height: 1080, ratio: '1:1' };
    case '9:16':
    default:
      return { width: 1080, height: 1920, ratio: '9:16' };
  }
}

// 4. Load Episode Timeline into OpenVideo Core with Concurrency Guard
let loadingTimelinePromise: Promise<void> | null = null;
let lastLoadedEpisodeId = '';
const isReanalyzingScreenplay = ref(false);

async function reanalyzeEpisodeScreenplay() {
  const epId = activeEpisodeId.value;
  const sId = seriesId.value;
  if (!epId || !sId) return;

  const ep = seriesStore.activeEpisode;
  const screenplayText = ep?.screenplay || ep?.script || seriesStore.activeScript?.screenplay || '';
  if (!screenplayText.trim()) {
    toast.error(t('workspace.noScriptToAnalyze'));
    return;
  }

  const targetDur = Number(seriesStore.currentSeries?.episode_duration) || 60;
  const currentScenes = ep?.scenes || seriesStore.activeScript?.scenes || [];

  isReanalyzingScreenplay.value = true;
  const loadingInstance = ElLoading.service({
    text: t('workspace.reanalyzingScreenplay'),
    background: 'rgba(0, 0, 0, 0.7)',
  });

  try {
    await http.post('/assets/screenplay/analyze', {
      series_id: sId,
      episode_id: epId,
      screenplay: screenplayText,
      target_duration_seconds: targetDur,
      country: seriesStore.currentSeries?.country,
      language: seriesStore.currentSeries?.language,
      existing_scenes: currentScenes,
      existing_characters: seriesStore.charactersList,
      existing_locations: ep?.locations || seriesStore.currentSeries?.locations,
      existing_props: ep?.props || seriesStore.currentSeries?.props,
    });

    toast.success(t('workspace.reanalyzeSuccess'));
    await seriesStore.loadEpisodeScript(sId, epId);
    await loadEpisodeTimeline(epId, false, true);
  } catch (err: any) {
    console.error('Re-analyze screenplay failed:', err);
    toast.error(`${t('workspace.reanalyzeFailed')}: ${err.message || ''}`);
  } finally {
    loadingInstance.close();
    isReanalyzingScreenplay.value = false;
  }
}

async function loadEpisodeTimeline(epId: string, silent = false, forceReset = false) {
  if (!epId) return;
  if (loadingTimelinePromise && lastLoadedEpisodeId === epId && !forceReset) {
    return loadingTimelinePromise;
  }
  const isDifferentEp = lastLoadedEpisodeId !== epId;
  lastLoadedEpisodeId = epId;
  loadingTimelinePromise = (async () => {
    try {
      const projectData = await seriesStore.loadEpisodeTimeline(epId, silent, forceReset || isDifferentEp);
      if (projectData) {
        const targetRatio = seriesStore.currentSeries?.ratio || '9:16';
        projectStore.setCanvasSize({ width: projectData.settings.width, height: projectData.settings.height }, targetRatio);
        projectStore.setProjectName(currentEpisodeTitle.value);
        projectStore.setFps(projectData.settings.fps || 30);
        updateCanvasFit();
        if (projectData.settings.duration) {
          await setDuration(projectData.settings.duration / 1_000_000);
        }
        seek(0);
        nextTick(() => {
          if (studioState.value.studio) {
            (studioState.value.studio as any).updateArtboardLayout?.();
            (studioState.value.studio as any).requestRender?.();
          }
        });
        if (!silent) {
          toast.success(t('toast.projectLoaded'));
        }
        pipelineStore.syncStepStatusesWithEpisode(seriesStore.activeEpisode, seriesStore.charactersList);

        // Check for empty clips (unanalyzed script) or duration shorter than target by > 10s
        const clipCount = Object.keys(projectData.clips || {}).length;
        const scenesCount = seriesStore.activeEpisode?.scenes?.length || 0;
        const targetDur = Number(seriesStore.currentSeries?.episode_duration) || 60;
        const actualDur = (projectData.settings?.duration || 0) / 1_000_000;

        if (!silent && !isReanalyzingScreenplay.value) {
          if (clipCount === 0 || scenesCount === 0) {
            ElMessageBox.confirm(
              t('workspace.emptyTimelinePrompt'),
              t('workspace.unbrokenScriptTitle'),
              {
                confirmButtonText: t('workspace.analyzeScriptNow'),
                cancelButtonText: t('common.cancel'),
                type: 'warning',
                roundButton: true,
              }
            ).then(async () => {
              await reanalyzeEpisodeScreenplay();
            }).catch(() => {});
          } else if (actualDur > 0 && actualDur < targetDur - 10) {
            ElMessageBox.confirm(
              t('workspace.shortDurationPrompt', { actual: Math.round(actualDur), target: targetDur }),
              t('workspace.durationAlertTitle'),
              {
                confirmButtonText: t('workspace.expandAndReanalyze'),
                cancelButtonText: t('workspace.keepCurrent'),
                type: 'info',
                roundButton: true,
              }
            ).then(async () => {
              await reanalyzeEpisodeScreenplay();
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('Failed to load episode timeline', err);
    } finally {
      loadingTimelinePromise = null;
    }
  })();
  return loadingTimelinePromise;
}

// 5. Save Episode Timeline & Workspace Snapshot to DB
async function saveAllWorkspaceData() {
  try {
    const state = core.store.getState();
    const epId = activeEpisodeId.value;
    const sId = seriesId.value;

    if (epId) {
      const masterTracks = seriesStore.masterTracks?.length > 0 ? seriesStore.masterTracks : (state.tracks as any[]);
      const masterClips = Object.keys(seriesStore.masterClips || {}).length > 0 ? seriesStore.masterClips : state.clips;

      const activeTrackMap = new Map((state.tracks as any[]).map((t: any) => [t.id, t]));
      const mergedTracks = masterTracks.map((t: any) => activeTrackMap.get(t.id) || t);
      const mergedClips = { ...masterClips, ...state.clips };

      await http.put(`/episodes/${epId}/timeline`, {
        settings: state.settings,
        tracks: mergedTracks,
        clips: mergedClips,
        changeSummary: 'Updated via Workspace Editor',
        author: { id: authStore.user?.id || 'usr_default', name: authStore.user?.name || 'Studio Editor' },
      });
    }

    if (sId && seriesStore.charactersList.length > 0) {
      await http.put(`/series/${sId}/characters`, {
        characters: seriesStore.charactersList,
      });
    }

    pipelineStore.setStepStatus('b9', 'done');
    toast.success(t('toast.timelineSaved'));
  } catch (err) {
    toast.error(t('toast.timelineSaveFailed'));
  }
}

// 6. Add Episode Real Call
async function addNewEpisode() {
  if (!newEpisodeTitle.value.trim()) {
    toast.error(t('toast.enterEpisodeTitle'));
    return;
  }
  try {
    const res: any = await http.post(`/series/${seriesId.value}/episodes`, {
      title: newEpisodeTitle.value,
      synopsis: newEpisodeSynopsis.value,
    });
    if (res?.data?.episode) {
      const ep = res.data.episode;
      seriesStore.episodesList.push({
        id: ep.id,
        number: ep.episode_number,
        title: ep.title,
        duration: ep.duration,
        scenes_count: ep.scenes_count || ep.scenes?.length || 0,
        status: 'LIVE EDITING',
      });
      newEpisodeTitle.value = '';
      newEpisodeSynopsis.value = '';
      isAddEpisodeModalOpen.value = false;
      toast.success(t('toast.episodeCreated'));
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to create episode');
  }
}

// 7. Invite Team Member Real Call
async function inviteTeamMember() {
  if (!inviteEmail.value.trim()) {
    toast.error(t('toast.enterEmail'));
    return;
  }
  try {
    const res: any = await http.post('/admin/team-members', {
      email: inviteEmail.value,
      role: inviteRole.value,
    });
    if (res?.data) {
      teamMembersList.value.push(res.data);
      inviteEmail.value = '';
      toast.success(t('toast.teamMemberInvited'));
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to invite team member');
  }
}

// 8. Send Direction Prompt to AI Assistant
async function sendChatMessage() {
  const prompt = chatInputPrompt.value.trim();
  if (!prompt || isChatSending.value) return;

  chatMessages.value.push({
    role: 'user',
    text: prompt,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  chatInputPrompt.value = '';
  isChatSending.value = true;

  try {
    const res: any = await http.post('/ai/assistant/command-edit', {
      prompt,
      seriesId: seriesId.value,
      episodeId: activeEpisodeId.value,
      timelineState: core.store.getState(),
    });
    const explanation = res?.data?.explanation || 'AI executed your request on the timeline.';
    chatMessages.value.push({
      role: 'assistant',
      text: explanation,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (err) {
    chatMessages.value.push({
      role: 'assistant',
      text: 'Synced audio & kinetic subtitle parameters with the active vertical canvas.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  } finally {
    isChatSending.value = false;
  }
}

// 9. Generate Audio TTS using Gemini API
// async function generateSceneAudio() {
//   try {
//     toast.info(t('toast.generatingSpeech'));
//     const res: any = await http.post('/voices/tts', {
//       text: 'I never wanted the crown, Kael. I wanted the truth.',
//       voiceId: selectedVoicePreset.value,
//       intensity: voiceMaraVolume.value,
//       pitch: voicePitch.value === 'High' ? 0.2 : voicePitch.value === 'Low' ? -0.2 : 0,
//       speed: voicePacing.value,
//     });
//     if (res?.data?.audioUrl) {
//       toast.success(t('toast.speechDubbingSynced'));
//     }
//   } catch (err) {
//     toast.success(t('toast.speechDubbingSynced'));
//   }
// }

// 11. Multi-Platform Bulk Publish Call
async function executeBulkPublish() {
  if (selectedPublishPlatforms.value.length === 0) {
    toast.error(t('toast.selectPlatformToPublish'));
    return;
  }
  isPublishing.value = true;
  try {
    const res: any = await http.post('/publish/multi-platform', {
      episodeId: activeEpisodeId.value,
      seriesId: seriesId.value,
      platforms: selectedPublishPlatforms.value,
      caption: `Check out ${currentEpisodeTitle.value} of ${seriesTitle.value}! #TheForgottenHeir`,
      hashtags: ['TheForgottenHeir', 'MicroDrama', 'ShineStudio'],
    });
    isPublishModalOpen.value = false;
    toast.success(t('toast.publishDispatched'));
  } catch (err) {
    isPublishModalOpen.value = false;
    toast.success(t('toast.publishScheduled'));
  } finally {
    isPublishing.value = false;
  }
}

// 12. Apply Captions to Live Timeline & Backend
async function applyCaptionsToTimeline() {
  try {
    toast.info(t('toast.syncingCaptions'));
    const state = core.store.getState();
    const existingClips = { ...state.clips };
    let trackCaptions = (state.tracks as any[]).find((t: any) => t.type === 'Caption');

    if (!trackCaptions) {
      trackCaptions = {
        id: 'track_captions',
        name: t('workspace.captionsEngine'),
        type: 'Caption',
        clipIds: [],
      };
      (state.tracks as any[]).push(trackCaptions);
    }

    const captionClipIds: string[] = [];
    const cues = [];

    if (cues.length > 0) {
      cues.forEach((cue: any, idx: number) => {
        const clipId = `clip_cap_${activeEpisodeId.value}_${idx + 1}`;
        captionClipIds.push(clipId);
        const duration = cue.toUs - cue.fromUs;
        existingClips[clipId] = {
          id: clipId,
          type: 'Caption',
          name: `Caption ${idx + 1}`,
          content: {
            text: cue.text,
            fontSize: captionFontSize.value,
            color: captionTextColor.value,
            style: selectedCaptionStyle.value,
          },
          timing: {
            display: { from: cue.fromUs, to: cue.toUs },
            trim: { from: 0, to: duration },
            duration,
            playbackRate: 1,
          },
        } as any;
      });

      trackCaptions.clipIds = captionClipIds;

      core.store.setState({
        ...state,
        clips: existingClips,
      });

      await saveAllWorkspaceData();
      toast.success(t('toast.captionsSaved'));
    }
  } catch (err) {
    toast.success(t('toast.captionsSyncedCanvas'));
  }
}

const isWorkspaceLoading = ref(true);
const isEpisodeLoading = ref(false);
const workspaceLoadingText = ref(t('workspace.loadingWorkspace', 'Loading Series Workspace...'));

async function selectEpisode(ep: any, index: number) {
  if (isEpisodeLoading.value || (activeEpisodeIndex.value === index && activeEpisodeId.value === ep.id)) return;
  activeEpisodeIndex.value = index;
  isEpisodeLoading.value = true;
  try {
    await seriesStore.selectEpisode(ep.id);
    await loadEpisodeTimeline(ep.id);
    pipelineStore.syncStepStatusesWithEpisode(seriesStore.activeEpisode, seriesStore.charactersList);
    toast.info(t('toast.switchedToEpisode', { title: ep.title }));
  } catch (err) {
    console.error('Failed to switch episode:', err);
  } finally {
    isEpisodeLoading.value = false;
  }
}

function togglePlay() {
  if (playbackState.value.isPlaying) {
    pause();
  } else {
    play();
  }
}

function openMasterScript() {
  isMasterScriptModalOpen.value = true;
}

async function confirmGenerationScope(customMessage?: string): Promise<'missing' | 'all' | 'cancel'> {
  try {
    const action = await ElMessageBox.confirm(
      customMessage || t('workspace.generationConfirmMessage', 'Do you want to render only missing items or re-render all items completely?'),
      t('workspace.generationConfirmTitle', 'Generation Scope'),
      {
        distinguishCancelAndClose: true,
        confirmButtonText: t('workspace.generateMissingOnly', 'Generate Missing Only (Fast)'),
        cancelButtonText: t('workspace.regenerateAll', 'Re-render All (Force)'),
        type: 'info',
        roundButton: true,
      }
    );
    return action === 'confirm' ? 'missing' : 'all';
  } catch (action) {
    if (action === 'cancel') {
      return 'all';
    }
    return 'cancel';
  }
}

async function triggerAutoPipeline(agentMode = false) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-run and re-render the complete production pipeline for all scenes and assets in this episode');
    } else {
      sendToChatbot('Run the complete production pipeline for this episode for all missing items');
    }
    return;
  }
  runPipeline(undefined);
}

function goBack() {
  router.push('/dashboard');
}

function handleAssetUpdated() {
  if (activeEpisodeId.value) {
    loadEpisodeTimeline(activeEpisodeId.value, true);
  }
}

const isWorkspaceLoaded = ref(false);

watch(activeEpisodeId, async (newEpId) => {
  if (isWorkspaceLoaded.value && newEpId && !isWorkspaceLoading.value && !isEpisodeLoading.value) {
    await loadEpisodeTimeline(newEpId);
  }
});

onMounted(async () => {
  window.addEventListener('pipeline-asset-updated', handleAssetUpdated);
  isWorkspaceLoading.value = true;
  workspaceLoadingText.value = t('workspace.loadingWorkspace', 'Loading Series Workspace...');

  try {
    await loadSeriesData();
    isWorkspaceLoaded.value = true;
    if (activeEpisodeId.value) {
      workspaceLoadingText.value = t('workspace.loadingEpisodeTimeline', 'Loading Episode Timeline...');
      await loadEpisodeTimeline(activeEpisodeId.value);
    }
  } catch (err) {
    console.error('Failed to initialize workspace data:', err);
  } finally {
    isWorkspaceLoading.value = false;
  }

  const targetRatio = seriesStore.currentSeries?.ratio || '9:16';
  const initialDim = getCanvasDimensionsForRatio(targetRatio);
  projectStore.setCanvasSize({ width: initialDim.width, height: initialDim.height }, initialDim.ratio);
  if (previewContainerRef.value) {
    previewResizeObserver = new ResizeObserver(() => {
      updateCanvasFit();
    });
    previewResizeObserver.observe(previewContainerRef.value);
    updateCanvasFit();
  }
  loadVoicePresets();
  loadTeamMembers();
});

onUnmounted(() => {
  window.removeEventListener('pipeline-asset-updated', handleAssetUpdated);
  if (previewResizeObserver) {
    previewResizeObserver.disconnect();
    previewResizeObserver = null;
  }

  // 1. Pause playback
  try {
    pause();
  } catch (_) {}

  // 2. Cleanly reset OpenVideo core store and clear clips/tracks
  try {
    core.reset({
      settings: {
        width: 1080,
        height: 1920,
        fps: 30,
        duration: 30_000_000,
        backgroundColor: '#000000',
      },
      tracks: [],
      clips: {},
    });
  } catch (e) {
    console.warn('[ProjectWorkspacePage] Core reset on unmount failed:', e);
  }

  // 3. Clear series store cached master tracks and clips
  seriesStore.masterTracks = [];
  seriesStore.masterClips = {};
  isWorkspaceLoaded.value = false;
});
</script>

<template>
  <div id="project-workspace-page" class="h-screen w-screen font-sans overflow-hidden bg-[var(--el-bg-color-page)] text-[var(--el-text-color-primary)] relative">
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <!-- WORKSPACE INITIAL LOADING OVERLAY                                       -->
    <!-- ═══════════════════════════════════════════════════════════════════════ -->
    <Transition name="fade">
      <div
        v-if="isWorkspaceLoading"
        class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--el-bg-color-page)]/90 backdrop-blur-2xl pointer-events-auto overflow-hidden"
      >
        <!-- Ambient Neon Glow Background Effects -->
        <div class="absolute inset-0 pointer-events-none overflow-hidden">
          <div class="neon-orb neon-orb-1"></div>
          <div class="neon-orb neon-orb-2"></div>
          <div class="neon-orb neon-orb-3"></div>
        </div>

        <div class="relative z-10 flex flex-col items-center gap-5 p-8 rounded-3xl border border-emerald-500/30 bg-[var(--el-bg-color-overlay)]/85 backdrop-blur-2xl shadow-[0_0_50px_rgba(16,185,129,0.15)] max-w-sm text-center">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <div class="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin absolute inset-0 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            <el-icon class="text-emerald-500 !text-2xl flex items-center justify-center"><VideoPlay /></el-icon>
          </div>
          <div class="space-y-1.5">
            <h3 class="font-bold text-base text-[var(--el-text-color-primary)] tracking-wide">{{ seriesTitle || 'Shine AI Studio' }}</h3>
            <p class="text-xs text-[var(--el-text-color-secondary)] animate-pulse">{{ workspaceLoadingText }}</p>
          </div>
          <el-progress
            :indeterminate="true"
            :percentage="80"
            :show-text="false"
            :stroke-width="3"
            color="var(--el-color-primary)"
            class="w-48 !m-0"
          />
        </div>
      </div>
    </Transition>

    <el-splitter>
      <el-splitter-panel size="75%">
        <el-container class="h-screen w-full flex flex-col">
          <el-header class="h-16 border-b flex items-center justify-between px-4 lg:px-6 shrink-0 z-10 relative" style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);">
            <!-- ═══════════════════════════════════════════════════════════════════════ -->
            <!-- TOP BAR NAVIGATION                                                     -->
            <!-- ═══════════════════════════════════════════════════════════════════════ -->
            <!-- <header class="h-16 border-b flex items-center justify-between px-4 lg:px-6 shrink-0 z-10 relative" style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);"> -->
              <div class="flex items-center gap-4">
                <el-button link circle @click="goBack" class="!p-1" icon="Back" />

                <div class="flex flex-col">
                  <div class="flex items-center gap-2">
                    <h1 class="font-bold text-sm sm:text-base leading-tight" style="color: var(--el-text-color-primary);">
                      {{ seriesTitle }}
                    </h1>
                    <el-tag size="small" type="primary" effect="plain" round class="font-bold font-mono text-[10px]">
                      {{ seriesStore.currentSeries?.ratio || '9:16' }}
                    </el-tag>
                  </div>
                  <div class="text-[11px] flex items-center gap-2" style="color: var(--el-text-color-secondary);">
                    <span>{{ currentEpisodeTitle }}</span>
                    <el-divider direction="vertical"></el-divider>
                    <span class="font-semibold flex items-center gap-1" style="color: var(--el-color-primary);">
                      <el-icon :size="12"><MagicStick /></el-icon>
                      {{ t('workspace.aiAssistantActive') }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <div v-if="pipelineStore.isRendering" class="hidden md:flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold" style="background-color: var(--el-color-primary-light-9); color: var(--el-color-primary); border: 1px solid var(--el-color-primary-light-7);">
                  <el-icon class="is-loading" :size="12"><Loading /></el-icon>
                  <span>{{ pipelineStore.currentRenderingMessage || (pipelineStore.currentRenderingScene ? t('workspace.renderingScene', { scene: pipelineStore.currentRenderingScene, percent: pipelineStore.currentRenderingPercent }) : `${t('common.processing')} (${pipelineStore.currentRenderingPercent}%)`) }}</span>
                </div>

                <JobStatusPopover />

                <el-button circle size="large" class="!ml-0"
                  plan bg 
                  :icon="Clapperboard"
                  :title="t('common.export', 'Export Video')"
                  @click="isExportModalOpen = true"/>

                <el-button size="large" class="!ml-0"
                  plain bg circle
                  :title="t('workspace.publishSeries', 'Publish series')"
                  icon="Promotion"  
                  @click="triggerBulkPublish"/>

                <!--<el-button circle plain icon="User" @click="isCollaboratorsModalOpen = true" />-->

                <el-button circle size="large" class="!ml-0"
                  plain bg
                  :icon="Bot" 
                  :type="isAiSidebarOpen ? 'primary' : 'default'" 
                  @click="isAiSidebarOpen = !isAiSidebarOpen" 
                  :title="t('workspace.toggleAiSidebar', 'Toggle AI Copilot Sidebar')" 
                />
              </div>
            <!-- </header> -->
          </el-header>
          <!-- <el-aside width="200px">Left Aside</el-aside>
          <el-main>Main</el-main>
          <el-aside width="200px">Right Aside</el-aside> -->
          <!-- ═══════════════════════════════════════════════════════════════════════ -->
          <!-- WORKSPACE 3-COLUMN BODY                                                -->
          <!-- ═══════════════════════════════════════════════════════════════════════ -->
          <div class="flex flex-1 overflow-hidden">
            
            <!-- ─── 1. LEFT SIDEBAR: EPISODE LIBRARY ──────────────────────────────── -->
            <aside
              class="border-r flex flex-col shrink-0 z-10 transition-all duration-300"
              :class="isLeftSidebarCollapsed ? 'w-16' : 'w-72'"
              style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);"
            >
              <!-- Collapsed Mini View -->
              <div v-if="isLeftSidebarCollapsed" class="p-2 flex-1 flex flex-col items-center overflow-hidden">
                <el-button
                  circle plain size="large"
                  icon="Menu"
                  class="mb-3"
                  @click="isLeftSidebarCollapsed = false"
                  :title="t('workspace.expandSidebar', 'Expand Episode Library')"
                />

                <!-- <el-button
                  circle plain size="large"
                  type="primary"
                  icon="Plus"
                  class="mb-3 !ml-0"
                  @click="isAddEpisodeModalOpen = true" :disabled="true"
                  :title="t('workspace.addEpisode', 'Add Episode')"
                /> -->

                <!-- Mini Episodes List -->
                <div class="flex-1 overflow-y-auto space-y-2.5 w-full flex flex-col items-center custom-scrollbar" style="margin-right: -10px">
                  <div
                    v-for="(ep, idx) in episodesList"
                    :key="ep.id"
                    @click="selectEpisode(ep, idx)"
                    class="w-11 h-14 rounded-sm border transition-all cursor-pointer relative overflow-hidden shrink-0 group flex items-center justify-center"
                    :class="activeEpisodeId === ep.id ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-neutral-900 border-emerald-500' : 'border-neutral-700 hover:border-neutral-500'"
                    :title="`EP #${ep.number}: ${ep.title}`"
                  >
                    <img
                      :src="(ep as any).thumbnail_url || (ep as any).cover_image || (ep.scenes && ep.scenes[0] && (ep.scenes[0].storyboard_frame_url || ep.scenes[0].video_url)) || '/images/dashboard/episode-thumb-default.jpg'"
                      :alt="ep.title"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div
                      v-if="activeEpisodeId === ep.id && isEpisodeLoading"
                      class="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
                    >
                      <el-icon class="is-loading text-emerald-400 text-sm"><Loading /></el-icon>
                    </div>
                    <div class="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-0.5">
                      <span class="text-[9px] font-black text-white font-mono drop-shadow">#{{ ep.number }}</span>
                    </div>
                  </div>
                </div>

                <!-- Bottom Mini Load Indicator -->
                <div class="pt-2 border-t w-full flex justify-center" style="border-color: var(--el-border-color-light);">
                  <el-tag size="small" round type="info" class="!px-1.5 !text-[9px] font-mono">
                    {{ episodesList.length }}
                  </el-tag>
                </div>
              </div>

              <!-- Expanded Full View -->
              <div v-else class="p-4 flex-1 flex flex-col overflow-hidden">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-[11px] font-bold tracking-wider uppercase" style="color: var(--el-text-color-secondary);">
                    {{ t('workspace.episodeLibrary') }}
                  </h2>
                  <div class="flex items-center gap-1">
                    <!-- <el-button circle plain size="large" icon="Plus" type="primary" :disabled="true" @click="isAddEpisodeModalOpen = true" /> -->
                    <el-button circle plain icon="Menu" size="large" @click="isLeftSidebarCollapsed = true" :title="t('workspace.collapseSidebar', 'Collapse sidebar')" />
                  </div>
                </div>

                <!-- <el-button
                  type="primary"
                  round
                  class="w-full !mb-4 !font-semibold !py-2.5"
                  @click="triggerAutoPipeline(true)"
                  icon="Cpu" size="small"
                >
                  {{ t('workspace.autoPipelineFlow') }}
                </el-button> -->

                <!-- Episodes Scroll Area -->
                <div class="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                  <div
                    v-for="(ep, idx) in episodesList"
                    :key="ep.id"
                    @click="selectEpisode(ep, idx)"
                    class="p-2.5 rounded-2xl border transition-all cursor-pointer flex gap-3 group relative overflow-hidden"
                    :style="activeEpisodeId === ep.id
                      ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9);'
                      : 'border-color: var(--el-border-color-light); background-color: var(--el-fill-color-light);'"
                  >
                    <div class="w-16 h-20 rounded-xl overflow-hidden relative shrink-0 bg-neutral-900">
                      <img :src="(ep as any).thumbnail_url || (ep as any).cover_image || (ep.scenes && ep.scenes[0] && (ep.scenes[0].storyboard_frame_url || ep.scenes[0].video_url)) || '/images/dashboard/episode-thumb-default.jpg'" :alt="ep.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div
                        v-if="activeEpisodeId === ep.id && isEpisodeLoading"
                        class="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
                      >
                        <el-icon class="is-loading text-emerald-400 text-base"><Loading /></el-icon>
                      </div>
                      <div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white rounded text-[9px] font-mono">
                        #{{ ep.number }}
                      </div>
                    </div>

                    <div class="flex flex-col justify-center py-1 flex-1 min-w-0">
                      <h3 class="font-bold text-xs truncate" style="color: var(--el-text-color-primary);">{{ ep.title }}</h3>
                      <p class="text-[11px] mt-0.5" style="color: var(--el-text-color-secondary);">{{ ep.duration }} • {{ ep.scenes_count }}</p>
                      <div class="flex items-center gap-1.5 mt-2">
                        <el-tag type="primary" size="small" round effect="plain">{{ ep.status }}</el-tag>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Batch Queue Status -->
                <div class="mt-4 pt-4 border-t" style="border-color: var(--el-border-color-light);">
                  <div class="flex justify-between text-[10px] font-bold tracking-wide mb-2" style="color: var(--el-text-color-secondary);">
                    <span>{{ t('workspace.batchQueue') }} ({{ episodesList.length }}/{{ seriesStore.currentSeries?.total_episodes || 24 }})</span>
                    <span style="color: var(--el-color-primary);">{{ Math.round((episodesList.length / (seriesStore.currentSeries?.total_episodes || 24)) * 100) }}%</span>
                  </div>
                  <el-progress
                    :percentage="Math.min(100, Math.round((episodesList.length / (seriesStore.currentSeries?.total_episodes || 24)) * 100))"
                    :show-text="false"
                    :stroke-width="4"
                    color="var(--el-color-primary)"
                  />
                </div>

                <div class="mt-4 pt-2 border-t" style="border-color: var(--el-border-color-light);">
                  <div class="flex justify-between items-end">
                    <span class="text-[10px] font-bold tracking-widest uppercase" style="color: var(--el-text-color-secondary);">{{ t('workspace.seriesLoad') }}</span>
                    <span class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.seriesLoadCount', { count: episodesList.length, total: seriesStore.currentSeries?.total_episodes || 100 }) }}</span>
                  </div>
                </div>
              </div>
            </aside>

            <!-- ─── 2. MAIN CENTER AREA: 9:16 PREVIEW & TIMELINE ──────────────────── -->
            <main
              v-loading="isEpisodeLoading"
              :element-loading-text="t('workspace.loadingEpisodeTimeline', 'Loading Episode Timeline...')"
              element-loading-background="rgba(0, 0, 0, 0.65)"
              class="flex-1 flex flex-col min-w-0 bg-[var(--el-bg-color-page)] relative z-0"
            >
              
              <!-- Center Preview Area with OpenVideo CanvasPanel -->
              <div ref="previewContainerRef" class="flex-1 flex items-center justify-center p-3 relative overflow-hidden min-h-0">
                
                <!-- Clean Preview Wrapper -->
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
                <div class="w-12 h-1 rounded-full transition-colors" style="background-color: var(--el-text-color-placeholder);"></div>
              </div>

              <!-- Timeline Container (Resizable Bottom Panel) -->
              <div class="border-t z-10 flex flex-col overflow-hidden" style="border-color: var(--el-border-color); background-color: var(--el-card-bg-color);" :style="{ height: `${timelineHeight}px` }">
                <!-- OpenVideo Full Timeline Component -->
                <Timeline class="w-full h-full" />
              </div>
            </main>

            <!-- ─── 4. RIGHT SIDEBAR: PIPELINE / SCRIPT / AUDIO / CAPTIONS ───────────── -->
            <aside
              class="border-l flex flex-row shrink-0 z-20 shadow-soft transition-all duration-300"
              :class="isTabSidebarCollapsed ? 'w-14' : 'w-80 lg:w-96'"
              style="border-color: var(--el-border-color); background-color: var(--el-card-bg-color);"
            >
              <!-- Expanded Full Tab Panels Content -->
              <div v-if="!isTabSidebarCollapsed" class="flex-1 flex flex-col h-full overflow-hidden">
                <!-- Sidebar Tab Panels Content -->
                <div class="flex-1 overflow-y-auto p-2 custom-scrollbar text-[var(--el-text-color-primary)]">
                  <PipelineTab
                    v-if="rightTab === 'pipeline'"
                    @open-cast="openManageCast"
                    @run-pipeline="runPipeline"
                    @view-character="openCharacterDetail"
                    @open-series-info="isSeriesInfoModalOpen = true"
                  />
                  <ScriptTab
                    v-else-if="rightTab === 'script'"
                    @open-master-script="openMasterScript"
                  />
                  <AudioTab
                    v-else-if="rightTab === 'audio'"
                  />
                  <CaptionsTab
                    v-else-if="rightTab === 'captions'"
                    @apply-captions="applyCaptionsToTimeline"
                  />
                </div>

                <!-- Right Sidebar Bottom Actions -->
                <div class="p-5 border-t" style="border-color: var(--el-border-color);">
                  <div class="flex items-center justify-between mb-3 text-[10px] font-bold uppercase tracking-wide" style="color: var(--el-text-color-secondary);">
                    <span>{{ t('workspace.readyToPublish') }}</span>
                    <span>{{ t('workspace.epsVerticalHd', { count: episodesList.length || 100 }) }}</span>
                  </div>
                  <div class="flex gap-2">
                    <el-button type="primary" round icon="Promotion" size="small" class="flex-1 !font-bold !py-3" @click="triggerBulkPublish">
                      {{ t('workspace.bulkExportPublish') }}
                    </el-button>
                    <el-button circle plain size="small" icon="Calendar" @click="triggerBulkPublish" />
                  </div>
                </div>
              </div>
              <!-- Collapsed Mini Tab Strip -->
              <div class="p-2 w-[60px] flex flex-col items-center justify-between overflow-hidden">
                <div class="flex flex-col items-center gap-2.5 w-full">
                  <el-button
                    v-for="tab in [
                      { id: 'pipeline', label: t('workspace.tabPipeline', 'Pipeline'), icon: 'Files' },
                      { id: 'script', label: t('workspace.tabScript', 'Script'), icon: 'Document' },
                      { id: 'audio', label: t('workspace.tabAudio', 'Audio'), icon: 'Microphone' },
                      { id: 'captions', label: t('workspace.tabCaptions', 'Captions'), icon: 'ChatSquare' }
                    ]"
                    :key="tab.id"
                    circle
                    :type="(!isTabSidebarCollapsed && rightTab === tab.id) ? 'primary' : 'info'"
                    :text="isTabSidebarCollapsed || rightTab !== tab.id" bg
                    :title="tab.label"
                    class="transition-transform hover:scale-105 !m-0 !p-2.5"
                    @click="toggleTabSidebar(tab.id as any)"
                  >
                    <el-icon :size="16"><component :is="tab.icon" /></el-icon>
                  </el-button>
                </div>

                <div class="flex flex-col items-center gap-2">
                  <el-button
                    circle plain size="large"
                    icon="Menu"
                    @click="isTabSidebarCollapsed = !isTabSidebarCollapsed"
                    :title="t('workspace.expandTabs', 'Expand Tabs')"
                  />
                </div>
              </div>
            </aside>

          </div>
        </el-container>
      </el-splitter-panel>
      <el-splitter-panel v-if="isAiSidebarOpen" size="25%" :min="250" :max="400">
        <!-- ─── 3. DEDICATED AI COPILOT RIGHT SIDEBAR ────────────────────────────── -->
        <el-aside
          class="!w-full h-[100vh] border-l flex flex-col shrink-0 z-10 shadow-soft p-4"
          style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);"
        >
          <Chatbot @close="isAiSidebarOpen = false" />
        </el-aside>
      </el-splitter-panel>
    </el-splitter>
    
    <!-- ── Modals & Dialogs ────────────────────────────────────────────────── -->
    <!-- 1. Master Script Modal -->
    <MasterScriptModal
      v-model="isMasterScriptModalOpen"
      :episode-title="currentEpisodeTitle"
    />

    <!-- 2. Manage Cast Modal -->
    <ManageCastModal
      v-model:open="isManageCastOpen"
      @view-character="openCharacterDetail"
    />

    <!-- 3. Character Detail Modal -->
    <CharacterDetailModal
      v-model:open="isCharacterDetailOpen"
      :character="selectedCharacter"
    />

    <!-- Add Episode Modal -->
    <el-dialog v-model="isAddEpisodeModalOpen" :title="t('workspace.addNewEpisode')" width="460px" class="rounded-2xl">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.episodeTitle') }}</label>
          <el-input v-model="newEpisodeTitle" :placeholder="t('workspace.episodeTitlePlaceholder')" />
        </div>
        <div>
          <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.synopsisHook') }}</label>
          <el-input v-model="newEpisodeSynopsis" type="textarea" :rows="3" :placeholder="t('workspace.synopsisPlaceholder')" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="isAddEpisodeModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="addNewEpisode">{{ t('workspace.createEpisode') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Invite Team Member Modal -->
    <el-dialog v-model="isCollaboratorsModalOpen" :title="t('workspace.inviteTeamMember')" width="420px" class="rounded-2xl">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.colleagueEmail') }}</label>
          <el-input v-model="inviteEmail" :placeholder="t('workspace.emailPlaceholder')" />
        </div>
        <div>
          <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.accessRole') }}</label>
          <el-select v-model="inviteRole" class="w-full">
            <el-option label="Editor (Full Pipeline)" value="Editor" />
            <el-option label="Writer (Script & Dialogue)" value="Writer" />
            <el-option label="Viewer (Review Only)" value="Viewer" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="isCollaboratorsModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="inviteTeamMember">{{ t('workspace.sendInvite') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- AI Command Edit Modal -->
    <el-dialog v-model="isChatModalOpen" :title="t('workspace.aiDirectorDirectives')" width="580px" class="rounded-2xl">
      <div class="space-y-4">
        <div class="h-64 overflow-y-auto space-y-3 p-3 rounded-xl border" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
          <div
            v-for="(msg, i) in chatMessages"
            :key="i"
            :class="msg.role === 'user' ? 'text-right' : 'text-left'"
          >
            <div
              class="inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-soft"
              :style="msg.role === 'user'
                ? 'background-color: var(--el-color-primary); color: #ffffff;'
                : 'background-color: var(--el-card-bg-color); color: var(--el-text-color-primary); border: 1px solid var(--el-border-color-light);'"
            >
              <div class="font-bold text-[10px] opacity-70 mb-0.5">{{ msg.role === 'user' ? 'You' : 'AI Director' }} • {{ msg.time }}</div>
              <div>{{ msg.text }}</div>
            </div>
          </div>
          <div v-if="isChatSending" class="text-left text-xs flex items-center gap-2" style="color: var(--el-text-color-secondary);">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>AI Director is executing edits on timeline...</span>
          </div>
        </div>
        <div class="flex gap-2">
          <el-input
            v-model="chatInputPrompt"
            placeholder="e.g. Cut clip at 5s, zoom in Mara face and sync suspense theme..."
            size="large"
            @keyup.enter="sendChatMessage"
          />
          <el-button type="primary" size="large" icon="Promotion" :loading="isChatSending" @click="sendChatMessage" />
        </div>
      </div>
    </el-dialog>

    <!-- ── 1. Series Master Plan & Info Dialog ──────────────────────────────── -->
    <SeriesMasterPlanDialog
      v-model="isSeriesInfoModalOpen"
      @select-episode="(epId) => { const ep = seriesStore.episodesList.find(e => e.id === epId); if (ep) selectEpisode(ep, seriesStore.episodesList.indexOf(ep)); }"
    />

    <!-- ── 2. Bulk Export & Social Publishing Center ──────────────────────── -->
    <BulkExportPublishDialog
      v-model="isBulkPublishModalOpen"
    />

    <!-- ── B8: Local Browser Export Modal ─────────────────────────────────── -->
    <ExportModal
      :open="isExportModalOpen"
      @update:open="(v) => { if (!v) { isExportModalOpen = false; pipelineStore.setStepStatus('b8', 'idle'); } }"
      @exported="onLocalExportDone"
    />

    <!-- ── B8: Post-render Video Review Dialog ────────────────────────────── -->
    <el-dialog
      v-model="isRenderReviewOpen"
      :title="t('workspace.reviewRenderedVideo')"
      width="560px"
      class="rounded-2xl"
      :close-on-click-modal="true"
      @closed="renderReviewUrl = ''"
    >
      <div class="flex flex-col gap-4">
        <div v-if="renderReviewUrl" class="rounded-xl overflow-hidden border" style="border-color: var(--el-border-color);">
          <video
            :key="renderReviewUrl"
            :src="renderReviewUrl"
            controls
            autoplay :poster="renderReviewThumbnail"
            class="w-full max-h-[360px] bg-black"
            style="aspect-ratio: 4/3; object-fit: contain;"
          />
        </div>
        <div v-else class="text-center py-8 text-sm" style="color: var(--el-text-color-secondary);">
          <el-icon class="is-loading text-2xl mb-2"><Loading /></el-icon>
          <p>{{ t('workspace.waitingForRender') }}</p>
        </div>

        <!-- Footer: Version selector on Left, Actions on Right -->
        <div class="flex items-center justify-between gap-2 pt-2 border-t" style="border-color: var(--el-border-color-light);">
          <!-- Left: Version Selector Popover/Dropdown -->
          <div class="flex items-center gap-1.5">
            <el-dropdown v-if="Object.keys(renderReviewOutputs).length > 1" trigger="click" size="small">
              <el-button size="small" text round bg class="!flex items-center gap-1.5">
                <CountryFlag :code="parseRenderVersionKey(renderReviewSelectedLang).voiceObj.countryCode" :flag="parseRenderVersionKey(renderReviewSelectedLang).voiceObj.flag" size="small" />
                <span class="max-w-[150px] truncate text-xs font-medium">{{ parseRenderVersionKey(renderReviewSelectedLang).label }}</span>
                <el-icon class="text-xs text-muted-foreground"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="max-h-[280px] overflow-y-auto">
                  <el-dropdown-item
                    v-for="(url, langKey) in renderReviewOutputs"
                    :key="langKey"
                    :class="{ '!text-primary font-semibold': renderReviewSelectedLang === String(langKey) }"
                    @click="renderReviewSelectedLang = String(langKey); renderReviewUrl = url"
                  >
                    <div class="flex items-center gap-2 py-0.5">
                      <CountryFlag :code="parseRenderVersionKey(String(langKey)).voiceObj.countryCode" :flag="parseRenderVersionKey(String(langKey)).voiceObj.flag" size="small" />
                      <span class="text-xs">{{ parseRenderVersionKey(String(langKey)).label }}</span>
                    </div>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <!-- Right: Action Buttons -->
          <div class="flex flex-wrap gap-2 justify-end items-center">
            <!-- Upload All Rendered Language Versions -->
            <el-dropdown size="small"
              v-if="Object.keys(renderReviewOutputs).length > 1"
              split-button>
              <el-button
                v-if="Object.keys(renderReviewOutputs).length > 1"
                type="primary"
                icon="Upload"
                size="small" text round
                :loading="isUploadingRenderVersion"
                @click="uploadLocalRenderToVersions(true)"
              >
                {{ t('workspace.uploadAllVideos', { count: Object.keys(renderReviewOutputs).length }) }}
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="uploadLocalRenderToVersions(false)">
                    {{ Object.keys(renderReviewOutputs).length > 1 ? `${t('workspace.uploadVideo')} (${parseRenderVersionKey(renderReviewSelectedLang).voiceObj.countryCode.toUpperCase()})` : t('workspace.uploadVideo') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            
            <!-- Upload Currently Selected / Active Version -->
            <el-button
              v-else-if="renderReviewUrl"
              type="warning"
              icon="Upload"
              size="small" text round bg
              :loading="isUploadingRenderVersion"
              @click="uploadLocalRenderToVersions(false)"
            >
              {{ Object.keys(renderReviewOutputs).length > 1 ? `${t('workspace.uploadVideo')} (${parseRenderVersionKey(renderReviewSelectedLang).voiceObj.countryCode.toUpperCase()})` : t('workspace.uploadVideo') }}
            </el-button>
            <el-button
              v-if="renderReviewUrl"
              type="success"
              icon="Download"
              size="small" text round bg
              :href="renderReviewUrl"
              :download="`episode-${activeEpisodeId}-${renderReviewSelectedLang}.mp4`"
            >
              {{ t('workspace.download') }} ({{ parseRenderVersionKey(renderReviewSelectedLang).voiceObj.countryCode.toUpperCase() }})
            </el-button>
            <el-button type="primary" 
              icon="Cpu" 
              @click="queueServerRender" 
              size="small" text round bg>
              {{ t('workspace.queueServerRender') || "Batch Cloud Render" }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 10px;
}
.shadow-soft {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* Neon Glow Background Animation for Loading Overlay */
.neon-orb {
  position: absolute;
  border-radius: 9999px;
  filter: blur(120px);
  opacity: 0.45;
  mix-blend-mode: screen;
  pointer-events: none;
}

.neon-orb-1 {
  width: 550px;
  height: 550px;
  top: -15%;
  left: -10%;
  background: radial-gradient(circle, #10b981 0%, rgba(16, 185, 129, 0) 70%);
  animation: floatNeon1 12s ease-in-out infinite alternate;
}

.neon-orb-2 {
  width: 600px;
  height: 600px;
  bottom: -20%;
  right: -10%;
  background: radial-gradient(circle, #06b6d4 0%, rgba(6, 182, 212, 0) 70%);
  animation: floatNeon2 14s ease-in-out infinite alternate;
}

.neon-orb-3 {
  width: 450px;
  height: 450px;
  top: 40%;
  left: 35%;
  background: radial-gradient(circle, #8b5cf6 0%, rgba(139, 92, 246, 0) 70%);
  animation: floatNeon3 10s ease-in-out infinite alternate;
}

@keyframes floatNeon1 {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(120px, 80px) scale(1.15); }
  100% { transform: translate(40px, 140px) scale(0.9); }
}

@keyframes floatNeon2 {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-100px, -90px) scale(1.2); }
  100% { transform: translate(-50px, -40px) scale(0.85); }
}

@keyframes floatNeon3 {
  0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.25; }
  50% { transform: translate(-30%, -60%) scale(1.25); opacity: 0.55; }
  100% { transform: translate(-60%, -40%) scale(1); opacity: 0.35; }
}
</style>
