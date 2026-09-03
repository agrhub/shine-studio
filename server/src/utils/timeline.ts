import type { IProject } from '@/types.js';

/**
 * Utility to unwrap and normalize timeline structures to the pure IProject shape
 * { settings, tracks, clips } preventing any nested wrapper pollution.
 */
export function normalizePureTimeline(input: any): IProject {
  if (!input) {
    return {
      settings: { 
        width: 1080, 
        height: 1920, 
        fps: 30, 
        backgroundColor: '#000000',
        duration: 0
      },
      tracks: [],
      clips: {},
    };
  }

  let parsed = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return input; } })() : input;

  // Recursively unwrap nested wrappers like { timeline_data: ... } or { timelineData: ... }
  while (parsed && typeof parsed === 'object') {
    if (parsed.timeline_data && typeof parsed.timeline_data === 'object' && (parsed.timeline_data.tracks || parsed.timeline_data.clips || parsed.timeline_data.settings)) {
      parsed = parsed.timeline_data;
    } else if (parsed.timelineData && typeof parsed.timelineData === 'object' && (parsed.timelineData.tracks || parsed.timelineData.clips || parsed.timelineData.settings)) {
      parsed = parsed.timelineData;
    } else {
      break;
    }
  }

  const canvasWidth = Number(parsed.settings?.width) || 1080;
  const canvasHeight = Number(parsed.settings?.height) || 1920;

  const settings = {
    width: canvasWidth,
    height: canvasHeight,
    fps: Number(parsed.settings?.fps) || 30,
    backgroundColor: parsed.settings?.backgroundColor || '#000000',
    artboardColor: parsed.settings?.artboardColor || parsed.settings?.backgroundColor || '#000000',
    ...(parsed.settings || {}),
  };

  const rawTracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  const seenTrackIds = new Set<string>();
  const tracks: any[] = [];
  for (const t of rawTracks) {
    if (t && t.id && !seenTrackIds.has(t.id)) {
      seenTrackIds.add(t.id);
      tracks.push({
        ...t,
        clipIds: Array.isArray(t.clipIds) ? Array.from(new Set(t.clipIds)) : [],
      });
    }
  }

  const clips = (parsed.clips && typeof parsed.clips === 'object' && !Array.isArray(parsed.clips)) ? parsed.clips : {};

  return {
    settings,
    tracks,
    clips,
  };
}
