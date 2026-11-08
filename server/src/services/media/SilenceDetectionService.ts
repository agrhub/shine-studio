import ffmpeg from 'fluent-ffmpeg';
import { resolveFfmpegPath } from '@/services/media/ffmpegPath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { nanoid } from 'nanoid';
import { Logger } from '@/utils/logger.js';

// Ported from AntStudio (server/src/services/ai/SilenceDetectionService.ts).
// Fixes vs. the original: the temp file is no longer deleted while FFmpeg is
// still reading it, and the media duration is parsed from FFmpeg's own output
// instead of a racing ffprobe call.

ffmpeg.setFfmpegPath(resolveFfmpegPath());

export interface TimeRange {
  start: number;
  end: number;
}

export interface SilenceAnalysis {
  duration: number;
  silences: TimeRange[];
  /** Complement of `silences` within [0, duration]. */
  active: TimeRange[];
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const SILENCE_START_RE = /silence_start:\s*(-?[\d.]+)/;
const SILENCE_END_RE = /silence_end:\s*([\d.]+)/;

/** Runs FFmpeg `silencedetect` on a file and returns silent + active ranges (seconds). */
export async function analyzeSilence(
  filePath: string,
  opts: { noiseDb?: number; minSilenceSec?: number } = {}
): Promise<SilenceAnalysis> {
  const noiseDb = opts.noiseDb ?? -30;
  const minSilenceSec = opts.minSilenceSec ?? 0.35;

  return new Promise((resolve, reject) => {
    const silences: TimeRange[] = [];
    let pendingStart: number | null = null;
    let duration = 0;

    ffmpeg(filePath)
      .noVideo()
      .audioFilters(`silencedetect=n=${noiseDb}dB:d=${minSilenceSec}`)
      .format('null')
      .on('stderr', (line: string) => {
        const d = line.match(DURATION_RE);
        if (d && !duration) duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
        const s = line.match(SILENCE_START_RE);
        if (s) pendingStart = Math.max(0, Number(s[1]));
        const e = line.match(SILENCE_END_RE);
        if (e && pendingStart !== null) {
          silences.push({ start: pendingStart, end: Number(e[1]) });
          pendingStart = null;
        }
      })
      .on('error', (err: Error) => reject(err))
      .on('end', () => {
        // Trailing silence that runs to the end of the file has no silence_end line.
        if (pendingStart !== null && duration > pendingStart) silences.push({ start: pendingStart, end: duration });

        const active: TimeRange[] = [];
        let cursor = 0;
        for (const s of silences) {
          if (s.start > cursor) active.push({ start: cursor, end: s.start });
          cursor = Math.max(cursor, s.end);
        }
        if (duration > cursor) active.push({ start: cursor, end: duration });
        resolve({ duration, silences, active });
      })
      .save(os.platform() === 'win32' ? 'NUL' : '/dev/null');
  });
}

/** Same as analyzeSilence but for in-memory media; manages the temp file. */
export async function analyzeSilenceBuffer(
  buffer: Buffer,
  ext = 'mp4',
  opts?: { noiseDb?: number; minSilenceSec?: number }
): Promise<SilenceAnalysis> {
  const tempPath = path.join(os.tmpdir(), `shine-silence-${nanoid(8)}.${ext}`);
  await fs.promises.writeFile(tempPath, buffer);
  try {
    return await analyzeSilence(tempPath, opts);
  } finally {
    fs.promises.unlink(tempPath).catch(() => Logger.warn(`[SilenceDetection] Could not remove ${tempPath}`));
  }
}

/**
 * Moves a cut point to the middle of the nearest silence within `windowSec`,
 * so cuts land between lines of dialogue instead of mid-word.
 */
export function snapToSilence(time: number, silences: TimeRange[], windowSec = 1.5): number {
  let best = time;
  let bestDist = Infinity;
  for (const s of silences) {
    if (time >= s.start && time <= s.end) return (s.start + s.end) / 2;
    const mid = (s.start + s.end) / 2;
    const dist = Math.abs(mid - time);
    if (dist <= windowSec && dist < bestDist) {
      best = mid;
      bestDist = dist;
    }
  }
  return best;
}
