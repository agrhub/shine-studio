import type { SceneEntity } from '@/types.js';

/**
 * Pre-generation quality gate for an episode's storyboard.
 *
 * Scores the shot plan before any Veo video is generated, so weak plans are
 * fixed while they are still cheap (text) rather than after paying for video.
 * The approach follows OpenMontage's "slideshow risk" and variation checks
 * (re-implemented here for micro-drama shots): every dimension is 0-5, lower is
 * better, and the average maps to a verdict:
 *   < 2 strong · < 3 acceptable · < 4 revise · >= 4 fail (do not generate)
 */

export type QualityVerdict = 'strong' | 'acceptable' | 'revise' | 'fail';

export interface DimensionScore {
  score: number;
  reason: string;
}

export interface StoryboardQualityReport {
  average: number;
  verdict: QualityVerdict;
  dimensions: Record<
    'repetition' | 'weak_motion' | 'weak_shot_intent' | 'generic_prompts' | 'dialogue_density' | 'missing_frames',
    DimensionScore
  >;
  scene_issues: Array<{ scene: number; issues: string[] }>;
  suggestions: string[];
}

const GENERIC_PHRASES = [
  'stunning', 'beautiful', 'amazing', 'breathtaking', 'epic', 'masterpiece', 'high quality',
  'highly detailed', 'ultra detailed', 'cinematic shot', '4k', '8k', 'hdr', 'a person', 'a man',
  'a woman', 'someone', 'awesome', 'incredible', 'best quality', 'photorealistic',
];

const STATIC_MOVES = ['', 'none', 'static', 'still', 'locked', 'locked-off', 'fixed', 'no movement'];
const DEFAULT_MOVE = 'slow push-in';

const SHOT_SIZES: Array<[string, RegExp]> = [
  ['extreme close-up', /\b(extreme close[- ]?up|ecu|macro)\b/i],
  ['close-up', /\b(close[- ]?up|cu|tight shot|insert)\b/i],
  ['medium close-up', /\b(medium close[- ]?up|mcu|chest[- ]up)\b/i],
  ['medium', /\b(medium shot|mid[- ]shot|waist[- ]up|ms)\b/i],
  ['over-the-shoulder', /\b(over[- ]the[- ]shoulder|ots)\b/i],
  ['wide', /\b(wide shot|establishing|long shot|full shot|ws|ls)\b/i],
  ['pov', /\b(pov|point[- ]of[- ]view)\b/i],
];

// Comfortable spoken Vietnamese/English pace for dubbed micro-drama lines.
const MAX_WORDS_PER_SECOND = 3.2;

const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));
const norm = (s: unknown) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

export function inferShotSize(scene: Pick<SceneEntity, 'visual_prompt' | 'camera_movement' | 'frame_description'>): string | null {
  const text = `${scene.camera_movement || ''} ${scene.visual_prompt || ''} ${scene.frame_description || ''}`;
  for (const [size, re] of SHOT_SIZES) if (re.test(text)) return size;
  return null;
}

function longestRun(values: string[]): number {
  let best = 0;
  let run = 0;
  values.forEach((v, i) => {
    run = i > 0 && v && v === values[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

function dominantShare(values: string[]): number {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const max = Math.max(0, ...counts.values());
  return values.length ? max / values.length : 0;
}

export function verdictFor(average: number): QualityVerdict {
  if (average < 2) return 'strong';
  if (average < 3) return 'acceptable';
  if (average < 4) return 'revise';
  return 'fail';
}

export function scoreStoryboard(scenes: SceneEntity[]): StoryboardQualityReport {
  const issues = new Map<number, string[]>();
  const note = (scene: SceneEntity, msg: string) => {
    const key = scene.index ?? scene.scene_number ?? 0;
    issues.set(key, [...(issues.get(key) || []), msg]);
  };

  if (!scenes.length) {
    const empty = { score: 5, reason: 'The episode has no scenes.' };
    return {
      average: 5,
      verdict: 'fail',
      dimensions: { repetition: empty, weak_motion: empty, weak_shot_intent: empty, generic_prompts: empty, dialogue_density: empty, missing_frames: empty },
      scene_issues: [],
      suggestions: ['Generate the screenplay and storyboard before creating video.'],
    };
  }

  const n = scenes.length;
  const moves = scenes.map((s) => norm(s.camera_movement));
  const sizes = scenes.map((s) => inferShotSize(s) || '');

  // 1. Repetition: same camera move / shot size back-to-back, or one move dominating.
  const moveRun = longestRun(moves);
  const sizeRun = longestRun(sizes);
  const moveShare = dominantShare(moves);
  const repetitionScore = clamp(Math.max(0, moveRun - 2) * 1.2 + Math.max(0, sizeRun - 2) * 0.8 + (n >= 4 ? Math.max(0, moveShare - 0.5) * 6 : 0));
  scenes.forEach((s, i) => {
    if (i > 0 && moves[i] && moves[i] === moves[i - 1]) note(s, `Same camera movement as the previous shot ("${s.camera_movement}")`);
  });

  // 2. Weak motion: static/default moves or no on-screen action (Veo clips need motion).
  let weakMotion = 0;
  scenes.forEach((s, i) => {
    const isStatic = STATIC_MOVES.includes(moves[i]);
    const isDefault = moves[i] === DEFAULT_MOVE;
    const noAction = norm(s.action).length < 8;
    if (isStatic) note(s, 'No camera movement');
    if (noAction) note(s, 'No on-screen action described');
    weakMotion += (isStatic ? 1 : isDefault ? 0.5 : 0) + (noAction ? 0.7 : 0);
  });
  const weakMotionScore = clamp((weakMotion / n) * 3.3);

  // 3. Weak shot intent: no recognisable shot size, or a thin visual prompt.
  let weakIntent = 0;
  scenes.forEach((s, i) => {
    const thin = norm(s.visual_prompt).length < 60;
    if (!sizes[i]) note(s, 'Shot size is not specified (close-up, medium, wide...)');
    if (thin) note(s, 'Visual prompt is too short to direct the shot');
    weakIntent += (sizes[i] ? 0 : 1) + (thin ? 1 : 0);
  });
  const weakIntentScore = clamp((weakIntent / (2 * n)) * 5);

  // 4. Generic prompt language.
  let genericHits = 0;
  scenes.forEach((s) => {
    const text = norm(s.visual_prompt);
    const hits = GENERIC_PHRASES.filter((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
    if (hits.length >= 2) note(s, `Generic wording: ${hits.slice(0, 4).join(', ')}`);
    genericHits += hits.length;
  });
  const genericScore = clamp((genericHits / n) * 1.25);

  // 5. Dialogue density: more words than fit in the clip duration.
  let overfull = 0;
  scenes.forEach((s) => {
    const words = (s.dialogue || []).reduce((a, d: any) => a + String(d?.line || d?.text || '').split(/\s+/).filter(Boolean).length, 0);
    const seconds = Number(s.duration_seconds) || 8;
    const wps = words / seconds;
    if (wps > MAX_WORDS_PER_SECOND) {
      overfull++;
      note(s, `Dialogue too long for ${seconds}s (${words} words, ~${wps.toFixed(1)} words/s)`);
    }
  });
  const dialogueScore = clamp((overfull / n) * 5);

  // 6. Missing storyboard frames (image-to-video needs a start frame).
  const missing = scenes.filter((s) => !s.storyboard_frame_url);
  missing.forEach((s) => note(s, 'No storyboard start frame'));
  const missingScore = clamp((missing.length / n) * 5);

  const dimensions: StoryboardQualityReport['dimensions'] = {
    repetition: { score: repetitionScore, reason: `Longest repeated camera move: ${moveRun} shots; dominant move used in ${Math.round(moveShare * 100)}% of shots.` },
    weak_motion: { score: weakMotionScore, reason: 'Share of static/default camera moves and shots without action.' },
    weak_shot_intent: { score: weakIntentScore, reason: `${sizes.filter((x) => !x).length}/${n} shots have no shot size; thin prompts counted.` },
    generic_prompts: { score: genericScore, reason: `${genericHits} generic phrases across ${n} prompts.` },
    dialogue_density: { score: dialogueScore, reason: `${overfull}/${n} shots have more dialogue than fits the clip.` },
    missing_frames: { score: missingScore, reason: `${missing.length}/${n} shots have no storyboard frame.` },
  };
  const average = Math.round((Object.values(dimensions).reduce((a, d) => a + d.score, 0) / 6) * 100) / 100;

  const suggestions: string[] = [];
  if (repetitionScore >= 2.5) suggestions.push('Vary camera movement and shot size between consecutive shots (e.g. wide → close-up → over-the-shoulder).');
  if (weakMotionScore >= 2.5) suggestions.push('Give every shot a motivated camera move and a concrete on-screen action.');
  if (weakIntentScore >= 2.5) suggestions.push('State the shot size and subject in each visual prompt.');
  if (genericScore >= 2.5) suggestions.push('Replace generic adjectives with specific lighting, lens, wardrobe and blocking details.');
  if (dialogueScore >= 2.5) suggestions.push('Split long dialogue across more shots or lengthen those shots.');
  if (missingScore > 0) suggestions.push('Generate the missing storyboard frames (step B2) before video.');

  return {
    average,
    verdict: verdictFor(average),
    dimensions,
    scene_issues: [...issues.entries()].sort((a, b) => a[0] - b[0]).map(([scene, list]) => ({ scene, issues: list })),
    suggestions,
  };
}

/** Gate mode from STORYBOARD_GATE: "block" (default) stops on fail, "warn" only logs, "off" skips. */
export function storyboardGateMode(): 'block' | 'warn' | 'off' {
  const v = String(process.env.STORYBOARD_GATE || 'block').toLowerCase();
  return v === 'warn' || v === 'off' ? v : 'block';
}
