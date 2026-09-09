<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { usePlaybackStore } from '@/composables/usePlaybackStore';
import { core } from '@/utils/project';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';

// Extracted Workspace Components
import WorkspaceHeader from './workspace/WorkspaceHeader.vue';
import WorkspaceEpisodeSidebar from './workspace/WorkspaceEpisodeSidebar.vue';
import WorkspaceCanvasArea from './workspace/WorkspaceCanvasArea.vue';
import WorkspaceAddEpisodeModal from './workspace/WorkspaceAddEpisodeModal.vue';
import WorkspaceCollaboratorsModal from './workspace/WorkspaceCollaboratorsModal.vue';
import WorkspaceRenderReviewModal from './workspace/WorkspaceRenderReviewModal.vue';

// Tab Sub-Components
import PipelineTab from './workspace/PipelineTab.vue';
import ScriptTab from './workspace/ScriptTab.vue';
import AssetTab from './workspace/AssetTab.vue';
import StoryboardTab from './workspace/StoryboardTab.vue';
import AudioTab from './workspace/AudioTab.vue';
import CaptionsTab from './workspace/CaptionsTab.vue';
import Chatbot from './workspace/Chatbot.vue';

// Modals & Dialogs
import MasterScriptModal from '@/components/modals/MasterScriptModal.vue';
import ManageCastModal from '@/components/modals/ManageCastModal.vue';
import CharacterDetailModal from '@/components/modals/CharacterDetailModal.vue';
import SeriesMasterPlanDialog from '@/components/workspace/SeriesMasterPlanDialog.vue';
import BulkExportPublishDialog from '@/components/workspace/BulkExportPublishDialog.vue';
import ExportModal from '@/components/editor/ExportModal.vue';

const { t } = useI18n();
const route = useRoute();
const projectStore = useProjectStore();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();
const collaborationStore = useCollaborationStore();
const voiceStore = useVoiceStore();
const { pause } = usePlaybackStore();

// Series & Episode State
const seriesId = computed(() => (route.params.id as string) || 'srs_01');
const seriesTitle = computed(() => seriesStore.currentSeries?.title || 'Micro-Drama Series');
const activeEpisodeId = computed(() => seriesStore.activeEpisodeId);
const currentEpisodeTitle = computed(() => {
  if (seriesStore.activeEpisode) {
    return `EP ${String(seriesStore.activeEpisode.number).padStart(2, '0')}: ${seriesStore.activeEpisode.title.toUpperCase()}`;
  }
  return 'EP TITLE';
});

// Sidebar & Panel Layout States
const isLeftSidebarCollapsed = ref(false);
const isAiSidebarOpen = ref(true);
const isTabSidebarCollapsed = ref(true);
const rightTab = ref<'pipeline' | 'script' | 'assets' | 'storyboard' | 'audio' | 'captions'>('script');

function toggleTabSidebar(tabId: 'pipeline' | 'script' | 'assets' | 'storyboard' | 'audio' | 'captions') {
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

// Watch active language to switch voiceover and caption tracks on OpenVideo Core
watch(() => seriesStore.activeLanguageCode, (activeLang) => {
  if (!activeLang) return;
  seriesStore.setPreviewCaptionLanguage(activeLang);
  seriesStore.setPreviewVoiceLanguage(activeLang);
});

// Loading States
const isWorkspaceLoading = ref(true);
const isEpisodeLoading = ref(false);
const isWorkspaceLoaded = ref(false);
const workspaceLoadingText = ref(t('workspace.loadingWorkspace', 'Loading Series Workspace...'));

// Modals State
const isMasterScriptModalOpen = ref(false);
const isManageCastOpen = ref(false);
const selectedCharacter = ref<any | null>(null);
const isCharacterDetailOpen = ref(false);
const isAddEpisodeModalOpen = ref(false);
const isCollaboratorsModalOpen = ref(false);
const isSeriesInfoModalOpen = ref(false);
const isBulkPublishModalOpen = ref(false);
const isExportModalOpen = ref(false);

// Post-Render Review Dialog State
const isRenderReviewOpen = ref(false);
const renderReviewOutputs = ref<Record<string, string>>({});
const renderReviewThumbnail = ref('');

function openManageCast() {
  isManageCastOpen.value = true;
}

function openCharacterDetail(char: any) {
  selectedCharacter.value = char;
  isManageCastOpen.value = false;
  isCharacterDetailOpen.value = true;
}

function openMasterScript() {
  isMasterScriptModalOpen.value = true;
}

// Check Episode Health / Script Completeness
function checkEpisodeHealth(projectData: any) {
  if (!projectData || seriesStore.isReanalyzingScreenplay) return;
  const clipCount = Object.keys(projectData.clips || {}).length;
  const scenesCount = seriesStore.activeEpisode?.scenes?.length || 0;
  const targetDur = Number(seriesStore.currentSeries?.episode_duration) || 60;
  const actualDur = (projectData.settings?.duration || 0) / 1_000_000;

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
      await seriesStore.reanalyzeScreenplay(seriesId.value, activeEpisodeId.value);
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
      await seriesStore.reanalyzeScreenplay(seriesId.value, activeEpisodeId.value);
    }).catch(() => {});
  }
}

// Select Episode
async function selectEpisode(ep: any, index?: number) {
  if (isEpisodeLoading.value || (activeEpisodeId.value === ep.id && seriesStore.currentMountedEpId === ep.id)) return;
  isEpisodeLoading.value = true;
  try {
    const pData = await seriesStore.selectEpisode(ep.id);
    if (pData) {
      checkEpisodeHealth(pData);
    }
    pipelineStore.syncStepStatusesWithEpisode(seriesStore.activeEpisode, seriesStore.charactersList);
    toast.info(t('toast.switchedToEpisode', { title: ep.title }));
  } catch (err) {
    console.error('Failed to switch episode:', err);
  } finally {
    isEpisodeLoading.value = false;
  }
}

// Chatbot trigger
function sendToChatbot(prompt: string) {
  isAiSidebarOpen.value = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trigger-chatbot-action', { detail: { prompt } }));
  }
}

// Pipeline Execution
async function runPipeline(stepId: string | undefined, agentMode = true) {
  if (!agentMode) {
    if (stepId !== undefined) {
      if (stepId === 'b6') {
        isExportModalOpen.value = true;
        return;
      }
      await pipelineStore.runStep(stepId);
    } else {
      for (const s of pipelineStore.pipelineSteps) {
        if (s.id === 'b6') continue;
        await pipelineStore.runStep(s.id);
      }
      toast.success(t('toast.pipelineCompleted'));
    }
    return;
  }

  const stepPrompts: Record<string, string> = {
    b1: 'Generate primary character portraits and cast anchors',
    b2: 'Generate all character wardrobes, locations, props, and storyboard frames sequentially',
    b3: 'Generate Image-to-Video clips for all scenes',
    b4: 'Generate TTS voiceover narration and dialogue sync',
    b5: 'Generate and synchronize subtitle captions',
    b6: 'Export and review final video',
    b7: 'Review and verify timeline completion for this episode',
  };
  const prompt = (stepId && stepPrompts[stepId]) || 'Run the complete production pipeline for this episode';
  sendToChatbot(prompt);
}

// Local Export Callback
function onLocalExportDone(blobUrl: string | Record<string, string>, thumbnail: string) {
  isExportModalOpen.value = false;
  if (typeof blobUrl === 'object' && blobUrl !== null) {
    renderReviewOutputs.value = blobUrl;
  } else {
    const currentLang = seriesStore.currentSeries?.language || 'en-US';
    renderReviewOutputs.value = { [currentLang]: blobUrl };
  }
  renderReviewThumbnail.value = thumbnail;
  isRenderReviewOpen.value = true;
  pipelineStore.setStepStatus('b8', 'done');
}

// Server-side render queue
async function handleQueueServerRender() {
  if (!activeEpisodeId.value) return;
  try {
    const jobId = await pipelineStore.queueServerRender(seriesId.value, activeEpisodeId.value);
    if (jobId) {
      isRenderReviewOpen.value = false;
    }
  } catch (err: any) {
    console.error('Failed to queue server render:', err);
  }
}

// Ratio helper for canvas sizing
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

async function onJobCompleted(){
  if (activeEpisodeId.value) {
    const pData = await seriesStore.loadEpisodeTimeline(activeEpisodeId.value);
    checkEpisodeHealth(pData);
  }
};

onMounted(async () => {
  window.addEventListener('job-completed', onJobCompleted);

  isWorkspaceLoading.value = true;
  workspaceLoadingText.value = t('workspace.loadingWorkspace', 'Loading Series Workspace...');

  try {
    await seriesStore.loadWorkspaceData(seriesId.value);
    isWorkspaceLoaded.value = true;
    if (activeEpisodeId.value) {
      workspaceLoadingText.value = t('workspace.loadingEpisodeTimeline', 'Loading Episode Timeline...');
      const pData = await seriesStore.loadEpisodeTimeline(activeEpisodeId.value);
      checkEpisodeHealth(pData);
    }
  } catch (err) {
    console.error('Failed to initialize workspace data:', err);
  } finally {
    isWorkspaceLoading.value = false;
  }

  const targetRatio = seriesStore.currentSeries?.ratio || '9:16';
  const initialDim = getCanvasDimensionsForRatio(targetRatio);
  projectStore.setCanvasSize({ width: initialDim.width, height: initialDim.height }, initialDim.ratio);

  // Initialize domain stores in background
  voiceStore.fetchPresets();
  collaborationStore.fetchTeamMembers();
});

onUnmounted(() => {
  window.removeEventListener('job-completed', onJobCompleted);
  try {
    pause();
  } catch (_) {}

  try {
    core.project.import({
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

  seriesStore.masterTracks = [];
  seriesStore.masterClips = {};
  isWorkspaceLoaded.value = false;
});
</script>

<template>
  <div id="project-workspace-page" class="h-screen w-screen font-sans overflow-hidden bg-[var(--el-bg-color-page)] text-[var(--el-text-color-primary)] relative">
    <!-- Workspace Initial Loading Overlay -->
    <Transition name="fade">
      <div
        v-if="isWorkspaceLoading"
        class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--el-bg-color-page)]/90 backdrop-blur-2xl pointer-events-auto overflow-hidden"
      >
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
        <div class="h-screen w-full flex flex-col overflow-hidden">
          <!-- 1. Header Component -->
          <WorkspaceHeader
            :is-ai-sidebar-open="isAiSidebarOpen"
            @open-export="isExportModalOpen = true"
            @open-publish="isBulkPublishModalOpen = true"
            @toggle-ai-sidebar="isAiSidebarOpen = !isAiSidebarOpen"
          />

          <!-- 2. Workspace 3-Column Body -->
          <div class="flex flex-1 overflow-hidden">
            <!-- Left Sidebar: Episode Library -->
            <WorkspaceEpisodeSidebar
              v-model:is-collapsed="isLeftSidebarCollapsed"
              :is-episode-loading="isEpisodeLoading"
              @select-episode="selectEpisode"
            />

            <!-- Main Center Area: Canvas & Timeline -->
            <WorkspaceCanvasArea
              :is-episode-loading="isEpisodeLoading"
            />

            <!-- Right Sidebar: Pipeline / Script / Audio / Storyboard / Assets / Captions -->
            <aside
              class="border-l flex flex-row shrink-0 z-20 shadow-soft transition-all duration-300"
              :class="isTabSidebarCollapsed ? 'w-14' : 'w-80 lg:w-96'"
              style="border-color: var(--el-border-color); background-color: var(--el-card-bg-color);"
            >
              <!-- Expanded Full Tab Panels Content -->
              <div v-if="!isTabSidebarCollapsed" class="flex-1 flex flex-col h-full overflow-hidden">
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
                    @extracted="rightTab = 'assets'"
                  />
                  <AssetTab
                    v-else-if="rightTab === 'assets'"
                  />
                  <StoryboardTab
                    v-else-if="rightTab === 'storyboard'"
                  />
                  <AudioTab
                    v-else-if="rightTab === 'audio'"
                  />
                  <CaptionsTab
                    v-else-if="rightTab === 'captions'"
                  />
                </div>

                <!-- Right Sidebar Bottom Actions -->
                <div class="p-5 border-t" style="border-color: var(--el-border-color);">
                  <div class="flex items-center justify-between mb-3 text-[10px] font-bold uppercase tracking-wide" style="color: var(--el-text-color-secondary);">
                    <span>{{ t('workspace.readyToPublish') }}</span>
                    <span>{{ t('workspace.epsVerticalHd', { count: seriesStore.episodesList.length || 100 }) }}</span>
                  </div>
                  <div class="flex gap-2">
                    <el-button type="primary" round icon="Promotion" size="small" class="flex-1 !font-bold !py-3" @click="isBulkPublishModalOpen = true">
                      {{ t('workspace.bulkExportPublish') }}
                    </el-button>
                    <el-button circle plain size="small" icon="Calendar" @click="isBulkPublishModalOpen = true" />
                  </div>
                </div>
              </div>

              <!-- Collapsed Mini Tab Strip -->
              <div class="p-2 w-[60px] flex flex-col items-center justify-between overflow-hidden">
                <div class="flex flex-col items-center gap-2.5 w-full">
                  <el-button
                    v-for="tab in [
                      { id: 'pipeline', label: t('workspace.tabPipeline', 'Pipeline'), icon: 'Files' },
                      { id: 'script', label: t('workspace.tabScript', 'Screenplay'), icon: 'Document' },
                      { id: 'assets', label: t('workspace.tabAssets', 'Assets'), icon: 'Box' },
                      { id: 'storyboard', label: t('workspace.tabStoryBoard', 'Storyboard'), icon: 'Picture' },
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
                  <el-button
                    circle plain size="large"
                    icon="Share" class="!ml-0"
                    @click="isTabSidebarCollapsed = !isTabSidebarCollapsed"
                    :title="t('workspace.expandTabs', 'Expand Tabs')"
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </el-splitter-panel>

      <el-splitter-panel v-if="isAiSidebarOpen" size="25%" :min="250" :max="400">
        <!-- 3. Dedicated AI Copilot Right Sidebar -->
        <el-aside
          class="!w-full h-[100vh] border-l flex flex-col shrink-0 z-10 shadow-soft p-4"
          style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);"
        >
          <Chatbot @close="isAiSidebarOpen = false" />
        </el-aside>
      </el-splitter-panel>
    </el-splitter>

    <!-- Modals & Dialogs -->
    <MasterScriptModal
      v-model="isMasterScriptModalOpen"
      :episode-title="currentEpisodeTitle"
    />

    <ManageCastModal
      v-model:open="isManageCastOpen"
      @view-character="openCharacterDetail"
    />

    <CharacterDetailModal
      v-model:open="isCharacterDetailOpen"
      :character="selectedCharacter"
    />

    <WorkspaceAddEpisodeModal
      v-model="isAddEpisodeModalOpen"
      :series-id="seriesId"
      @created="(ep) => selectEpisode(ep)"
    />

    <WorkspaceCollaboratorsModal
      v-model="isCollaboratorsModalOpen"
    />

    <SeriesMasterPlanDialog
      v-model="isSeriesInfoModalOpen"
      @select-episode="(epId) => { const ep = seriesStore.episodesList.find(e => e.id === epId); if (ep) selectEpisode(ep); }"
    />

    <BulkExportPublishDialog
      v-model="isBulkPublishModalOpen"
    />

    <ExportModal
      :open="isExportModalOpen"
      @update:open="(v) => { if (!v) { isExportModalOpen = false; pipelineStore.setStepStatus('b8', 'idle'); } }"
      @exported="onLocalExportDone"
    />

    <WorkspaceRenderReviewModal
      v-model="isRenderReviewOpen"
      :series-id="seriesId"
      :episode-id="activeEpisodeId"
      :outputs="renderReviewOutputs"
      :thumbnail="renderReviewThumbnail"
      @queue-server-render="handleQueueServerRender"
    />
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
