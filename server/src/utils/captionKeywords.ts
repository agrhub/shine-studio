/**
 * Picks the words a caption line should emphasise (rendered in the caption's
 * keyword colour). A line gets at most one keyword, or two when it is long,
 * and only when a word clearly carries the meaning: numbers and amounts,
 * shouted (ALL CAPS) or exclaimed words, names, strong emotional words, or
 * long content words. Function words (en / vi) are never picked.
 *
 * Kept identical in client/src/utils/caption-keywords.ts — change both.
 */

const STOPWORDS = new Set(
  (
    // English
    'a an the and or but if so of to in on at by for from with as into onto about over under ' +
    'is am are was were be been being do does did have has had will would shall should can could may might must ' +
    'i me my mine you your yours he him his she her hers it its we us our they them their ' +
    'this that these those there here what which who whom whose when where why how ' +
    'not no yes just very really too also only then than up down out off again ' +
    "i'm you're it's don't can't won't let's that's ok okay oh uh um yeah " +
    // Vietnamese (syllable-level function words)
    'và là của có không được cho với thì mà này đó kia các những một hai cái người ' +
    'tôi tao mày bạn anh em chị ông bà nó họ chúng ta mình ' +
    'đã đang sẽ rồi vẫn cũng lại nữa đi ra vào lên xuống ở tại trong ngoài trên dưới ' +
    'thế vậy sao gì nào đâu ai khi nếu nhưng hay hoặc vì nên để bị à ạ ơi nhé nhỉ ừ'
  ).split(/\s+/)
);

const STRONG_WORDS = new Set(
  (
    'never always love hate kill dead die death danger secret truth lie lies betray betrayed revenge ' +
    'help stop run now forever impossible million billion free win lose lost gone everything nothing ' +
    // Vietnamese, syllable by syllable
    'yêu ghét chết giết nguy hiểm mật thật dối phản bội thù cứu dừng chạy ngay mãi triệu tỷ mất hết'
  ).split(/\s+/)
);

const EDGE_PUNCT = /^[\s"'“”‘’«»()[\]{}.,;:!?…—–-]+|[\s"'“”‘’«»()[\]{}.,;:!?…—–-]+$/g;

/** Emphasis score for one word; 0 means it must not be emphasised. */
export function keywordScore(raw: string, positionInLine: number): number {
  const text = String(raw || '').trim();
  const core = text.replace(EDGE_PUNCT, '');
  if (!core) return 0;
  const lower = core.toLocaleLowerCase();
  if (STOPWORDS.has(lower)) return 0;

  let score = 0;
  if (/\d/.test(core) || /[$€£¥₫%]/.test(text)) score += 5;
  if (core.length >= 2 && core === core.toLocaleUpperCase() && core !== lower) score += 4;
  if (/[!！]/.test(text)) score += 2;
  if (STRONG_WORDS.has(lower)) score += 3;
  // Capitalised mid-line: most likely a name.
  if (positionInLine > 0 && core[0] !== core[0].toLocaleLowerCase() && core.slice(1) === core.slice(1).toLocaleLowerCase()) score += 2;
  // Longer content words carry more meaning (CJK characters count double).
  const visualLength = [...core].reduce((n, ch) => n + (/[぀-ヿ㐀-鿿가-힯]/.test(ch) ? 2 : 1), 0);
  score += Math.min(visualLength, 12) / 4;
  return score;
}

const MIN_SCORE = 2;

/** Returns one flag per word: true for the words to emphasise in this line. */
export function pickCaptionKeywords(words: string[]): boolean[] {
  const flags = words.map(() => false);
  if (words.length === 0) return flags;
  const minScore = words.length === 1 ? 4 : MIN_SCORE; // a lone word needs a strong reason
  const ranked = words
    .map((w, i) => ({ i, score: keywordScore(w, i) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const max = words.length >= 6 ? 2 : 1;
  for (const r of ranked.slice(0, max)) flags[r.i] = true;
  return flags;
}
