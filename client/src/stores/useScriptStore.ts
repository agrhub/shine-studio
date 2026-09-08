import { defineStore } from 'pinia';
import http from '@/utils/http';
import { useSeriesStore } from '@/stores/useSeriesStore';
import type {
  Episode,
  ScriptItem,
  SeriesOutline,
  SupervisionResult,
  CustomizeAssetParams,
  CustomizeAssetResult,
  SelectAssetVersionParams,
  SelectAssetVersionResult,
  ApiResponse,
  Series,
  Character,
  LocationAsset,
  PropAsset,
  ShotFrame,
  Scene,
  CustomizableAsset,
  AssetVersion,
  CustomizeVideoResult,
  CustomizeVideoParams,
} from '@/types/api';

export const useScriptStore = defineStore('script', {
  state: () => ({
    activeScript: null as ScriptItem | null,
    outline: null as SeriesOutline | null,
    supervision: null as SupervisionResult | null,
    isGenerating: false,
    isSupervising: false,
    episodesList: [] as Episode[],
  }),

  actions: {
    async fetchEpisodes(seriesId: string) {
      try {
        const res = await http.get<ApiResponse<{ episodes?: Episode[] }>>(`/series/${seriesId}`);
        const eps = (res.data as unknown as { episodes?: Episode[]; series?: { episodes?: Episode[] } })?.episodes || [];
        this.episodesList = eps.map((e: Episode, idx: number) => ({
          ...e,
          id: e.id,
          number: e.episode_number || idx + 1,
          title: e.title || `Episode ${idx + 1}`,
          status: e.status?.toLowerCase() === 'published' ? 'done' : 'draft',
        }));
      } catch {
        this.episodesList = [];
      }
    },

    async generateScript(seriesId?: string, episodeNumber: number = 1) {
      if (seriesId) {
        try {
          const res = await http.get<ApiResponse<{ series?: Series }>>(`/series/${seriesId}`);
          const s = (res.data as unknown as { series?: Series })?.series || (res.data as unknown as Series);
          if (s && s.title) {
            return await this.generateFullScript({
              title: s.title,
              genre: s.genre || 'Suspense',
              visual_style: s.visual_style || 'realistic',
              synopsis: s.synopsis || `${s.title} official series synopsis.`,
              episode_number: episodeNumber || 1,
              total_episodes: s.episode_count || 20,
            });
          }
        } catch (e) {
          console.warn('[useScriptStore] fetch series failed for generateScript:', e);
        }
      }

      // If seriesId is not specified or not found, fetch latest active series from DB
      try {
        const listRes = await http.get<ApiResponse<{ series?: Series[] }>>('/series');
        const seriesList = (listRes.data as unknown as { series?: Series[] })?.series || (listRes.data as unknown as Series[]) || [];
        if (Array.isArray(seriesList) && seriesList.length > 0) {
          const s = seriesList[0];
          return await this.generateFullScript({
            title: s.title,
            genre: s.genre || 'Suspense',
            visual_style: s.visual_style || 'realistic',
            synopsis: s.synopsis || `${s.title} official series synopsis.`,
            episode_number: episodeNumber || 1,
            total_episodes: s.episode_count || 20,
          });
        }
      } catch (e) {
        console.warn('[useScriptStore] fetch series list failed:', e);
      }

      throw new Error('No series found to generate script. Please select or create a series first.');
    },

    async generateFullScript(payload: { title: string; genre: string; visual_style?: string; synopsis: string; episode_number?: number; total_episodes?: number }) {
      this.isGenerating = true;
      try {
        const res = await http.post<ApiResponse<{ outline: SeriesOutline; script_item: ScriptItem; supervision: SupervisionResult }>>('/ai/generate-script', payload);
        const data = res.data as unknown as { outline?: SeriesOutline; script_item?: ScriptItem; supervision?: SupervisionResult };
        if (data) {
          this.outline = data.outline || null;
          this.activeScript = data.script_item || null;
          this.supervision = data.supervision || null;
        }
        return res.data;
      } finally {
        this.isGenerating = false;
      }
    },

    async generateOutline(payload: { title: string; genre: string; synopsis: string; episodeCount: number }) {
      this.isGenerating = true;
      try {
        const res = await http.post<ApiResponse<SeriesOutline>>('/ai/generate-outline', payload);
        if (res.data) {
          this.outline = res.data as unknown as SeriesOutline;
        }
        return res.data;
      } finally {
        this.isGenerating = false;
      }
    },

    async superviseActiveScript() {
      if (!this.activeScript) return;
      this.isSupervising = true;
      try {
        const res = await http.post<ApiResponse<SupervisionResult>>('/ai/supervise-script', { scriptItem: this.activeScript });
        if (res.data) {
          this.supervision = res.data as unknown as SupervisionResult;
        }
        return res.data;
      } finally {
        this.isSupervising = false;
      }
    },

    updateSceneDialogue(sceneIndex: number, lineIndex: number, newDialogue: string) {
      if (this.activeScript && this.activeScript.scenes[sceneIndex]) {
        if (this.activeScript.scenes[sceneIndex].lines?.[lineIndex]) {
          this.activeScript.scenes[sceneIndex].lines[lineIndex].dialogue = newDialogue;
        }
      }
    },

    // ─── GOOGLE FLOW STORYBOARD STUDIO ACTIONS ───────────────────────────────
    async extractScreenplayAssets(screenplay: string, seriesId?: string, episodeId?: string) {
      const seriesStore = useSeriesStore();
      const sId = seriesId || seriesStore.currentSeries?.id;
      const epId = episodeId || seriesStore.activeEpisode?.id;
      const res = await http.post<ApiResponse<{ characters: Character[]; locations: LocationAsset[]; props: PropAsset[] }>>('/assets/screenplay/extract', {
        screenplay,
        series_id: sId,
        episode_id: epId,
      });
      return (res.data as unknown as { characters: Character[]; locations: LocationAsset[]; props: PropAsset[] }) || { characters: [], locations: [], props: [] };
    },

    async describeScreenplayAssets(payload: {
      screenplay: string;
      characters?: string[];
      locations?: string[];
      props?: string[];
      series_id?: string;
      episode_id?: string;
    }) {
      const seriesStore = useSeriesStore();
      const sId = payload.series_id || seriesStore.currentSeries?.id;
      const epId = payload.episode_id || seriesStore.activeEpisode?.id;
      const res = await http.post<ApiResponse<{ characters: Record<string, string>; locations: Record<string, string>; props: Record<string, string> }>>('/assets/screenplay/describe-assets', {
        ...payload,
        series_id: sId,
        episode_id: epId,
      });
      return (res.data as unknown as { characters: Record<string, string>; locations: Record<string, string>; props: Record<string, string> }) || { characters: {}, locations: {}, props: {} };
    },

    async analyzeScreenplay(payload: {
      screenplay: string;
      series_id?: string;
      episode_id?: string;
      existing_characters?: Character[];
      existing_locations?: LocationAsset[];
      existing_props?: PropAsset[];
      target_duration_seconds?: number;
    }): Promise<{
      characters: Character[];
      locations: LocationAsset[];
      props: PropAsset[];
      scenes: Scene[];
      total_duration_seconds: number;
      totalDurationSeconds: number;
    }> {
      const seriesStore = useSeriesStore();
      const sId = payload.series_id || seriesStore.currentSeries?.id;
      const epId = payload.episode_id || seriesStore.activeEpisode?.id;
      const res = await http.post<ApiResponse<{ characters: Character[]; locations: LocationAsset[]; props: PropAsset[]; scenes: Scene[]; total_duration_seconds: number; totalDurationSeconds?: number }>>('/assets/screenplay/analyze', {
        ...payload,
        series_id: sId,
        episode_id: epId,
      });
      const raw = res.data as unknown as { characters?: Character[]; locations?: LocationAsset[]; props?: PropAsset[]; scenes?: Scene[]; total_duration_seconds?: number; totalDurationSeconds?: number };
      const scenesSum = Array.isArray(raw?.scenes) ? raw.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0) : 0;
      const dur = scenesSum > 0 ? scenesSum : Number(raw?.total_duration_seconds || raw?.totalDurationSeconds || 0);

      const targetEp = seriesStore.episodesList.find(e => e.id === epId);
      if (targetEp && Array.isArray(raw?.scenes) && raw.scenes.length > 0) {
        targetEp.scenes = raw.scenes;
        targetEp.scenes_count = `${raw.scenes.length} scenes`;
        if (dur > 0) {
          targetEp.duration_seconds = dur;
          targetEp.duration = seriesStore.formatTime(dur);
        }
        seriesStore.episodesList = [...seriesStore.episodesList];
      }

      return {
        characters: raw?.characters || [],
        locations: raw?.locations || [],
        props: raw?.props || [],
        scenes: raw?.scenes || [],
        total_duration_seconds: dur,
        totalDurationSeconds: dur,
      };
    },

    async generateCharacterSheet(payload: { character_id: string; series_id: string; variant_id: string, physical_characteristics?: string; clothing_and_accessories?: string; visual_style?: string; reference_image_url?: string; prompt?: string }): Promise<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }> {
      const res = await http.post<ApiResponse<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }>>('/assets/character/sheet', payload);
      return (res.data as unknown as { image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }) || { image_url: '' };
    },

    async generateLocationSheet(payload: { location_id: string; series_id: string; physical_characteristics?: string; visual_environment?: string; time_of_day?: string; visual_style?: string }): Promise<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }> {
      const res = await http.post<ApiResponse<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }>>('/assets/location/sheet', payload);
      return (res.data as unknown as { image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }) || { image_url: '' };
    },

    async generatePropSheet(payload: { prop_id: string; series_id: string; physical_characteristics: string; visual_style?: string }): Promise<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }> {
      const res = await http.post<ApiResponse<{ image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }>>('/assets/prop/sheet', payload);
      return (res.data as unknown as { image_url: string; prompt?: string; version?: AssetVersion; asset?: CustomizableAsset }) || { image_url: '' };
    },

    async breakdownSceneToShots(payload: { scene_title: string; scene_content: string; available_assets: unknown[] }) {
      const res = await http.post<ApiResponse<{ shots: ShotFrame[] }>>('/assets/screenplay/breakdown-shots', payload);
      return (res.data as unknown as { shots?: ShotFrame[] })?.shots || [];
    },

    async generateShotImage(payload: { shot: ShotFrame | Record<string, unknown>; assets: unknown[]; visual_style?: string; aspect_ratio?: string }) {
      const res = await http.post<ApiResponse<{ image_url: string }>>('/assets/storyboard/shot-image', payload);
      return (res.data as unknown as { image_url: string }) || { image_url: '' };
    },

    async customizeAsset(payload: CustomizeAssetParams): Promise<CustomizeAssetResult> {
      const res = await http.post<ApiResponse<CustomizeAssetResult>>('/assets/customize', payload);
      return res.data as unknown as CustomizeAssetResult;
    },

    async customizeVideo(payload: CustomizeVideoParams): Promise<CustomizeVideoResult> {
      const res = await http.post<ApiResponse<CustomizeVideoResult>>('/assets/video-generate', payload);
      return res.data as unknown as CustomizeVideoResult;
    },

    async selectAssetVersion(payload: SelectAssetVersionParams): Promise<SelectAssetVersionResult> {
      const res = await http.post<ApiResponse<SelectAssetVersionResult>>('/assets/select-version', payload);
      return res.data as unknown as SelectAssetVersionResult;
    },
  },
});
