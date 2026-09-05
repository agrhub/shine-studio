import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '../database/index.js';
import { scriptAgent } from '../agents/ScriptAgent.js';
import { SeriesService } from '../services/SeriesService.js';
import { StorageFactory } from '../services/storage/StorageFactory.js';
import { Logger } from '../utils/logger.js';
import { nanoid } from 'nanoid';
import { getAuthUser, getUserId } from '~/utils/auth.js';
import { normalizeSceneEntity, normalizeLocationAsset, normalizePropAsset, normalizeCharacterEntity } from '../utils/sceneNormalizer.js';
import type { LocationAsset, PropAsset, SceneEntity, CharacterSeriesEntity } from '@/types.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max for video renders
});

const router = Router();

// Standardized response helpers
function ok(res: Response, data: any, message = 'Success', statusCode = 200) {
  res.status(statusCode).json({ code: statusCode, data, message, error: null });
}
function fail(res: Response, statusCode: number, message: string) {
  res.status(statusCode).json({ code: statusCode, data: null, message: null, error: message });
}

// GET /api/series - List all series
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Authentication required: user_id is missing');
      return;
    }
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const db = await getDatabaseProvider();
    const seriesList = await db.getSeriesList(userId, search, status);
    const enhancedSeries = (seriesList || []).map((s) => ({
      ...s,
      published_episode_count: typeof s.published_episode_count === 'number' ? s.published_episode_count : 0,
      episode_count: s.episode_count || 1,
    }));
    ok(res, { series: enhancedSeries, total: enhancedSeries.length });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// PATCH /api/series/:id - Update series metadata (Rename, Archive, Status)
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const { title, status, description, tone, genre } = req.body;

    const db = await getDatabaseProvider();
    const existing = await db.getSeriesById(seriesId);
    if (!existing) {
      fail(res, 404, 'Series not found'); return;
    }

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;
    if (description !== undefined) updates.description = description;
    if (tone !== undefined) updates.tone = tone;
    if (genre !== undefined) updates.genre = genre;

    const updated = await db.updateSeries(seriesId, updates);
    ok(res, { series: updated }, 'Series updated successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

function extractStorageKeysFromAsset(asset: any): string[] {
  const keys: string[] = [];
  if (asset.s3_key) {
    keys.push(asset.s3_key);
  }
  if (asset.url && typeof asset.url === 'string' && asset.url.includes('/api/assets/file/')) {
    const key = asset.url.replace('/api/assets/file/', '').replace(/^\/+/, '');
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (asset.thumbnail && typeof asset.thumbnail === 'string' && asset.thumbnail.includes('/api/assets/file/')) {
    const thumbKey = asset.thumbnail.replace('/api/assets/file/', '').replace(/^\/+/, '');
    if (thumbKey && !keys.includes(thumbKey)) keys.push(thumbKey);
  }
  return keys;
}

// DELETE /api/series/:id - Permanently delete series and all S3/cloud assets
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    if (!series) {
      fail(res, 404, 'Series not found'); return;
    }

    const episodes = await db.getEpisodesBySeriesId(seriesId);

    // 1. Purge all related assets on S3 / Storage Provider BEFORE deleting DB records
    try {
      const storage = await StorageFactory.getActiveAdapter();
      Logger.info(`[SeriesDelete] Purging cloud assets for series "${seriesId}" and ${episodes.length} episodes...`);

      // Delete series asset folders
      await storage.deleteFolder(`series/${seriesId}`);
      await storage.deleteFolder(`images/${seriesId}`);
      await storage.deleteFolder(`videos/${seriesId}`);
      await storage.deleteFolder(`audio/${seriesId}`);

      // Delete episode asset folders
      for (const ep of episodes) {
        await storage.deleteFolder(`episodes/${ep.id}`);
      }

      // Delete individual asset files associated with this series
      const seriesAssets = await db.getAssets({ series_id: seriesId });
      for (const a of seriesAssets) {
        const keys = extractStorageKeysFromAsset(a);
        for (const k of keys) {
          await storage.deleteFile(k);
        }
      }

      // Also delete asset files for all episodes of this series
      for (const ep of episodes) {
        const epAssets = await db.getAssets({ episode_id: ep.id });
        for (const a of epAssets) {
          const keys = extractStorageKeysFromAsset(a);
          for (const k of keys) {
            await storage.deleteFile(k);
          }
        }
      }

      Logger.info(`[SeriesDelete] Successfully purged cloud assets for "${seriesId}".`);
    } catch (storageErr: any) {
      Logger.warn(`[SeriesDelete] Cloud storage asset purge warning: ${storageErr.message}`);
    }

    // 2. Delete series and episodes from database
    await db.deleteSeries(seriesId);

    ok(res, { deleted: true, seriesId }, 'Series and all associated assets deleted successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/series - Create a new series
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Authentication required: user_id is missing');
      return;
    }

    const { series, episodes } = await SeriesService.createSeries({
      ...req.body,
      user_id: userId,
    });

    ok(res, { series, episodes }, 'Series created successfully', 201);
  } catch (err: any) {
    fail(res, err.message?.includes('required') ? 400 : 500, err.message || 'Internal server error');
  }
});

// GET /api/series/:id - Get series details with episodes (Auto-activates DRAFT series when workspace is opened)
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const db = await getDatabaseProvider();
    let series = await db.getSeriesById(seriesId as string);
    if (!series) {
      fail(res, 404, 'Series not found'); return;
    }

    // If series is in DRAFT, transition to ACTIVE upon entering workspace for production
    if (series.status === 'DRAFT') {
      series = await db.updateSeries(seriesId, { status: 'ACTIVE' });
    }

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    ok(res, { series, episodes: episodes || [] });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// PUT /api/series/:id/characters - Update and persist series characters
router.put('/:id/characters', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const { characters } = req.body;
    if (!Array.isArray(characters)) {
      fail(res, 400, 'characters must be an array');
      return;
    }

    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    if (!series) {
      fail(res, 404, 'Series not found');
      return;
    }

    let parsedPlan: any = {};
    if (series.master_plan) {
      parsedPlan = typeof series.master_plan === 'string' ? JSON.parse(series.master_plan) : series.master_plan;
    }
    parsedPlan.characters = characters;

    await db.updateSeries(seriesId, {
      characters,
      master_plan: parsedPlan,
    });

    ok(res, { characters, message: 'Characters updated successfully' });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// PUT /api/series/:id/episodes/:epId - Update episode scenes, metadata, and language tracks
router.put('/:id/episodes/:epId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: seriesId, epId } = req.params;
    const { scenes, title, synopsis, language_tracks, thumbnail_url, cover_image, status, dubbing_settings, caption_settings, caption_languages, dubbing_languages, render_versions, video_urls, video_url } = req.body;
    const db = await getDatabaseProvider();

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    const ep = episodes.find(e => e.id === epId || String(e.episode_number) === String(epId));
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }

    const targetSeries = await db.getSeriesById(seriesId as string);
    const seriesChars = targetSeries?.characters || [];

    const updates: any = {};
    if (scenes !== undefined) {
      updates.scenes = Array.isArray(scenes) ? scenes.map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)) : [];
    }
    if (title !== undefined) updates.title = title;
    if (synopsis !== undefined) updates.synopsis = synopsis;
    if (language_tracks !== undefined) updates.language_tracks = language_tracks;
    if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url;
    if (cover_image !== undefined) updates.cover_image = cover_image;
    if (status !== undefined) updates.status = status;
    if (dubbing_settings !== undefined) updates.dubbing_settings = dubbing_settings;
    if (caption_settings !== undefined) updates.caption_settings = caption_settings;
    const BCP47_REGEX = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i;
    if (caption_languages !== undefined) {
      if (!Array.isArray(caption_languages)) {
        return fail(res, 400, 'caption_languages must be an array of BCP-47 language codes');
      }
      for (const lang of caption_languages) {
        if (typeof lang !== 'string' || !BCP47_REGEX.test(lang.trim())) {
          return fail(res, 400, `Invalid language code "${lang}" in caption_languages. Must be a valid BCP-47 code (e.g. "en-US", "vi-VN").`);
        }
      }
      updates.caption_languages = [...new Set(caption_languages.map(l => l.trim()))];
    }
    if (dubbing_languages !== undefined) {
      if (!Array.isArray(dubbing_languages)) {
        return fail(res, 400, 'dubbing_languages must be an array of BCP-47 language codes');
      }
      for (const lang of dubbing_languages) {
        if (typeof lang !== 'string' || !BCP47_REGEX.test(lang.trim())) {
          return fail(res, 400, `Invalid language code "${lang}" in dubbing_languages. Must be a valid BCP-47 code (e.g. "en-US", "vi-VN").`);
        }
      }
      updates.dubbing_languages = [...new Set(dubbing_languages.map(l => l.trim()))];
    }
    if (render_versions !== undefined) updates.render_versions = render_versions;
    if (video_urls !== undefined) updates.video_urls = video_urls;
    if (video_url !== undefined) updates.video_url = video_url;

    const updatedEpisode = await db.updateEpisode(ep.id, updates);
    const resultEpisode = {
      ...updatedEpisode,
      scenes: Array.isArray(updatedEpisode?.scenes) ? updatedEpisode.scenes.map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)) : [],
    };
    ok(res, { episode: resultEpisode, message: 'Episode updated successfully' });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/series/:id/episodes/:epId/render-versions — Add / upload a rendered video version
router.post('/:id/episodes/:epId/render-versions', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: seriesId, epId } = req.params;
    const db = await getDatabaseProvider();

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    const ep = episodes.find(e => e.id === epId || String(e.episode_number) === String(epId));
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }

    let finalVideoUrl = req.body.video_url || req.body.url || '';
    let finalFileSize = req.body.file_size || '';

    // If a video file was uploaded directly via multipart/form-data
    if (req.file) {
      const file = req.file;
      const mime = file.mimetype || 'video/mp4';
      const ext = file.originalname.split('.').pop() || 'mp4';
      const s3Result = await StorageFactory.uploadMedia(file.buffer, 'videos', ext, mime);
      finalVideoUrl = `/api/assets/file/${s3Result.key}`;
      finalFileSize = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (!finalVideoUrl) {
      fail(res, 400, 'video_url or file is required');
      return;
    }

    const lang = req.body.language || 'en-US';
    const versionId = req.body.version_id || `ver_${ep.id}_${lang}_${nanoid(6)}`;
    const versionEntity = {
      id: versionId,
      version_id: versionId,
      language: lang,
      languages: [lang],
      voice: req.body.voice || `Audio (${lang})`,
      subtitles: Array.isArray(req.body.subtitles) ? req.body.subtitles : (req.body.subtitles ? [req.body.subtitles] : [`Caption: ${lang} (Burned-in)`]),
      resolution: req.body.resolution || '1080x1920 (9:16 Vertical HD)',
      video_url: finalVideoUrl,
      url: finalVideoUrl,
      thumbnail_url: req.body.thumbnail_url || ep.cover_image || ep.scenes?.[0]?.storyboard_frame_url || '/images/dashboard/poster-1.jpg',
      duration: Number(req.body.duration) || (ep.scenes?.reduce((acc: number, sc: any) => acc + (sc.duration_seconds || 5), 0)) || 60,
      file_size: finalFileSize || req.body.file_size || '24.5 MB',
      rendered_at: new Date().toISOString(),
      status: 'ready',
    };

    const existingVersions = Array.isArray(ep.render_versions) ? [...ep.render_versions] : [];
    const existingIndex = existingVersions.findIndex((v: any) => (v.version_id === versionId || v.id === versionId));
    if (existingIndex >= 0) {
      existingVersions[existingIndex] = versionEntity;
    } else {
      existingVersions.unshift(versionEntity);
    }

    const videoUrls = (typeof ep.video_urls === 'object' && ep.video_urls) ? { ...ep.video_urls } : {};
    videoUrls[lang] = finalVideoUrl;

    const updatedEpisode = await db.updateEpisode(ep.id, {
      render_versions: existingVersions,
      video_urls: videoUrls,
      video_url: ep.video_url || finalVideoUrl,
    });

    ok(res, { version: versionEntity, episode: updatedEpisode }, 'Render version added successfully', 201);
  } catch (err: any) {
    Logger.error(`[AddRenderVersion] Failed: ${err.message}`);
    fail(res, 500, err.message || 'Failed to add render version');
  }
});

// DELETE /api/series/:id/episodes/:epId/render-versions/:versionId — Remove a rendered version
router.delete('/:id/episodes/:epId/render-versions/:versionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: seriesId, epId, versionId } = req.params;
    const db = await getDatabaseProvider();

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    const ep = episodes.find(e => e.id === epId || String(e.episode_number) === String(epId));
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }

    const existingVersions = Array.isArray(ep.render_versions) ? [...ep.render_versions] : [];
    const remainingVersions = existingVersions.filter((v: any) => (v.version_id !== versionId && v.id !== versionId));

    const videoUrls = (typeof ep.video_urls === 'object' && ep.video_urls) ? { ...ep.video_urls } : {};
    for (const [l, u] of Object.entries(videoUrls)) {
      const match = existingVersions.find((v: any) => (v.version_id === versionId || v.id === versionId) && (v.video_url === u || v.url === u));
      if (match) {
        delete videoUrls[l];
      }
    }

    const updatedEpisode = await db.updateEpisode(ep.id, {
      render_versions: remainingVersions,
      video_urls: videoUrls,
      video_url: remainingVersions.length > 0 ? (remainingVersions[0].video_url || remainingVersions[0].url) : undefined,
    });

    ok(res, { render_versions: remainingVersions, episode: updatedEpisode }, 'Render version deleted successfully');
  } catch (err: any) {
    Logger.error(`[DeleteRenderVersion] Failed: ${err.message}`);
    fail(res, 500, err.message || 'Failed to delete render version');
  }
});

// PATCH /api/series/:id/episodes/:epId - Partial update episode
router.patch('/:id/episodes/:epId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: seriesId, epId } = req.params;
    const db = await getDatabaseProvider();

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    const ep = episodes.find(e => e.id === epId || String(e.episode_number) === String(epId));
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }

    const body = { ...req.body };
    if (body.scenes !== undefined && Array.isArray(body.scenes)) {
      body.scenes = body.scenes.map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1));
    }
    const updatedEpisode = await db.updateEpisode(ep.id, body);
    const resultEpisode = {
      ...updatedEpisode,
      scenes: Array.isArray(updatedEpisode?.scenes) ? updatedEpisode.scenes.map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)) : [],
    };
    ok(res, { episode: resultEpisode, message: 'Episode updated successfully' });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// GET /api/series/:id/episodes/:epId/script - Get or auto-generate full screenplay for episode
router.get('/:id/episodes/:epId/script', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: seriesId, epId } = req.params;
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId as string);
    if (!series) {
      fail(res, 404, 'Series not found'); return;
    }

    const episodes = await db.getEpisodesBySeriesId(seriesId as string);
    const ep = episodes.find(e => e.id === epId || (e as any)._id === epId || String(e.episode_number) === String(epId));
    if (!ep) {
      fail(res, 404, 'Episode not found'); return;
    }

    let screenplay = ep.screenplay || '';
    const isRawJson = (str: string) => {
      const trimmed = (str || '').trim();
      return trimmed.startsWith('```json') || trimmed.startsWith('{') || trimmed.startsWith('```\n{') || trimmed.startsWith('```\r\n{');
    };

    if ((!screenplay || isRawJson(screenplay)) && Array.isArray(ep.scenes) && ep.scenes.length > 0) {
      screenplay = scriptAgent.assembleMarkdownScreenplay(ep.scenes as any, ep.title || `Episode ${ep.episode_number}`);
      // Auto-heal in database so it becomes permanent clean markdown
      await db.updateEpisode(ep.id, { screenplay }).catch(() => {});
    }

    const characters = series.characters || [];
    const locations = series.locations || [];
    const props = series.props || [];

    const hasFullScreenplay = Boolean(
      screenplay &&
      !isRawJson(screenplay) &&
      Array.isArray(ep.scenes) &&
      ep.scenes.length >= 4
    );

    if (hasFullScreenplay) {
      ok(res, {
        episode: `EP ${String(ep.episode_number).padStart(2, '0')}`,
        episode_number: ep.episode_number,
        title: ep.title,
        synopsis: ep.synopsis,
        screenplay,
        scenes: ep.scenes || [],
        characters,
        locations,
        props,
        dubbing_settings: (ep as any).dubbing_settings || {},
        caption_settings: (ep as any).caption_settings || {},
        caption_languages: (ep as any).caption_languages || [],
        dubbing_languages: (ep as any).dubbing_languages || [],
      });
      return;
    }

    // Auto-generate scene screenplay on demand
    const scriptRes = await scriptAgent.execute({
      series_id: seriesId as string,
      episode_number: ep.episode_number,
      title: ep.title,
      genre: series.genre,
      visual_style: series.visual_style,
      synopsis: ep.synopsis,
      scene_core: ep.scene_core,
      conflict_escalation: ep.conflict_escalation,
      cliffhanger_hook: ep.cliffhanger_hook,
      characters: characters,
      locations: locations,
      props: props,
      story_core: series.master_plan?.story_core,
      country: series.country,
      ratio: series.ratio,
      target_duration_seconds: series.episode_duration || series.master_plan?.total_duration_seconds || 90,
    });

    if (scriptRes?.scenes) {
      const normalizedScenes: SceneEntity[] = (scriptRes.scenes || []).map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)).filter((s): s is SceneEntity => s !== null);

      await db.updateEpisode(ep.id, {
        scenes: normalizedScenes,
        screenplay: scriptRes.screenplay || '',
        reference_assets: {
          character_ids: characters.map(c => c.id),
          location_ids: locations.map(l => l.id),
          prop_ids: props.map(p => p.id),
        },
        duration: scriptRes.total_duration_seconds,
        script: JSON.stringify({
          ...scriptRes,
          scenes: normalizedScenes,
        }),
      });

      ok(res, {
        ...scriptRes,
        scenes: normalizedScenes,
        characters,
        locations,
        props,
      });
      return;
    } else {
      fail(res, 500, 'Failed to generate script');
    }
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/series/:id/episodes/:epId/generate-script - Generate script for a specific episode
router.post('/:id/episodes/:epId/generate-script', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const epId = req.params.epId as string;

    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    if (!series) {
      fail(res, 404, 'Series not found');
      return;
    }

    const ep = await db.getEpisodeById(epId);
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }

    const { synopsis, scene_core, conflict_escalation, cliffhanger_hook, target_duration_seconds } = req.body;
    const characters = series.characters || [];
    const locations = series.locations || [];
    const props = series.props || [];

    // Call ScriptAgent to analyze and break down into scenes
    const scriptRes = await scriptAgent.execute({
      series_id: series.id,
      episode_number: ep.episode_number,
      title: series.title,
      genre: series.genre,
      visual_style: series.visual_style,
      synopsis: synopsis || ep.synopsis,
      scene_core: scene_core || ep.scene_core,
      conflict_escalation: conflict_escalation || ep.conflict_escalation,
      cliffhanger_hook: cliffhanger_hook || ep.cliffhanger_hook,
      characters: characters,
      locations: locations,
      props: props,
      story_core: series.master_plan?.story_core,
      country: series.country,
      ratio: series.ratio,
      target_duration_seconds: Number(target_duration_seconds) || Number(ep.duration) || Number(series.master_plan?.total_duration_seconds) || 90,
    });

    if (scriptRes?.scenes) {
      const normalizedScenes = (scriptRes.scenes || []).map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)).filter((s): s is SceneEntity => s !== null);

      await db.updateEpisode(ep.id, {
        scenes: normalizedScenes,
        screenplay: scriptRes.screenplay || '',
        reference_assets: {
          character_ids: characters.map(c => c.id),
          location_ids: locations.map(l => l.id),
          prop_ids: props.map(p => p.id),
        },
        duration: scriptRes.total_duration_seconds,
        script: JSON.stringify({
          ...scriptRes,
          scenes: normalizedScenes,
        }),
      });

      ok(res, {
        ...scriptRes,
        scenes: normalizedScenes,
        characters,
        locations,
        props,
      });
      return;
    } else {
      fail(res, 500, 'Failed to generate script');
    }
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/series/:id/episodes - Add episode to series
router.post('/:id/episodes', async (req: Request, res: Response): Promise<void> => {
  try {
    const seriesId = req.params.id as string;
    const { title, synopsis } = req.body;

    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    const existingEps = await db.getEpisodesBySeriesId(seriesId);
    const nextEpNumber = existingEps.length + 1;
    const epId = `ep_${nanoid(10)}`;

    const targetDuration = req.body.duration || existingEps[0]?.duration || 90;

    const episode = await db.createEpisode({
      id: epId,
      series_id: seriesId,
      episode_number: nextEpNumber,
      title: title || `Episode ${nextEpNumber}`,
      synopsis: synopsis || '',
      scenes: [],
      reference_assets: {
        character_ids: (series?.characters || []).map(c => c.id),
        location_ids: (series?.locations || []).map(l => l.id),
        prop_ids: (series?.props || []).map(p => p.id),
      },
      duration: targetDuration,
      status: 'DRAFT',
    });

    ok(res, { episode }, 'Episode created successfully', 201);
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

export const episodesRouter = Router();

// GET /api/episodes/:episodeId
episodesRouter.get('/:episodeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const db = await getDatabaseProvider();
    const ep = await db.getEpisodeById(episodeId);
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }
    ok(res, { episode: ep });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// PUT /api/episodes/:episodeId
episodesRouter.put('/:episodeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const db = await getDatabaseProvider();
    const ep = await db.getEpisodeById(episodeId);
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }
    const updated = await db.updateEpisode(episodeId, req.body);
    ok(res, { episode: updated, message: 'Episode updated successfully' });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// PATCH /api/episodes/:episodeId
episodesRouter.patch('/:episodeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const db = await getDatabaseProvider();
    const ep = await db.getEpisodeById(episodeId);
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }
    const updated = await db.updateEpisode(episodeId, req.body);
    ok(res, { episode: updated, message: 'Episode updated successfully' });
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

import { normalizeTransitionKey } from '../constants/transitions.js';
import { normalizeEffectKey } from '../constants/effects.js';
import { TimelineService } from '../services/TimelineService.js';

// GET /api/episodes/:episodeId/timeline
episodesRouter.get('/:episodeId/timeline', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    if (!episodeId || episodeId.trim() === '') {
      fail(res, 400, 'Episode ID is required');
      return;
    }

    const timeline = await TimelineService.getOrBuildEpisodeTimeline(episodeId);
    ok(res, timeline);
  } catch (err: any) {
    fail(res, err.message?.includes('not found') ? 404 : 500, err.message || 'Failed to get episode timeline');
  }
});

// PUT /api/episodes/:episodeId/timeline
episodesRouter.put('/:episodeId/timeline', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const user = getAuthUser(req) as any;
    if (!user) {
      fail(res, 401, 'Unauthorized');
      return;
    }
    const { settings, tracks, clips, changeSummary, clientTimestamp, baseVersionNumber } = req.body;
    const db = await getDatabaseProvider();
    const ep = await db.getEpisodeById(episodeId);
    if (!ep) {
      fail(res, 404, 'Episode not found');
      return;
    }
    const series = ep.series_id ? await db.getSeriesById(ep.series_id) : null;
    const seriesRatio = (series?.ratio || '9:16').trim();
    let canvasWidth = 1080;
    let canvasHeight = 1920;
    if (seriesRatio === '16:9') {
      canvasWidth = 1920;
      canvasHeight = 1080;
    } else if (seriesRatio === '4:3') {
      canvasWidth = 1440;
      canvasHeight = 1080;
    } else if (seriesRatio === '1:1') {
      canvasWidth = 1080;
      canvasHeight = 1080;
    }

    // 1. Concurrency Timestamp Check: Ensure client is not overwriting a newer version
    const historyRes = await db.getTimelineHistory(episodeId, 1, 0);
    const latestVersion = historyRes.history?.[0];
    const latestTimeline = await db.getLatestTimeline(episodeId);

    if (latestVersion && clientTimestamp) {
      const serverTime = new Date(latestVersion.created_at).getTime();
      const clientTime = new Date(clientTimestamp).getTime();
      if (!isNaN(serverTime) && !isNaN(clientTime) && clientTime < serverTime) {
        fail(res, 409, `Timeline version conflict: Your edit is based on an older version (${clientTimestamp}). Current server version was updated at ${latestVersion.created_at}.`);
        return;
      }
    }

    const timelineData = {
      settings: settings || { width: canvasWidth, height: canvasHeight, fps: 30 },
      tracks: tracks || [],
      clips: clips || {},
    };

    // 2. Change Detection (Diffing)
    const diffDetails: string[] = [];
    if (latestTimeline) {
      const oldTracks = latestTimeline.tracks || [];
      const newTracks = tracks || [];
      const oldClips = latestTimeline.clips || {};
      const newClips = clips || {};

      if (newTracks.length !== oldTracks.length) {
        diffDetails.push(`${newTracks.length} tracks (was ${oldTracks.length})`);
      }
      const oldClipKeys = Object.keys(oldClips);
      const newClipKeys = Object.keys(newClips);
      const addedClips = newClipKeys.filter(k => !oldClips[k]);
      const removedClips = oldClipKeys.filter(k => !newClips[k]);
      const modifiedClips = newClipKeys.filter(k => oldClips[k] && JSON.stringify(oldClips[k]) !== JSON.stringify(newClips[k]));

      if (addedClips.length > 0) diffDetails.push(`+${addedClips.length} clips`);
      if (removedClips.length > 0) diffDetails.push(`-${removedClips.length} clips`);
      if (modifiedClips.length > 0) diffDetails.push(`updated ${modifiedClips.length} clips`);

      // If data is identical, return current version without duplicating history
      if (diffDetails.length === 0 && JSON.stringify(latestTimeline.settings) === JSON.stringify(timelineData.settings)) {
        ok(res, {
          success: true,
          version_id: latestVersion?.version_id || 'ver_current',
          version_number: latestVersion?.version_number || 1,
          updated_at: latestVersion?.created_at || new Date().toISOString(),
          no_changes: true,
        }, 'Timeline data is already up to date');
        return;
      }
    }

    const effectiveSummary = changeSummary || (diffDetails.length > 0 ? diffDetails.join(', ') : 'Timeline update');
    const userObject = {
      id: user.id || 'usr_default',
      name: user.name || 'Studio Editor',
      avatar: user.avatar,
    };

    // 3. Save new Timeline version & snapshot history
    const result = await db.saveTimeline(episodeId, timelineData, userObject, effectiveSummary);

    ok(res, {
      success: true,
      version_id: result.version_id,
      version_number: result.version_number,
      updated_at: result.updated_at,
      change_summary: effectiveSummary,
      diff: diffDetails,
    }, 'Timeline saved successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// GET /api/episodes/:episodeId/timeline/history
episodesRouter.get('/:episodeId/timeline/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Unauthorized');
      return;
    }
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = await getDatabaseProvider();
    const historyData = await db.getTimelineHistory(episodeId, limit, offset);
    ok(res, historyData);
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// GET /api/episodes/:episodeId/timeline/history/:versionId (Zero-Render Preview)
episodesRouter.get('/:episodeId/timeline/history/:versionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const versionId = req.params.versionId as string;
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Unauthorized');
      return;
    }

    const db = await getDatabaseProvider();
    const versionData = await db.getTimelineVersion(episodeId, versionId);

    if (!versionData) {
      fail(res, 404, 'Version snapshot not found');
      return;
    }

    ok(res, versionData, 'Historical snapshot loaded for zero-render preview');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// POST /api/episodes/:episodeId/timeline/restore
episodesRouter.post('/:episodeId/timeline/restore', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const { versionId, reason, author } = req.body;
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Unauthorized');
      return;
    }

    if (!versionId) {
      fail(res, 400, 'versionId is required for restore');
      return;
    }

    const authorObj = author || { id: 'usr_default', name: 'Editor Alpha' };
    const db = await getDatabaseProvider();
    const restoreResult = await db.restoreTimelineVersion(episodeId, versionId, authorObj, reason || 'Restored version');

    ok(res, restoreResult, 'Timeline version successfully restored');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

// DELETE /api/episodes/:episodeId
episodesRouter.delete('/:episodeId', async (req: Request, res: Response): Promise<void> => {
  try {
    const episodeId = req.params.episodeId as string;
    const userId = getUserId(req);
    if (!userId) {
      fail(res, 401, 'Unauthorized');
      return;
    }

    const db = await getDatabaseProvider();
    const episode = await db.getEpisodeById(episodeId);
    if (!episode) {
      fail(res, 404, 'Episode not found');
      return;
    }

    // 1. Purge cloud storage files and asset files for this episode BEFORE deleting database records
    try {
      const storage = await StorageFactory.getActiveAdapter();

      // Delete individual asset files associated with this episode
      const epAssets = await db.getAssets({ episode_id: episodeId });
      for (const a of epAssets) {
        const keys = extractStorageKeysFromAsset(a);
        for (const k of keys) {
          await storage.deleteFile(k);
        }
      }

      // Delete episode storage folder
      await storage.deleteFolder(`episodes/${episodeId}`);

      Logger.info(`[EpisodeDelete] Successfully purged cloud assets for episode "${episodeId}".`);
    } catch (storageErr: any) {
      Logger.warn(`[EpisodeDelete] Cloud storage asset purge warning: ${storageErr.message}`);
    }

    // 2. Cascade delete episode, timelines, versions, chat_messages, pipeline_jobs
    await db.deleteEpisode(episodeId);

    ok(res, { deleted: true, episodeId }, 'Episode and all associated history/assets deleted successfully');
  } catch (err: any) {
    fail(res, 500, err.message || 'Internal server error');
  }
});

export default router;
