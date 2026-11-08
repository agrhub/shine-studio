import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';
const { scoreStoryboard, inferShotSize, verdictFor, storyboardGateMode } = await import('../src/services/StoryboardQualityService.js');

const scene = (i: number, o: Record<string, any>) => ({
  index: i, scene_number: i, duration_seconds: 8, storyboard_frame_url: `/f/${i}.png`, dialogue: [], ...o,
}) as any;

const strong = [
  scene(1, { camera_movement: 'Slow dolly in', action: 'Lan slams the contract on the desk',
    visual_prompt: 'Wide establishing shot of a glass boardroom at dusk, cold blue rim light, Lan in a crimson suit standing at the head of the table' }),
  scene(2, { camera_movement: 'Handheld push', action: 'Minh flinches and grips his pen',
    visual_prompt: 'Close-up on Minh, sweat on his temple, shallow depth of field, warm tungsten key light from the left', dialogue: [{ character: 'Minh', line: 'You signed it?' }] }),
  scene(3, { camera_movement: 'Whip pan', action: 'Lan turns toward the window',
    visual_prompt: 'Over-the-shoulder from Minh toward Lan, city lights reflected in the glass, 50mm lens', dialogue: [{ character: 'Lan', line: 'Three years ago. You just never read it.' }] }),
  scene(4, { camera_movement: 'Slow crane down', action: 'The door opens and the chairman walks in',
    visual_prompt: 'Medium shot of the doorway, chairman silhouetted by corridor light, everyone rises from the table' }),
];

const weak = [1, 2, 3, 4, 5].map((i) =>
  scene(i, {
    camera_movement: 'static', action: '',
    visual_prompt: 'A stunning cinematic shot of a person, 4k masterpiece',
    storyboard_frame_url: i % 2 ? undefined : '/f.png',
    dialogue: [{ character: 'A', line: 'word '.repeat(40) }],
  })
);

test('a directed storyboard passes', () => {
  const r = scoreStoryboard(strong);
  assert.ok(['strong', 'acceptable'].includes(r.verdict), `${r.verdict} ${r.average}`);
  assert.ok(r.average < 2, `average ${r.average}`);
});

test('a repetitive, static, generic storyboard fails with actionable issues', () => {
  const r = scoreStoryboard(weak);
  assert.equal(r.verdict, 'fail', `average ${r.average}`);
  assert.ok(r.dimensions.repetition.score >= 4);
  assert.ok(r.dimensions.weak_motion.score >= 4);
  assert.ok(r.dimensions.generic_prompts.score >= 4);
  assert.equal(r.dimensions.dialogue_density.score, 5);
  assert.ok(r.dimensions.missing_frames.score > 0);
  const s1 = r.scene_issues.find((s) => s.scene === 1)!.issues.join(' | ');
  assert.match(s1, /No camera movement/);
  assert.match(s1, /Generic wording/);
  assert.match(s1, /Dialogue too long/);
  assert.match(s1, /No storyboard start frame/);
  assert.ok(r.suggestions.length >= 4);
});

test('helpers: shot size inference, verdict thresholds, empty plan, gate mode', () => {
  assert.equal(inferShotSize({ visual_prompt: 'Extreme close-up of her eyes', camera_movement: '', frame_description: '' } as any), 'extreme close-up');
  assert.equal(inferShotSize({ visual_prompt: 'OTS from the doctor', camera_movement: '', frame_description: '' } as any), 'over-the-shoulder');
  assert.equal(inferShotSize({ visual_prompt: 'Lan walks in', camera_movement: 'pan', frame_description: '' } as any), null);
  assert.deepEqual([1.9, 2.5, 3.5, 4].map(verdictFor), ['strong', 'acceptable', 'revise', 'fail']);
  assert.equal(scoreStoryboard([]).verdict, 'fail');
  delete process.env.STORYBOARD_GATE;
  assert.equal(storyboardGateMode(), 'block');
  process.env.STORYBOARD_GATE = 'warn';
  assert.equal(storyboardGateMode(), 'warn');
  delete process.env.STORYBOARD_GATE;
});
