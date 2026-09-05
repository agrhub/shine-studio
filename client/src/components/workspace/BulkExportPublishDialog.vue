<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import http from '@/utils/http';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';
import type {
  PlatformAccount,
  Series,
  Episode,
  Scene,
  RenderVersionEntity,
  PublishMetadataResponse,
  PublishResultPayload,
  ApiResponse,
} from '@/types/api';

export interface RenderedVideoVersion {
  id: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  language: string;
  voice?: string;
  subtitles?: string[];
  resolution: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  fileSize: string;
  renderedAt: string;
  status: 'ready' | 'draft' | 'rendering' | 'failed' | string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English',
  'en': 'English',
  'vi-VN': 'Tiếng Việt',
  'vi': 'Tiếng Việt',
  'zh-CN': 'Chinese (Mandarin)',
  'zh': 'Chinese',
  'ja-JP': 'Japanese',
  'ja': 'Japanese',
  'ko-KR': 'Korean',
  'ko': 'Korean',
  'es-ES': 'Spanish',
  'es': 'Spanish',
  'fr-FR': 'French',
  'fr': 'French',
  'de-DE': 'German',
  'de': 'German',
  'th-TH': 'Thai',
  'th': 'Thai',
  'id-ID': 'Indonesian',
  'id': 'Indonesian',
  'hi-IN': 'Hindi',
  'hi': 'Hindi',
};

function getLangLabel(code?: string): string {
  if (!code) return 'en-US';
  return LANGUAGE_NAMES[code] || code;
}

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'published', result: PublishResultPayload): void;
}>();

const { t } = useI18n();
const router = useRouter();
const seriesStore = useSeriesStore();
const authStore = useAuthStore();
const pipelineStore = usePipelineStore();

const isOpen = computed<boolean>({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const series = computed<Series | null>(() => seriesStore.currentSeries);
const episodes = computed<Episode[]>(() => seriesStore.episodesList);

// State
const activeStep = ref<'versions' | 'metadata' | 'deploy' | 'results'>('versions');
const renderedVersions = ref<RenderedVideoVersion[]>([]);
const selectedVersionIds = ref<string[]>([]);
const isLoadingVersions = ref<boolean>(false);

// Connected Platform Channels
const connectedChannels = ref<PlatformAccount[]>([]);
const isLoadingChannels = ref<boolean>(false);

// Metadata & AI suggestions
const isGeneratingMetadata = ref<boolean>(false);
const suggestedTitles = ref<string[]>([]);
const selectedTitle = ref<string>('');
const captionDescription = ref<string>('');
const hashtags = ref<string[]>([]);
const newTagInput = ref<string>('');
const selectedThumbnail = ref<string>('');

// Cover Image Lightbox & AI Generation
const isCoverImageModalOpen = ref<boolean>(false);
const coverModalUrl = ref<string>('');
const coverModalTitle = ref<string>('');
const isGeneratingCover = ref<boolean>(false);
const customCoverPrompt = ref<string>('');
const isCustomPromptOpen = ref<boolean>(false);

// Publishing configuration
const publishMode = ref<'now' | 'schedule'>('now');
const scheduledDateTime = ref<string>('');
const selectedPlatforms = ref<string[]>([]);
const isPublishing = ref<boolean>(false);
const publishResult = ref<PublishResultPayload | null>(null);

// Video preview player
const previewVideoUrl = ref<string>('');
const previewVideoTitle = ref<string>('');
const isVideoPreviewOpen = ref<boolean>(false);

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getResolutionFromSeries(currentSeries: Series | null): string {
  if (currentSeries?.ratio === '9:16') return '1080x1920 (9:16 Vertical HD)';
  if (currentSeries?.ratio === '16:9') return '1920x1080 (16:9 Horizontal Full HD)';
  return '1080x1920 (9:16 Vertical HD)';
}

function getEpisodeNumber(ep: Episode): number {
  return ep.episode_number ?? ep.number ?? 1;
}

function getEpisodeDuration(ep: Episode): number {
  if (ep.duration_seconds && ep.duration_seconds > 0) return ep.duration_seconds;
  if (Array.isArray(ep.scenes) && ep.scenes.length > 0) {
    const scenesTotal = ep.scenes.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
    if (scenesTotal > 0) return scenesTotal;
  }
  if (ep.duration) {
    if (typeof ep.duration === 'string' && ep.duration.includes(':')) {
      const parts = ep.duration.split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return m * 60 + s;
    }
    const parsed = parseInt(String(ep.duration), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 90;
}

function getEpisodeThumbnail(ep: Episode, currentSeries: Series | null): string {
  if (ep.cover_image) return ep.cover_image;
  if (ep.thumbnail_url) return ep.thumbnail_url;
  if (Array.isArray(ep.scenes)) {
    for (const s of ep.scenes) {
      if (s.storyboard_frame_url) return s.storyboard_frame_url;
      if (s.storyboard_end_frame_url) return s.storyboard_end_frame_url;
    }
  }
  return currentSeries?.cover_image || '';
}

function getEpisodeVideoUrl(ep: Episode): string {
  if (ep.video_url) return ep.video_url;
  if (Array.isArray(ep.scenes)) {
    for (const s of ep.scenes) {
      if (s.video_url) return s.video_url;
    }
  }
  return '';
}

async function loadConnectedChannels(): Promise<void> {
  isLoadingChannels.value = true;
  try {
    const res: any = await http.get('/publish/connected-channels');
    if (res?.data?.channels && Array.isArray(res.data.channels) && res.data.channels.length > 0) {
      connectedChannels.value = res.data.channels;
    } else if (authStore.user?.connected_channels && Array.isArray(authStore.user.connected_channels)) {
      connectedChannels.value = authStore.user.connected_channels;
    }
  } catch (err) {
    if (authStore.user?.connected_channels && Array.isArray(authStore.user.connected_channels)) {
      connectedChannels.value = authStore.user.connected_channels;
    }
  } finally {
    isLoadingChannels.value = false;
    // Auto-select user's active connected platforms
    if (connectedChannels.value.length > 0) {
      const activePlatforms = connectedChannels.value
        .filter((c: PlatformAccount) => c.status !== 'disconnected')
        .map((c: PlatformAccount) => (c.provider || '').toLowerCase())
        .filter(Boolean);
      if (activePlatforms.length > 0) {
        selectedPlatforms.value = Array.from(new Set(activePlatforms));
      }
    }
  }
}

function goToSettingsChannels() {
  isOpen.value = false;
  router.push('/settings');
}

// Load rendered versions
async function loadRenderedVersions(): Promise<void> {
  if (!series.value?.id) return;
  isLoadingVersions.value = true;
  const currentSeries = series.value;
  const defaultResolution = getResolutionFromSeries(currentSeries);
  const primaryLang = currentSeries.language || 'en-US';

  try {
    const res: any = await http.get(`/publish/rendered-versions/${series.value.id}`);
    if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
      renderedVersions.value = res.data
        .filter((item: RenderVersionEntity) => !!(item.video_url || item.url))
        .map((item: RenderVersionEntity) => {
          const ep = episodes.value.find(e => e.id === item.episode_id);
          const fallbackThumb = ep ? getEpisodeThumbnail(ep, currentSeries) : (currentSeries.cover_image || '');
          const fallbackVid = ep ? getEpisodeVideoUrl(ep) : '';
          const epNum = item.episode_number || (ep ? getEpisodeNumber(ep) : 1);
          const epTitle = item.episode_title || ep?.title || `Episode ${epNum}`;
          const epLang = item.language || primaryLang;

          return {
            id: item.id || item.version_id || `ver_${item.episode_id || ep?.id || 'ep'}_${epLang}`,
            episodeId: item.episode_id || ep?.id || '',
            episodeNumber: epNum,
            episodeTitle: epTitle,
            language: epLang,
            voice: item.voice || `Original Audio (${getLangLabel(epLang)})`,
            subtitles: item.subtitles || [`Caption: ${getLangLabel(epLang)} (Burned-in)`],
            resolution: item.resolution || defaultResolution,
            videoUrl: item.video_url || item.url || fallbackVid,
            thumbnailUrl: item.thumbnail_url || fallbackThumb,
            duration: item.duration || (ep ? getEpisodeDuration(ep) : 90),
            fileSize: item.file_size || '26.8 MB',
            renderedAt: item.rendered_at || ep?.updated_at || ep?.created_at || new Date().toISOString(),
            status: 'ready',
          };
        });
    } else {
      // Build local versions list from loaded episodes (only for episodes that have actual videos)
      const localVersions: RenderedVideoVersion[] = [];

      episodes.value.forEach((ep: Episode) => {
        const epNum = getEpisodeNumber(ep);
        const epDuration = getEpisodeDuration(ep);
        const coverThumb = getEpisodeThumbnail(ep, currentSeries);
        const epRenderedAt = ep.updated_at || ep.created_at || new Date().toISOString();
        const epResolution = defaultResolution;
        const renderVersions = ep.render_versions;
        const videoUrls = ep.video_urls;

        if (Array.isArray(renderVersions) && renderVersions.length > 0) {
          renderVersions.forEach((rv: RenderVersionEntity) => {
            const vidUrl = rv.video_url || rv.url || getEpisodeVideoUrl(ep);
            if (!vidUrl) return; // Skip if no video
            const lang = rv.language || (Array.isArray(rv.languages) ? rv.languages[0] : primaryLang);
            const isPrimary = lang === primaryLang;
            localVersions.push({
              id: rv.version_id || rv.id || `ver_${ep.id}_${lang}`,
              episodeId: ep.id,
              episodeNumber: epNum,
              episodeTitle: ep.title,
              language: lang,
              voice: rv.voice || (isPrimary ? `Original Audio (${getLangLabel(lang)})` : `Dubbing: ${getLangLabel(lang)}`),
              subtitles: rv.subtitles || [isPrimary ? `Caption: ${getLangLabel(lang)} (Burned-in)` : `Sub: ${getLangLabel(lang)}`],
              resolution: rv.resolution || epResolution,
              videoUrl: vidUrl,
              thumbnailUrl: rv.thumbnail_url || coverThumb,
              duration: rv.duration || epDuration,
              fileSize: rv.file_size || '28.4 MB',
              renderedAt: rv.rendered_at || epRenderedAt,
              status: 'ready',
            });
          });
        } else if (videoUrls && typeof videoUrls === 'object') {
          Object.entries(videoUrls).forEach(([lang, url]) => {
            if (url) {
              const isPrimary = lang === primaryLang;
              localVersions.push({
                id: `ver_${ep.id}_${lang}`,
                episodeId: ep.id,
                episodeNumber: epNum,
                episodeTitle: ep.title,
                language: lang,
                voice: isPrimary ? `Original Audio (${getLangLabel(lang)})` : `Dubbing: ${getLangLabel(lang)}`,
                subtitles: [`Caption: ${getLangLabel(lang)} (Burned-in)`],
                resolution: epResolution,
                videoUrl: url as string,
                thumbnailUrl: coverThumb,
                duration: epDuration,
                fileSize: '24.2 MB',
                renderedAt: epRenderedAt,
                status: 'ready',
              });
            }
          });
        } else {
          const resolvedVid = getEpisodeVideoUrl(ep);
          if (resolvedVid) {
            const lang = primaryLang;
            const voiceLabel = ep.dubbing_settings?.voice_name 
              ? `Dubbing: ${ep.dubbing_settings.voice_name}` 
              : `Original Audio (${getLangLabel(lang)})`;
            const subLabel = ep.caption_languages && ep.caption_languages.length > 0 
              ? ep.caption_languages.map((l: string) => `Sub: ${getLangLabel(l)}`) 
              : [`Caption: ${getLangLabel(lang)} (Burned-in)`];

            localVersions.push({
              id: `ver_${ep.id}_default`,
              episodeId: ep.id,
              episodeNumber: epNum,
              episodeTitle: ep.title,
              language: lang,
              voice: voiceLabel,
              subtitles: subLabel,
              resolution: epResolution,
              videoUrl: resolvedVid,
              thumbnailUrl: coverThumb,
              duration: epDuration,
              fileSize: '26.8 MB',
              renderedAt: epRenderedAt,
              status: 'ready',
            });
          }
        }
      });
      renderedVersions.value = localVersions;
    }

    if (renderedVersions.value.length > 0 && selectedVersionIds.value.length === 0) {
      const activeVer = renderedVersions.value.find(v => v.episodeId === seriesStore.activeEpisodeId) || renderedVersions.value[0];
      selectedVersionIds.value = [activeVer.id];
      selectedThumbnail.value = activeVer.thumbnailUrl;
    }
  } catch (err: unknown) {
    console.warn('[loadRenderedVersions] Fallback to store episodes:', err);
  } finally {
    isLoadingVersions.value = false;
  }
}

// Generate AI Metadata (Title, Description, Hashtags)
async function generateAiMetadata(): Promise<void> {
  isGeneratingMetadata.value = true;
  try {
    const firstSelected = renderedVersions.value.find(v => selectedVersionIds.value.includes(v.id)) || renderedVersions.value[0];
    const res: any = await http.post('/publish/generate-metadata', {
      seriesId: series.value?.id,
      episodeId: firstSelected?.episodeId || seriesStore.activeEpisodeId,
      language: firstSelected?.language || series.value?.language || 'vi-VN',
    });

    if (res?.data) {
      suggestedTitles.value = res.data.titles || [];
      selectedTitle.value = res.data.selected_title || res.data.titles?.[0] || '';
      hashtags.value = res.data.hashtags || [];
      captionDescription.value = res.data.description || '';
      toast.success(t('toast.aiMetadataGenerated', 'AI metadata generated with viral optimization!'));
    }
  } catch {
    // Fallback generation
    const ep = seriesStore.activeEpisode;
    const sTitle = series.value?.title || 'Short Drama';
    selectedTitle.value = `[Ep. ${ep?.number || 1}] ${ep?.title || 'The Return'} 🔥 | ${sTitle}`;
    hashtags.value = ['#ShortDrama', '#TikTokSeries', '#ViralReels', '#DramaSeries', '#ShineAI', `#${sTitle.replace(/\s+/g, '')}`];
    captionDescription.value = `${sTitle} - ${ep?.title || ''}.\n👉 Stay tuned for the next episode! Follow to never miss the dramatic story! 🔥`;
    toast.info(t('toast.appliedTemplateMetadata'));
  } finally {
    isGeneratingMetadata.value = false;
  }
}

// Generate AI Cover Image
async function generateAiCoverImage(): Promise<void> {
  const firstSelected = renderedVersions.value.find(v => selectedVersionIds.value.includes(v.id)) || renderedVersions.value[0];
  const epId = firstSelected?.episodeId || seriesStore.activeEpisodeId;
  if (!epId) {
    toast.error(t('toast.selectEpisodeVersionFirst'));
    return;
  }

  isGeneratingCover.value = true;
  try {
    const res: any = await http.post('/publish/generate-cover', {
      episodeId: epId,
      seriesId: series.value?.id,
      prompt: customCoverPrompt.value.trim() || undefined,
      currentCover: selectedThumbnail.value || undefined,
    });

    const finalCoverUrl = res?.data?.cover_url || res?.data?.coverUrl;
    if (finalCoverUrl) {
      selectedThumbnail.value = finalCoverUrl;
      // Update local versions thumbnail
      renderedVersions.value.forEach((v: RenderedVideoVersion) => {
        if (v.episodeId === epId) {
          v.thumbnailUrl = finalCoverUrl;
        }
      });
      // Update episode in seriesStore
      if (seriesStore.activeEpisode && seriesStore.activeEpisode.id === epId) {
        seriesStore.activeEpisode.cover_image = finalCoverUrl;
        seriesStore.activeEpisode.thumbnail_url = finalCoverUrl;
      }
      toast.success(t('toast.aiCoverGenerated'));
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to generate cover image';
    toast.error(errorMsg);
  } finally {
    isGeneratingCover.value = false;
  }
}

function openCoverImageModal(url: string, title?: string): void {
  coverModalUrl.value = url;
  coverModalTitle.value = title || 'Episode Cover Image';
  isCoverImageModalOpen.value = true;
}

// Available Scene frames for thumbnail selection
const activeEpisodeScenes = computed<Scene[]>(() => {
  const activeVer = renderedVersions.value.find(v => selectedVersionIds.value.includes(v.id)) || renderedVersions.value[0];
  const ep = episodes.value.find(e => e.id === activeVer?.episodeId) || seriesStore.activeEpisode;
  if (ep && Array.isArray(ep.scenes)) {
    return ep.scenes.filter((s: Scene) => s.storyboard_frame_url || s.storyboard_end_frame_url || s.video_url);
  }
  return [];
});

function selectSceneAsCover(url: string): void {
  selectedThumbnail.value = url;
  const firstSelected = renderedVersions.value.find(v => selectedVersionIds.value.includes(v.id)) || renderedVersions.value[0];
  if (firstSelected) {
    firstSelected.thumbnailUrl = url;
  }
  toast.success(t('toast.selectedKeyframeCover'));
}

function selectAllVersions(): void {
  if (selectedVersionIds.value.length === renderedVersions.value.length) {
    selectedVersionIds.value = [];
  } else {
    selectedVersionIds.value = renderedVersions.value.map(v => v.id);
  }
}

function toggleVersionSelection(verId: string): void {
  const idx = selectedVersionIds.value.indexOf(verId);
  if (idx > -1) {
    selectedVersionIds.value.splice(idx, 1);
  } else {
    selectedVersionIds.value.push(verId);
  }
  const selVer = renderedVersions.value.find(v => v.id === verId);
  if (selVer?.thumbnailUrl) {
    selectedThumbnail.value = selVer.thumbnailUrl;
  }
}

function addHashtag(): void {
  const tag = newTagInput.value.trim();
  if (tag) {
    const formatted = tag.startsWith('#') ? tag : `#${tag}`;
    if (!hashtags.value.includes(formatted)) {
      hashtags.value.push(formatted);
    }
    newTagInput.value = '';
  }
}

function removeHashtag(tag: string): void {
  hashtags.value = hashtags.value.filter(t => t !== tag);
}

function openVideoPreview(url: string, title?: string): void {
  previewVideoUrl.value = url;
  previewVideoTitle.value = title || 'Rendered Video Preview';
  isVideoPreviewOpen.value = true;
}

function downloadVideo(url: string, filename: string): void {
  const cleanName = (filename || 'rendered_episode').replace(/[^a-zA-Z0-9_-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}.mp4`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast.success(t('toast.downloadStarted', { filename }));
}

async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(t('toast.directVideoLinkCopied'));
  } catch {
    toast.error(t('toast.copyFailed'));
  }
}

// ─── Upload Local Video to Render Version ──────────────────────────────
const isUploadModalOpen = ref(false);
const isUploadingVersion = ref(false);
const uploadForm = ref({
  episodeId: '',
  language: 'en-US',
  file: null as File | null,
});

function openUploadModal() {
  uploadForm.value = {
    episodeId: seriesStore.activeEpisodeId || episodes.value[0]?.id || '',
    language: series.value?.language || 'en-US',
    file: null,
  };
  isUploadModalOpen.value = true;
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    uploadForm.value.file = target.files[0];
  }
}

async function submitUploadVersion() {
  if (!uploadForm.value.episodeId) {
    toast.error(t('toast.pleaseSelectEpisode'));
    return;
  }
  if (!uploadForm.value.file) {
    toast.error(t('toast.selectVideoMp4'));
    return;
  }
  isUploadingVersion.value = true;
  try {
    const sId = series.value?.id;
    if (!sId) throw new Error('Series ID missing');
    await seriesStore.addRenderVersion(sId, uploadForm.value.episodeId, {
      language: uploadForm.value.language,
      voice: `Uploaded Video (${uploadForm.value.language})`,
      subtitles: [`Caption: ${uploadForm.value.language}`],
      resolution: '1080x1920 (9:16 Vertical HD)',
    }, uploadForm.value.file);

    toast.success(t('toast.renderVideoUploaded'));
    isUploadModalOpen.value = false;
    await loadRenderedVersions();
  } catch (err: any) {
    toast.error(`${t('toast.uploadFailed')}: ${err?.message || 'Unknown error'}`);
  } finally {
    isUploadingVersion.value = false;
  }
}

async function handleDeleteVersion(ver: RenderedVideoVersion) {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to delete this rendered version [EP ${ver.episodeNumber} - ${ver.language}]?`,
      'Delete Rendered Version',
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );

    const sId = series.value?.id;
    if (!sId) return;
    await seriesStore.removeRenderVersion(sId, ver.episodeId, ver.id);
    renderedVersions.value = renderedVersions.value.filter(v => v.id !== ver.id);
    selectedVersionIds.value = selectedVersionIds.value.filter(id => id !== ver.id);
    toast.success(t('toast.renderVersionRemoved'));
  } catch (err: any) {
    if (err !== 'cancel') {
      toast.error(`${t('toast.deleteVersionFailed')}: ${err?.message || ''}`);
    }
  }
}

async function handleDeleteSelectedVersions() {
  if (selectedVersionIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to delete ${selectedVersionIds.value.length} selected rendered version(s)?`,
      'Delete Selected Versions',
      {
        confirmButtonText: 'Delete All Selected',
        cancelButtonText: 'Cancel',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );

    const sId = series.value?.id;
    if (!sId) return;
    for (const verId of [...selectedVersionIds.value]) {
      const ver = renderedVersions.value.find(v => v.id === verId);
      if (ver) {
        await seriesStore.removeRenderVersion(sId, ver.episodeId, ver.id);
      }
    }
    renderedVersions.value = renderedVersions.value.filter(v => !selectedVersionIds.value.includes(v.id));
    selectedVersionIds.value = [];
    toast.success(t('toast.selectedRenderVersionsRemoved'));
  } catch (err: any) {
    if (err !== 'cancel') {
      toast.error(`${t('toast.deleteVersionsFailed')}: ${err?.message || ''}`);
    }
  }
}

// Execute Publish or Schedule
async function executeDeploy(): Promise<void> {
  if (selectedVersionIds.value.length === 0) {
    toast.error(t('toast.selectAtLeastOneVersion'));
    return;
  }
  if (selectedPlatforms.value.length === 0) {
    toast.error(t('toast.selectAtLeastOnePlatform'));
    return;
  }

  isPublishing.value = true;
  publishResult.value = null;

  try {
    const selectedVers = renderedVersions.value.filter(v => selectedVersionIds.value.includes(v.id));

    if (publishMode.value === 'schedule') {
      if (!scheduledDateTime.value) {
        toast.error(t('toast.selectScheduledDateTime'));
        isPublishing.value = false;
        return;
      }

      const res: any = await http.post('/publish/schedule', {
        seriesId: series.value?.id,
        episodeId: selectedVers[0].episodeId,
        platforms: selectedPlatforms.value,
        scheduledTime: scheduledDateTime.value,
        title: selectedTitle.value,
        description: captionDescription.value,
        hashtags: hashtags.value,
        videoUrl: selectedVers[0].videoUrl,
      });

      publishResult.value = {
        type: 'schedule',
        data: res?.data,
        platforms: selectedPlatforms.value,
        scheduled_time: scheduledDateTime.value,
      };
      activeStep.value = 'results';
      toast.success(t('toast.publishingScheduled'));
    } else {
      // Publish now (multi-platform dispatch)
      const res: any = await http.post('/publish/multi-platform', {
        seriesId: series.value?.id,
        episodeId: selectedVers[0].episodeId,
        platforms: selectedPlatforms.value,
        caption: selectedTitle.value || captionDescription.value,
        hashtags: hashtags.value,
        coverUrl: selectedThumbnail.value,
        videoUrl: selectedVers[0].videoUrl,
      });

      publishResult.value = {
        type: 'publish',
        data: res?.data,
        published_urls: res?.data?.published_urls || {},
        platforms: selectedPlatforms.value,
      };
      activeStep.value = 'results';
      toast.success(t('toast.deployedToSocials'));
      emit('published', publishResult.value);

      // Sync initial active jobs list once
      pipelineStore.fetchActiveJobs(series.value?.id, selectedVers[0]?.episodeId);
    }
  } catch (err: unknown) {
    const apiError = (err as any)?.response?.data?.message || (err as any)?.response?.data?.error;
    const errorMsg = apiError || (err instanceof Error ? err.message : 'Publishing failed');
    toast.error(errorMsg);
  } finally {
    isPublishing.value = false;
  }
}

function getPlatformIcon(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p === 'youtube') return 'VideoPlay';
  if (p === 'tiktok') return 'Film';
  if (p === 'instagram') return 'Picture';
  if (p === 'facebook') return 'Share';
  return 'Promotion';
}

function getPlatformBadgeClass(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p === 'youtube') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (p === 'tiktok') return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
  if (p === 'instagram') return 'bg-pink-500/15 text-pink-400 border-pink-500/30';
  if (p === 'facebook') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
}

watch(isOpen, (open: boolean) => {
  if (open) {
    activeStep.value = 'versions';
    publishResult.value = null;
    loadRenderedVersions();
    loadConnectedChannels();
    if (!selectedTitle.value) {
      generateAiMetadata();
    }
  }
});
</script>

<template>
  <el-dialog
    v-model="isOpen"
    width="960px"
    class="rounded-2xl bulk-publish-dialog"
    append-to-body
    :close-on-click-modal="false"
  >
    <template #header>
      <div class="flex items-center justify-between pr-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <el-icon :size="20"><Promotion /></el-icon>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold" style="color: var(--el-text-color-primary);">
                Bulk Export &amp; Social Publishing Center
              </h2>
              <el-tag size="small" type="primary" effect="dark" round class="font-bold">
                Multi-Platform
              </el-tag>
            </div>
            <p class="text-xs mt-0.5" style="color: var(--el-text-color-secondary);">
              Manage rendered video versions, generate viral metadata &amp; AI covers, schedule, and 1-click deploy.
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Header Step Progress Banner -->
    <div class="px-6 py-3 border-b flex items-center justify-between" style="background-color: var(--el-bg-color-page); border-color: var(--el-border-color-light);">
      <div class="flex items-center gap-1 sm:gap-4 text-xs font-semibold">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
          :class="activeStep === 'versions'
            ? 'bg-primary text-white shadow-sm font-bold'
            : 'text-muted-foreground hover:bg-[var(--el-fill-color-light)]'"
          @click="activeStep = 'versions'"
        >
          <el-icon><Film /></el-icon>
          <span>1. Video Versions ({{ renderedVersions.length }})</span>
        </button>

        <el-icon class="text-muted-foreground text-xs"><ArrowRight /></el-icon>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
          :class="activeStep === 'metadata'
            ? 'bg-primary text-white shadow-sm font-bold'
            : 'text-muted-foreground hover:bg-[var(--el-fill-color-light)]'"
          @click="activeStep = 'metadata'"
        >
          <el-icon><MagicStick /></el-icon>
          <span>2. AI Viral Metadata &amp; Cover</span>
        </button>

        <el-icon class="text-muted-foreground text-xs"><ArrowRight /></el-icon>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
          :class="(activeStep === 'deploy' || activeStep === 'results')
            ? 'bg-emerald-500 text-white shadow-sm font-bold'
            : 'text-muted-foreground hover:bg-[var(--el-fill-color-light)]'"
          @click="activeStep = 'deploy'"
        >
          <el-icon><Position /></el-icon>
          <span>3. Platform Channels &amp; Deploy</span>
        </button>
      </div>

      <el-tag size="small" type="success" effect="dark" round class="!font-bold !text-[10px]">
        Multi-Platform
      </el-tag>
    </div>

    <!-- Modal Body by Step -->
    <div class="p-6">
      <!-- ── STEP 1: Video Versions Selection & Batch Export ─────────────── -->
      <div v-if="activeStep === 'versions'" class="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-text-color-secondary);">
            <el-icon><VideoCamera /></el-icon>
            <span>Available Rendered Versions ({{ renderedVersions.length }})</span>
          </div>

          <div class="flex items-center gap-2">
            <el-button
              size="small"
              type="primary"
              round
              icon="Upload"
              @click="openUploadModal"
            >
              Upload Local Video
            </el-button>

            <el-button
              v-if="selectedVersionIds.length > 0"
              size="small"
              type="danger"
              plain
              round
              icon="Delete"
              @click="handleDeleteSelectedVersions"
            >
              Delete Selected ({{ selectedVersionIds.length }})
            </el-button>

            <el-button
              size="small"
              type="primary"
              plain
              round
              @click="selectAllVersions"
            >
              {{ selectedVersionIds.length === renderedVersions.length ? 'Deselect All' : 'Select All Versions' }}
            </el-button>
          </div>
        </div>

        <!-- Versions Grid -->
        <div v-if="renderedVersions.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div
            v-for="ver in renderedVersions"
            :key="ver.id"
            class="group relative p-3.5 rounded-2xl border flex gap-3.5 cursor-pointer transition-all duration-200"
            :style="selectedVersionIds.includes(ver.id)
              ? 'background-color: var(--el-color-primary-light-9); border-color: var(--el-color-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.06);'
              : 'background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light);'"
            @click="toggleVersionSelection(ver.id)"
          >
            <!-- Thumbnail with quick preview play overlay & Cover zoom icon -->
            <div class="relative w-24 h-32 rounded-xl overflow-hidden bg-black/20 shrink-0 border group/thumb" style="border-color: var(--el-border-color-light);">
              <img
                :src="ver.thumbnailUrl || '/images/dashboard/poster-1.jpg'"
                alt="Thumbnail"
                class="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                @error="($event.target as HTMLImageElement).src = '/images/dashboard/poster-1.jpg'"
              />
              <!-- Play overlay button -->
              <button
                type="button"
                class="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                title="Preview Video"
                @click.stop="openVideoPreview(ver.videoUrl, `[EP ${ver.episodeNumber}] ${ver.episodeTitle}`)"
              >
                <div class="w-9 h-9 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                  <el-icon :size="18"><VideoPlay /></el-icon>
                </div>
              </button>

              <div class="absolute top-1 left-1 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                EP {{ ver.episodeNumber }}
              </div>
              <div class="absolute bottom-1 right-1 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                {{ ver.language }}
              </div>

              <!-- View cover button -->
              <button
                type="button"
                class="absolute top-1 right-1 opacity-0 group-hover/thumb:opacity-100 p-1 rounded bg-black/70 text-white hover:text-primary transition-all cursor-pointer"
                title="View High-Res Cover"
                @click.stop="openCoverImageModal(ver.thumbnailUrl, `[EP ${ver.episodeNumber}] ${ver.episodeTitle}`)"
              >
                <el-icon :size="12"><ZoomIn /></el-icon>
              </button>
            </div>

            <!-- Card Content & Metadata -->
            <div class="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div class="flex items-start justify-between gap-1">
                  <el-tag size="small" type="primary" effect="plain" class="font-bold text-[10px]">
                    EPISODE #{{ ver.episodeNumber }}
                  </el-tag>
                  <el-checkbox
                    :model-value="selectedVersionIds.includes(ver.id)"
                    class="!m-0"
                    @click.stop="toggleVersionSelection(ver.id)"
                  />
                </div>

                <h4 class="font-bold text-xs truncate mt-1" style="color: var(--el-text-color-primary);" :title="ver.episodeTitle">
                  {{ ver.episodeTitle }}
                </h4>

                <!-- Rich Metadata Tags: Date, Voice, Subtitles, Resolution -->
                <div class="space-y-1 mt-1.5 text-[11px]" style="color: var(--el-text-color-secondary);">
                  <div class="flex items-center gap-1.5 text-[10px]">
                    <span class="text-muted-foreground">📅 {{ formatDate(ver.renderedAt) }}</span>
                    <span>•</span>
                    <span>⏱️ {{ Math.round(ver.duration) }}s</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--el-fill-color-light)] text-[var(--el-color-primary)] border border-[var(--el-border-color)]" title="Audio Dubbing">
                      🎙️ {{ ver.voice || ver.language }}
                    </span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--el-fill-color-light)] text-[var(--el-color-warning)] border border-[var(--el-border-color)]" title="Burned-in Subtitles">
                      💬 {{ Array.isArray(ver.subtitles) ? ver.subtitles.join(', ') : ver.language }}
                    </span>
                  </div>

                  <div class="text-[10px] text-muted-foreground pt-0.5">
                    <span>📐 {{ ver.resolution }}</span> • <span>💾 {{ ver.fileSize }}</span>
                  </div>
                </div>
              </div>

              <!-- Quick Action Bar: Preview, Download, & Delete Buttons -->
              <div class="flex items-center justify-between pt-2 mt-1 border-t" style="border-color: var(--el-border-color-lighter);" @click.stop>
                <div class="flex items-center gap-1.5">
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    round
                    class="!text-[11px] !px-2.5 !py-1 !h-6"
                    icon="VideoPlay"
                    @click="openVideoPreview(ver.videoUrl, `[EP ${ver.episodeNumber}] ${ver.episodeTitle}`)"
                  >
                    Preview
                  </el-button>

                  <el-button
                    size="small"
                    type="success"
                    plain
                    round
                    class="!text-[11px] !px-2.5 !py-1 !h-6"
                    icon="Download"
                    @click="downloadVideo(ver.videoUrl, `${series?.title || 'Series'}_EP${ver.episodeNumber}_${ver.language}`)"
                  >
                    Download MP4
                  </el-button>
                </div>

                <el-button
                  size="small"
                  type="danger"
                  plain
                  round
                  class="!text-[11px] !px-2 !py-1 !h-6"
                  icon="Delete"
                  title="Delete Rendered Version"
                  @click="handleDeleteVersion(ver)"
                >
                  Delete
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State if no videos rendered yet -->
        <div v-else class="py-12 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 my-4">
          <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <el-icon :size="24"><VideoPlay /></el-icon>
          </div>
          <div class="space-y-1">
            <h4 class="text-sm font-semibold text-foreground">{{ t('distribution.noRenderedVideos', 'No completed video episodes yet') }}</h4>
            <p class="text-xs text-muted-foreground max-w-md">
              {{ t('distribution.noRenderedVideosHelp', 'Please render video in the Timeline or click "Upload Local Video" to add your edited video for publication.') }}
            </p>
          </div>
          <el-button type="primary" round size="small" @click="isUploadModalOpen = true">
            <el-icon class="mr-1"><UploadFilled /></el-icon>
            {{ t('distribution.uploadLocalVideo', 'Upload Local Video') }}
          </el-button>
        </div>
      </div>

      <!-- ── STEP 2: AI Viral Metadata & Cover Image ────────────────────── -->
      <div v-else-if="activeStep === 'metadata'" class="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-primary">
            <el-icon><MagicStick /></el-icon>
            <span>AI Social Optimizer &amp; Cover Poster</span>
          </div>
          <el-button
            size="small"
            type="primary"
            round
            icon="MagicStick"
            :loading="isGeneratingMetadata"
            @click="generateAiMetadata"
          >
            Autofill Metadata
          </el-button>
        </div>

        <!-- Cover Image & AI Generator Section -->
        <div class="p-4 rounded-2xl border space-y-3" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light);">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold flex items-center gap-1.5" style="color: var(--el-text-color-primary);">
              <el-icon><Picture /></el-icon>
              <span>Episode Cover Image &amp; Poster</span>
            </label>
            <div class="flex items-center gap-2">
              <el-button
                size="small"
                type="primary"
                round
                icon="MagicStick"
                :loading="isGeneratingCover"
                @click="generateAiCoverImage"
              >
                ✨ Generate AI Cover
              </el-button>
              <el-button
                v-if="selectedThumbnail"
                size="small"
                plain
                round
                icon="ZoomIn"
                @click="openCoverImageModal(selectedThumbnail, selectedTitle || 'Episode Cover')"
              >
                View Full Cover
              </el-button>
            </div>
          </div>

          <!-- Cover Preview & Scene Frame Picker Grid -->
          <div class="flex gap-4 items-start">
            <!-- Active Cover Card -->
            <div
              class="relative w-28 h-40 rounded-xl overflow-hidden bg-black/20 shrink-0 border group/cover cursor-pointer shadow-sm"
              style="border-color: var(--el-border-color);"
              @click="openCoverImageModal(selectedThumbnail, selectedTitle || 'Episode Cover')"
            >
              <img
                :src="selectedThumbnail || '/images/dashboard/poster-1.jpg'"
                alt="Cover"
                class="w-full h-full object-cover group-hover/cover:scale-105 transition-transform"
              />
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity">
                <el-icon :size="20" class="text-white"><ZoomIn /></el-icon>
              </div>
              <div class="absolute bottom-1 left-1 right-1 bg-black/70 text-white text-[9px] text-center font-bold py-0.5 rounded backdrop-blur-xs">
                Active Cover
              </div>
            </div>

            <!-- Frame Pickers & Options -->
            <div class="flex-1 min-w-0 space-y-2.5">
              <!-- Scene Keyframe Selector -->
              <div v-if="activeEpisodeScenes.length > 0" class="space-y-1.5">
                <div class="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>Pick from Episode Scenes:</span>
                  <span class="text-[10px] text-primary">{{ activeEpisodeScenes.length }} keyframes</span>
                </div>
                <div class="flex gap-2 overflow-x-auto pb-1.5">
                  <div
                    v-for="(sc, sIdx) in activeEpisodeScenes"
                    :key="sIdx"
                    class="relative w-16 h-22 rounded-lg overflow-hidden border shrink-0 cursor-pointer transition-all hover:border-primary"
                    :class="selectedThumbnail === (sc.storyboard_frame_url || sc.storyboard_end_frame_url) ? 'border-primary ring-2 ring-primary/40' : 'border-border opacity-80 hover:opacity-100'"
                    @click="selectSceneAsCover(sc.storyboard_frame_url || sc.storyboard_end_frame_url || '')"
                  >
                    <img
                      :src="sc.storyboard_frame_url || sc.storyboard_end_frame_url"
                      alt="Scene Frame"
                      class="w-full h-full object-cover"
                    />
                    <div class="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white text-center font-bold py-0.2">
                      S{{ sIdx + 1 }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- AI Cover Prompt Customization Toggle -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <button
                    type="button"
                    class="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1"
                    @click="isCustomPromptOpen = !isCustomPromptOpen"
                  >
                    <el-icon><EditPen /></el-icon>
                    <span>{{ isCustomPromptOpen ? 'Hide Custom Prompt' : '+ Customize AI Poster Prompt' }}</span>
                  </button>
                </div>
                <div v-if="isCustomPromptOpen" class="space-y-1.5">
                  <el-input
                    v-model="customCoverPrompt"
                    type="textarea"
                    :rows="2"
                    placeholder="Enter custom prompt (e.g. 'Dramatic movie poster with protagonist facing the camera in storm...')"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Viral Title Suggestions -->
        <div class="space-y-2">
          <label class="text-xs font-bold" style="color: var(--el-text-color-primary);">Viral Video Title</label>
          <el-input
            v-model="selectedTitle"
            placeholder="Enter or select viral video title..."
            clearable
          />
          <div v-if="suggestedTitles.length > 0" class="space-y-1.5 mt-2">
            <div class="text-[11px] font-semibold" style="color: var(--el-text-color-secondary);">AI Suggestions (Click to apply):</div>
            <div
              v-for="(st, idx) in suggestedTitles"
              :key="idx"
              class="p-2 rounded-lg border text-xs cursor-pointer hover:border-primary transition-colors flex items-center justify-between"
              :style="selectedTitle === st
                ? 'background-color: var(--el-color-primary-light-9); border-color: var(--el-color-primary); color: var(--el-color-primary);'
                : 'background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);'"
              @click="selectedTitle = st"
            >
              <span>{{ st }}</span>
              <el-icon v-if="selectedTitle === st"><Check /></el-icon>
            </div>
          </div>
        </div>

        <!-- Trending Hashtags -->
        <div class="space-y-2">
          <label class="text-xs font-bold" style="color: var(--el-text-color-primary);">Trending Hashtags</label>
          <div class="flex flex-wrap gap-1.5 p-3 rounded-xl border" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
            <el-tag
              v-for="tag in hashtags"
              :key="tag"
              closable
              effect="plain"
              round
              class="font-bold text-[11px]"
              @close="removeHashtag(tag)"
            >
              {{ tag }}
            </el-tag>
            <div class="flex items-center gap-1">
              <el-input
                v-model="newTagInput"
                placeholder="+ Add tag..."
                size="small"
                class="!w-28"
                @keyup.enter="addHashtag"
              />
            </div>
          </div>
        </div>

        <!-- Video Description / Caption -->
        <div class="space-y-2">
          <label class="text-xs font-bold" style="color: var(--el-text-color-primary);">Social Media Post Description</label>
          <el-input
            v-model="captionDescription"
            type="textarea"
            :rows="3"
            placeholder="Catchy cliffhanger caption for TikTok, Reels, Shorts..."
          />
        </div>
      </div>

      <!-- ── STEP 3: Platform Channels & Deploy ──────────────────────────── -->
      <div v-else-if="activeStep === 'deploy'" class="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
        <!-- 1. Connected Publishing Channels -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-[var(--el-text-color-primary)] flex items-center gap-1.5">
              <span>Connected Publishing Channels</span>
              <span class="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {{ connectedChannels.length }} linked
              </span>
            </label>
            <el-button
              size="small"
              type="primary"
              link
              icon="Plus"
              class="!text-xs"
              @click="goToSettingsChannels"
            >
              + Link New Channel
            </el-button>
          </div>

          <!-- User's Real Connected Accounts -->
          <div v-if="connectedChannels.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="ch in connectedChannels"
              :key="ch.id"
              class="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all duration-200"
              :style="selectedPlatforms.includes(ch.provider)
                ? 'background-color: var(--el-color-primary-light-9); border-color: var(--el-color-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.06);'
                : 'background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light); opacity: 0.7;'"
              @click="selectedPlatforms.includes(ch.provider) ? selectedPlatforms = selectedPlatforms.filter(p => p !== (ch.provider)) : selectedPlatforms.push(ch.provider)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <img
                  :src="ch.channel_avatar || '/images/avatars/avatar-default.jpg'"
                  alt="Channel"
                  class="w-9 h-9 rounded-full object-cover border border-emerald-500/30 shrink-0"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-bold text-[var(--el-text-color-primary)] truncate">{{ ch.channel_name }}</p>
                    <span class="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded" :class="(ch.provider) === 'youtube' ? 'bg-red-500/15 text-red-400' : 'bg-cyan-500/15 text-cyan-400'">
                      {{ ch.provider }}
                    </span>
                  </div>
                  <p class="text-[10px] text-emerald-500 font-medium truncate">{{ ch.handle || '@connected' }}</p>
                </div>
              </div>
              <el-checkbox
                :model-value="selectedPlatforms.includes(ch.provider)"
                class="!m-0"
                @click.stop="selectedPlatforms.includes(ch.provider) ? selectedPlatforms = selectedPlatforms.filter(p => p !== (ch.provider)) : selectedPlatforms.push(ch.provider)"
              />
            </div>
          </div>
          
          <div v-else class="p-4 rounded-xl border border-dashed text-center space-y-2" style="border-color: var(--el-border-color); background-color: var(--el-fill-color-light);">
            <p class="text-xs text-[var(--el-text-color-secondary)]">No social channels linked yet.</p>
            <el-button size="small" type="primary" round icon="Link" @click="goToSettingsChannels">Connect Social Channels</el-button>
          </div>
        </div>

        <!-- Schedule Mode -->
        <div class="p-4 rounded-xl border space-y-3" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light);">
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold" style="color: var(--el-text-color-primary);">Publishing Schedule Mode</div>
            <el-radio-group v-model="publishMode" size="small">
              <el-radio-button label="now">🚀 Deploy Now</el-radio-button>
              <el-radio-button label="schedule">📅 Schedule Later</el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="publishMode === 'schedule'" class="pt-2 border-t flex items-center gap-3" style="border-color: var(--el-border-color-light);">
            <el-date-picker
              v-model="scheduledDateTime"
              type="datetime"
              placeholder="Select target publish date and time"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ssZ"
              class="!w-full"
            />
          </div>
        </div>
      </div>

      <!-- ── STEP 4: Live Published Results & Platform Links ──────────────── -->
      <div v-else-if="activeStep === 'results'" class="space-y-5 max-h-[58vh] overflow-y-auto pr-1">
        <!-- Success Celebratory Banner -->
        <div class="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/10 border border-emerald-500/30 flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/25 shrink-0">
            <el-icon><Check /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-bold text-emerald-400">
              {{ publishResult?.type === 'schedule' ? '🎉 Publication Successfully Scheduled!' : '🎉 Multi-Platform Deployment Successful!' }}
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ publishResult?.type === 'schedule' 
                ? `Your video has been scheduled for publication on ${formatDate(publishResult?.scheduled_time)}.` 
                : 'Your video is now live across your selected social channels. Click any platform below to view it live!' }}
            </p>
          </div>
        </div>

        <!-- Live Platform Links List -->
        <div class="space-y-3">
          <div class="text-xs font-bold uppercase tracking-wider flex items-center justify-between" style="color: var(--el-text-color-secondary);">
            <span>Published Platform Links ({{ Object.keys(publishResult?.published_urls || {}).length || selectedPlatforms.length }})</span>
            <span class="text-[10px] text-emerald-400 font-semibold">● Live Links Active</span>
          </div>

          <div class="grid grid-cols-1 gap-3">
            <div
              v-for="(url, plat) in (publishResult?.published_urls || {})"
              :key="plat"
              class="p-4 rounded-2xl border flex items-center justify-between transition-all hover:shadow-md"
              style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light);"
            >
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center border font-bold text-sm" :class="getPlatformBadgeClass(plat as string)">
                  <el-icon :size="20"><component :is="getPlatformIcon(plat as string)" /></el-icon>
                </div>

                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="text-xs font-bold capitalize" style="color: var(--el-text-color-primary);">
                      {{ plat === 'youtube' ? 'YouTube Shorts' : (plat === 'tiktok' ? 'TikTok Video' : (plat === 'facebook' ? 'Facebook Reels' : (plat === 'instagram' ? 'Instagram Reels' : plat))) }}
                    </h4>
                    <el-tag size="small" type="success" effect="dark" round class="!font-bold !text-[9px] !h-4">
                      LIVE
                    </el-tag>
                  </div>
                  <p class="text-[11px] text-muted-foreground truncate max-w-sm mt-0.5 font-mono">
                    {{ url }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <el-button
                  size="small"
                  plain
                  round
                  icon="DocumentCopy"
                  class="!text-xs"
                  @click="copyLink(url)"
                >
                  Copy Link
                </el-button>

                <a
                  :href="url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow transition-all"
                >
                  <span>View on {{ plat }}</span>
                  <el-icon :size="12"><TopRight /></el-icon>
                </a>
              </div>
            </div>

            <!-- Fallback if schedule mode -->
            <div
              v-if="publishResult?.type === 'schedule'"
              class="p-4 rounded-2xl border flex items-center justify-between"
              style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color-light);"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <el-icon :size="20"><Calendar /></el-icon>
                </div>
                <div>
                  <h4 class="text-xs font-bold" style="color: var(--el-text-color-primary);">Scheduled Queue Active</h4>
                  <p class="text-[11px] text-muted-foreground">Target platforms: {{ (publishResult?.platforms || []).join(', ') }}</p>
                </div>
              </div>
              <el-tag type="warning" effect="dark" round class="font-bold">Scheduled</el-tag>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <el-button
            v-if="activeStep !== 'versions' && activeStep !== 'results'"
            size="small"
            plain
            round
            @click="activeStep = activeStep === 'deploy' ? 'metadata' : 'versions'"
          >
            Back
          </el-button>
        </div>

        <div class="flex items-center gap-2">
          <el-button v-if="activeStep !== 'results'" @click="isOpen = false">Cancel</el-button>

          <el-button
            v-if="activeStep === 'versions' || activeStep === 'metadata'"
            type="primary"
            round
            @click="activeStep = activeStep === 'versions' ? 'metadata' : 'deploy'"
          >
            Next Step
          </el-button>

          <el-button
            v-else-if="activeStep === 'deploy'"
            type="primary"
            round
            icon="Promotion"
            :loading="isPublishing"
            @click="executeDeploy"
          >
            {{ publishMode === 'schedule' ? 'Schedule Publication' : '1-Click Multi-Platform Deploy' }}
          </el-button>

          <template v-else-if="activeStep === 'results'">
            <el-button
              plain
              round
              @click="activeStep = 'versions'"
            >
              Publish Another Episode
            </el-button>
            <el-button
              type="primary"
              round
              @click="isOpen = false"
            >
              Done
            </el-button>
          </template>
        </div>
      </div>
    </template>
  </el-dialog>

  <!-- Video Preview Modal -->
  <el-dialog
    v-model="isVideoPreviewOpen"
    :title="previewVideoTitle || 'Rendered Video Preview'"
    width="440px"
    append-to-body
    class="rounded-2xl"
    :close-on-click-modal="true"
  >
    <div class="aspect-[9/16] bg-black rounded-xl overflow-hidden flex items-center justify-center border border-white/10 shadow-2xl relative">
      <video
        v-if="previewVideoUrl"
        :key="previewVideoUrl"
        :src="previewVideoUrl"
        controls
        autoplay
        class="w-full h-full object-contain"
      />
      <div v-else class="text-center p-6 text-white/80 space-y-2">
        <el-icon :size="42" class="text-amber-400"><VideoPlay /></el-icon>
        <p class="text-xs font-semibold text-white">{{ t('distribution.noRenderedVideoFile', 'No Rendered Video File') }}</p>
        <p class="text-[11px] text-white/60">{{ t('distribution.noRenderedVideoFileHelp', 'This episode does not have a completed video render. Please open Timeline Editor and click Export/Render to produce the MP4 video.') }}</p>
      </div>
    </div>
    <template #footer>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground truncate">{{ previewVideoTitle }}</span>
        <el-button
          v-if="previewVideoUrl"
          type="primary"
          plain
          round
          icon="Download"
          size="small"
          @click="downloadVideo(previewVideoUrl, previewVideoTitle)"
        >
          Download Video
        </el-button>
      </div>
    </template>
  </el-dialog>

  <!-- Cover Image Lightbox Modal -->
  <el-dialog
    v-model="isCoverImageModalOpen"
    :title="coverModalTitle || 'Episode Cover Poster'"
    width="460px"
    append-to-body
    class="rounded-2xl"
    :close-on-click-modal="true"
  >
    <div class="aspect-[9/16] bg-black rounded-xl overflow-hidden flex items-center justify-center border border-white/10 shadow-2xl">
      <img
        v-if="coverModalUrl"
        :src="coverModalUrl"
        :alt="coverModalTitle"
        class="w-full h-full object-contain"
      />
    </div>
    <template #footer>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground truncate">{{ coverModalTitle }}</span>
        <a
          :href="coverModalUrl"
          target="_blank"
          download="cover_poster.jpg"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow transition-all"
        >
          <el-icon><Download /></el-icon>
          <span>Download High-Res Cover</span>
        </a>
      </div>
    </template>
  </el-dialog>

  <!-- ── Quick Upload Local Video Modal ──────────────────────────────── -->
  <el-dialog
    v-model="isUploadModalOpen"
    title="Upload Local Rendered Video"
    width="480px"
    append-to-body
    class="rounded-2xl"
  >
    <div class="space-y-4 py-2">
      <div>
        <label class="block text-xs font-semibold mb-1.5" style="color: var(--el-text-color-primary);">Select Target Episode</label>
        <el-select v-model="uploadForm.episodeId" class="w-full" placeholder="Select Episode">
          <el-option
            v-for="ep in episodes"
            :key="ep.id"
            :label="`Episode ${getEpisodeNumber(ep)}: ${ep.title}`"
            :value="ep.id"
          />
        </el-select>
      </div>

      <div>
        <label class="block text-xs font-semibold mb-1.5" style="color: var(--el-text-color-primary);">Audio / Subtitle Language</label>
        <el-select v-model="uploadForm.language" class="w-full" placeholder="Select Language">
          <el-option
            v-for="(name, code) in LANGUAGE_NAMES"
            :key="code"
            :label="`${name} (${code})`"
            :value="code"
          />
        </el-select>
      </div>

      <div>
        <label class="block text-xs font-semibold mb-1.5" style="color: var(--el-text-color-primary);">Video File (.mp4, .mov, .webm)</label>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          class="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer p-2 rounded-xl border"
          style="border-color: var(--el-border-color);"
          @change="onFileSelected"
        />
        <p v-if="uploadForm.file" class="text-[11px] text-emerald-500 mt-1 font-medium">
          Selected: {{ uploadForm.file.name }} ({{ (uploadForm.file.size / (1024 * 1024)).toFixed(1) }} MB)
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="isUploadModalOpen = false">Cancel</el-button>
        <el-button
          type="primary"
          :loading="isUploadingVersion"
          :disabled="!uploadForm.file || !uploadForm.episodeId"
          @click="submitUploadVersion"
        >
          Upload &amp; Save Version
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.bulk-publish-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}
</style>
