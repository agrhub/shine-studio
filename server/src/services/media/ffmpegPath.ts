import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';

/**
 * FFmpeg binary to use: FFMPEG_PATH override, then the bundled ffmpeg-static
 * binary (absent when installed with --ignore-scripts), then `ffmpeg` on PATH.
 */
export function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = ffmpegStatic as unknown as string | null;
  if (bundled && fs.existsSync(bundled)) return bundled;
  return 'ffmpeg';
}
