import { core } from '@/utils/project';
import { generateCaptionClips } from '@/utils/caption-generator';
import { pickCaptionKeywords } from '@/utils/caption-keywords';

export type WordsPerLineMode = 'single' | 'multiple';

interface RegenerateCaptionClipsOptions {
  captionClip: any;
  mode?: WordsPerLineMode;
  fontSize?: number;
  fontFamily?: string;
  fontUrl?: string;
  styleUpdate?: any;
}

const CUSTOM_ANIMATIONS_CAPTIONS = [
  'charTypewriter',
  'scaleMidCaption',
  'scaleDownCaption',
  'upDownCaption',
  'upLeftCaption',
  'fadeByWord',
  'slideFadeByWord',
];

export async function regenerateCaptionClips({
  captionClip,
  mode = 'multiple',
  fontSize,
  fontFamily,
  fontUrl,
  styleUpdate,
}: RegenerateCaptionClipsOptions) {
  if (!captionClip) return;

  const state = core.store.getState();
  const clips = { ...(state.clips || {}) };
  const tracks = [ ...(state.tracks || []) ];
  const settings = state.settings || { width: 1080, height: 1920 };
  const videoWidth = settings.width || 1080;
  const videoHeight = settings.height || 1920;

  const mediaId = captionClip.mediaId || captionClip.opts?.mediaId || captionClip.id;

  // 1. Collect all sibling caption clips for this scene / voice track
  const siblingClips: any[] = Object.values(clips).filter(
    (c: any) =>
      c &&
      c.type === 'Caption' &&
      ((c.mediaId && c.mediaId === mediaId) ||
       (c.opts?.mediaId && c.opts.mediaId === mediaId) ||
       c.id === captionClip.id)
  );

  siblingClips.sort((a, b) => (a.display?.from || 0) - (b.display?.from || 0));
  if (siblingClips.length === 0) return;

  // 2. Aggregate all word timestamps in absolute seconds
  const firstClipStartUs = siblingClips[0].display?.from || 0;
  const allWords: any[] = [];

  siblingClips.forEach((c) => {
    const clipStartUs = c.display?.from || 0;
    const words = c.caption?.words || c.words || [];
    words.forEach((w: any) => {
      const divisor = (w.from > 10000 || w.to > 10000) ? 1000 : 1;
      const wFromMs = Math.round((w.from || 0) / divisor);
      const wToMs = Math.round((w.to || (wFromMs + 300)) / divisor);
      allWords.push({
        word: w.text || w.word || '',
        text: w.text || w.word || '',
        start: (clipStartUs + wFromMs * 1000) / 1_000_000,
        end: (clipStartUs + wToMs * 1000) / 1_000_000,
        isKeyWord: w.isKeyWord ?? false,
        paragraphIndex: w.paragraphIndex ?? 0,
      });
    });
  });

  if (allWords.length === 0 && captionClip.text) {
    const durUs = captionClip.duration || 4_000_000;
    const wordsList = captionClip.text.split(' ');
    const stepUs = Math.round(durUs / wordsList.length);
    const keywordFlags = pickCaptionKeywords(wordsList);
    wordsList.forEach((w: string, idx: number) => {
      allWords.push({
        word: w,
        text: w,
        start: (firstClipStartUs + idx * stepUs) / 1_000_000,
        end: (firstClipStartUs + (idx + 1) * stepUs) / 1_000_000,
        isKeyWord: keywordFlags[idx],
        paragraphIndex: 0,
      });
    });
  }

  // 3. Generate new OpenVideo formatted caption clips
  const activeStyle = {
    ...(captionClip.style || {}),
    ...(styleUpdate || {}),
  };

  const newClips = await generateCaptionClips({
    videoWidth,
    videoHeight,
    words: allWords,
    fontSize: fontSize || activeStyle.fontSize || 44,
    fontFamily: fontFamily || activeStyle.fontFamily || 'Bangers-Regular',
    fontUrl,
    mode,
    style: activeStyle,
  });

  // 4. Find caption track and remove old sibling clips
  const captionTrack = tracks.find((t: any) => t.type === 'Caption' || t.id === 'track_captions_main');
  const siblingIds = new Set(siblingClips.map((c) => c.id));

  if (captionTrack) {
    captionTrack.clipIds = captionTrack.clipIds.filter((id: string) => !siblingIds.has(id));
  }
  siblingIds.forEach((id) => {
    delete clips[id];
  });

  // 5. Insert newly generated caption clips
  newClips.forEach((nc, idx) => {
    const newId = `clip_cap_reg_${Date.now()}_${idx + 1}`;
    nc.id = newId;
    nc.mediaId = mediaId;
    if (captionTrack && !captionTrack.clipIds.includes(newId)) {
      captionTrack.clipIds.push(newId);
    }
    clips[newId] = nc;
  });

  // 6. Update OpenVideo Core store state
  core.store.setState({ ...state, clips, tracks });
  return newClips;
}
