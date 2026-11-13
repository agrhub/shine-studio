/**
 * Pure timeline edits on OpenVideo core clips (times in microseconds).
 * No imports, so the maths can be unit-tested without the editor engine.
 */

interface ClipTimingLike {
  display: { from: number; to: number };
  trim?: { from: number; to: number };
  duration?: number;
  playbackRate?: number;
  [key: string]: any;
}

export interface ClipLike {
  id: string;
  type: string;
  name?: string;
  src?: string;
  locked?: boolean;
  volume?: number;
  timing?: ClipTimingLike;
  display?: { from: number; to: number };
  trim?: { from: number; to: number };
  duration?: number;
  playbackRate?: number;
  [key: string]: any;
}

function timingOf(clip: ClipLike): ClipTimingLike | null {
  const display = clip.timing?.display || clip.display;
  if (!display) return null;
  return {
    ...(clip.timing || {}),
    display: { ...display },
    trim: clip.timing?.trim || clip.trim || { from: 0, to: 0 },
    duration: clip.timing?.duration ?? clip.duration ?? display.to - display.from,
    playbackRate: clip.timing?.playbackRate || clip.playbackRate || 1,
  };
}

/**
 * Cuts a clip at `timeUs` and keeps one side: "left" drops everything after
 * the playhead, "right" drops everything before it. The clip keeps its id and
 * its place on the timeline. Returns the timing update, or null when the
 * playhead is not inside the clip or the clip is locked.
 */
export function trimClipAtTime(clip: ClipLike, timeUs: number, keep: 'left' | 'right'): { timing: ClipTimingLike } | null {
  if (!clip || clip.locked) return null;
  const timing = timingOf(clip);
  if (!timing) return null;
  const { from, to } = timing.display;
  if (!(timeUs > from && timeUs < to)) return null;

  const offset = timeUs - from;
  const sourceOffset = offset * (timing.playbackRate || 1);
  const trim = timing.trim!;

  if (keep === 'left') {
    return {
      timing: {
        ...timing,
        display: { from, to: timeUs },
        duration: offset,
        trim: { ...trim, to: trim.from + sourceOffset },
      },
    };
  }
  return {
    timing: {
      ...timing,
      display: { from: timeUs, to },
      duration: (timing.duration ?? to - from) - offset,
      trim: { ...trim, from: trim.from + sourceOffset },
    },
  };
}

/**
 * The audio clip that "Separate audio" adds for a video clip: same source,
 * same place and trim, same volume. Null for anything that is not a video
 * with a source.
 */
export function separatedAudioClip(clip: ClipLike): { type: 'Audio'; name: string; src: string; volume: number; timing: ClipTimingLike; metadata: Record<string, any> } | null {
  if (!clip || clip.type !== 'Video' || !clip.src || clip.locked) return null;
  const timing = timingOf(clip);
  if (!timing) return null;
  return {
    type: 'Audio',
    name: `${clip.name || 'Video'} (audio)`,
    src: clip.src,
    volume: clip.volume ?? 1,
    timing,
    metadata: { ...(clip.metadata || {}), separatedFrom: clip.id },
  };
}
