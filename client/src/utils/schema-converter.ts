import { fontManager } from '@openvideo/engine-pixi';
import { pickCaptionKeywords } from './caption-keywords';

/**
 * Fetches caption data from a URL
 */
export const fetchCaptionData = async (url: string): Promise<any> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch caption data: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching caption data:', error);
    return null;
  }
};

/**
 * Groups words by width using canvas text measurement
 * Words are accumulated until the text width exceeds maxWidth, then a new caption is created
 */
export const groupWordsByWidth = (
  words: any[],
  maxWidth: number = 800,
  fontSize: number = 80,
  fontFamily: string = 'Bangers-Regular'
): any[] => {
  if (!words || words.length === 0) return [];

  // Create canvas for text measurement
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.font = `${fontSize}px ${fontFamily}`;

  const captions: any[] = [];
  let currentWords: any[] = [];
  let currentText = '';
  let currentWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordText = word.word || word.text || '';

    // Calculate width if we add this word
    const testText = currentText ? `${currentText} ${wordText}` : wordText;
    const testWidth = ctx.measureText(testText).width;

    if ((testWidth > maxWidth || currentWords.length >= 5) && currentWords.length > 0) {
      // Width exceeded, create caption with current words
      const firstWord = currentWords[0];
      const lastWord = currentWords[currentWords.length - 1];

      // Measure actual height of the text
      const metrics = ctx.measureText('AaFfLMZpPqQ');
      const textHeight =
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

      const keywordFlags = pickCaptionKeywords(currentWords.map((w) => w.word || w.text || ''));
      captions.push({
        text: currentText,
        width: currentWidth, // Actual measured width
        height: textHeight || fontSize, // Actual measured height, fallback to fontSize
        words: currentWords.map((w, idx) => ({
          text: w.word || w.text || '',
          from: idx === 0 ? 0 : (w.start - firstWord.start) * 1000, // Relative to caption start in ms
          to: (w.end - firstWord.start) * 1000, // Relative to caption start in ms
          isKeyWord: keywordFlags[idx],
          paragraphIndex: w.paragraphIndex ?? '',
        })),
        from: firstWord.start, // In seconds
        to: lastWord.end, // In seconds
      });
      // Start new caption with current word
      currentWords = [word];
      currentText = wordText;
      currentWidth = ctx.measureText(wordText).width;
    } else {
      // Add word to current caption
      currentWords.push(word);
      currentText = testText;
      currentWidth = testWidth;
    }
  }

  // Add remaining words as final caption
  if (currentWords.length > 0) {
    const firstWord = currentWords[0];
    const lastWord = currentWords[currentWords.length - 1];

    // Measure actual height of the text
    const metrics = ctx.measureText('AaFfLMZpPqQ');
    const textHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    const keywordFlags = pickCaptionKeywords(currentWords.map((w) => w.word || w.text || ''));
    captions.push({
      text: currentText,
      width: currentWidth, // Actual measured width
      height: textHeight || fontSize, // Actual measured height, fallback to fontSize
      words: currentWords.map((w, idx) => ({
        text: w.word || w.text || '',
        from: idx === 0 ? 0 : (w.start - firstWord.start) * 1000,
        to: (w.end - firstWord.start) * 1000,
        isKeyWord: keywordFlags[idx],
        paragraphIndex: w.paragraphIndex ?? '',
      })),
      from: firstWord.start,
      to: lastWord.end,
    });
  }

  return captions;
};
