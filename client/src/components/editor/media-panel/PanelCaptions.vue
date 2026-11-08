<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from 'vue';
import { fontManager, Log } from '@openvideo/engine-pixi';
import { generateCaptionClips } from '@/utils/caption-generator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Play, Trash2 } from 'lucide-vue-next';
import { core } from '@/utils/project';
import http from '@/utils/http';

// Reactive snapshot of core store clips
const coreClips = shallowRef<Record<string, any>>(core.store.getState().clips);
const unsubscribeCore = core.store.subscribe((state) => {
  coreClips.value = state.clips;
});
onUnmounted(() => unsubscribeCore());

const mediaItems = computed(() => {
  return Object.values(coreClips.value).filter(
    (clip: any) => clip.type === 'Video' || clip.type === 'Audio'
  );
});

const captionItems = computed(() => {
  return Object.values(coreClips.value)
    .filter((clip: any) => clip.type === 'Caption')
    .sort((a: any, b: any) => a.timing.display.from - b.timing.display.from);
});

const isGenerating = ref(false);
const activeCaptionId = ref<string | null>(null);

const captionItemsRef = computed(() => captionItems.value);
const activeCaptionIdRef = computed(() => activeCaptionId.value);

// Format time utility
const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const hh = h > 0 ? `${h.toString().padStart(2, '0')}:` : '';
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');

  return `${hh}${mm}:${ss}`;
};

// Listen for time updates from core
onMounted(() => {
  const handleTimeUpdate = (currentTimeUs: number) => {
    const currentTimeMs = currentTimeUs; // timeupdate yields microseconds
    const activeItem = captionItemsRef.value.find(
      (item) => currentTimeMs >= (item.timing?.display?.from || 0) && currentTimeMs < (item.timing?.display?.to || 0)
    );

    const newActiveId = activeItem ? activeItem.id : null;
    if (newActiveId !== activeCaptionIdRef.value) {
      activeCaptionId.value = newActiveId;
    }
  };

  core.on('timeupdate', handleTimeUpdate);

  onUnmounted(() => {
    core.off('timeupdate', handleTimeUpdate);
  });
});

const handleGenerateCaptions = async () => {
  if (mediaItems.value.length === 0) return;

  isGenerating.value = true;
  try {
    const fontName = 'Bangers-Regular';
    const fontUrl = 'https://fonts.gstatic.com/s/poppins/v15/pxiByp8kv8JHgFVrLCz7V1tvFP-KUEg.ttf';

    await fontManager.addFont({
      name: fontName,
      url: fontUrl,
    });

    const clipsToAdd: any[] = [];

    for (const mediaClip of mediaItems.value) {
      try {
        const audioUrl = mediaClip.src;
        if (!audioUrl) continue;

        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: audioUrl, model: 'nova-3' }),
        });

        if (!transcribeResponse.ok) {
          Log.error(`Transcription failed for media ${mediaClip.id}`);
          continue;
        }

        const transcriptionData = await transcribeResponse.json();
        if (!transcriptionData) continue;

        const words = transcriptionData.results?.channels?.[0]?.alternatives?.[0]?.words || transcriptionData.results?.main?.words || transcriptionData.words || [];

        console.log("words", words);

        const settings = core.store.getState().settings;
        const captionClipsJSON = await generateCaptionClips({
          videoWidth: settings.width,
          videoHeight: settings.height,
          words,
        });

        console.log("captionClipsJSON", captionClipsJSON);

        for (const json of captionClipsJSON) {
          const enrichedJson = {
            ...json,
            mediaId: mediaClip.id,
            metadata: {
              ...json.metadata,
              sourceClipId: mediaClip.id,
            },
            timing: {
              display: {
                from: json.timing.display.from + (mediaClip.display?.from || mediaClip.timing?.display?.from || 0),
                to: json.timing.display.to + (mediaClip.display?.from || mediaClip.timing?.display?.from || 0),
              },
            },
          };
          clipsToAdd.push(enrichedJson);
          console.log("enrichedJson", enrichedJson);
        }
      } catch (error) {
        Log.error(`Failed to process media ${mediaClip.id}:`, error);
      }
    }

    const trackId = 'track_' + crypto.randomUUID().slice(0, 8);
    const settings = core.store.getState().settings;
    const captionTrackConfig = {
      captions: {
        style: {
          fontSize: 80,
          fontFamily: fontName,
          fontWeight: '700',
          fontStyle: 'normal',
          color: '#ffffff',
          align: 'center',
          fontUrl: fontUrl,
          stroke: { color: '#000000', width: 4 },
          shadow: { color: '#000000', alpha: 0.5, blur: 4, offsetX: 2, offsetY: 2 },
        },
        colors: {
          active: { color: '#ffffff', background: '#FF5700' },
          future: { color: '#ffffff' },
          keyword: { color: '#FFD400', preserveAfterSpoken: true },
        },
        positioning: {
          videoWidth: settings.width,
          videoHeight: settings.height,
        },
        wordsPerLine: 'multiple' as const,
      },
    };

    console.log("captionTrackConfig", captionTrackConfig);

    const trackCommand = {
      id: crypto.randomUUID(),
      type: 'track.add',
      payload: { id: trackId, name: 'Captions', type: 'caption', index: 0, config: captionTrackConfig },
    };

    if (clipsToAdd.length > 0) {
      const fullClips = await Promise.all(clipsToAdd.map((c) => core.clip.prepare(c as any)));
      console.log("fullClips", fullClips);

      const addCommands = fullClips.map((clip) => ({
        id: crypto.randomUUID(),
        type: 'clip.add',
        payload: { clip, trackId },
      }));

      core.batch([trackCommand, ...addCommands] as any[]);
    } else {
      core.execute(trackCommand as any);
    }

    const projectData = core.project.export();
    const jsonString = JSON.stringify(projectData, null, 2);
    console.log("handleGenerateCaptions", jsonString);
  } catch (error) {
    Log.error('Failed to generate captions:', error);
  } finally {
    isGenerating.value = false;
  }
};

const normalizeWordTimings = (words: any[]) => {
  let currentTime = 0;
  return words.map((word) => {
    const duration = word.to - word.from;
    const newWord = {
      ...word,
      from: currentTime,
      to: currentTime + duration,
    };
    currentTime += duration;
    return newWord;
  });
};

const handleSplitCaption = async (id: string, cursorPosition: number, fullText: string) => {
  const state = core.store.getState();
  const clip = state.clips[id];
  if (!clip) return;

  const track = state.tracks.find((t) => t.clipIds.includes(id));
  if (!track) return;
  const trackId = track.id;

  const wordsInText: { text: string; start: number; end: number }[] = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    wordsInText.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  let splitWordIndex = -1;
  for (let i = 0; i < wordsInText.length; i++) {
    const w = wordsInText[i];
    if (cursorPosition <= w.start || cursorPosition < w.end) {
      splitWordIndex = i;
      break;
    }
  }

  if (splitWordIndex <= 0) return;

  const part1Text = wordsInText
    .slice(0, splitWordIndex)
    .map((w) => w.text)
    .join(' ');
  const part2Text = wordsInText
    .slice(splitWordIndex)
    .map((w) => w.text)
    .join(' ');

  const clipJson = (clip as any).toJSON ? (clip as any).toJSON() : { ...clip };
  const caption = clipJson.caption || {};
  const words = caption.words || [];

  const part1Words = words.slice(0, splitWordIndex);
  const part2Words = words.slice(splitWordIndex);

  if (part1Words.length === 0 || part2Words.length === 0) return;
  const lastWordPart1 = part1Words[part1Words.length - 1];

  const clip1Json = {
    ...clipJson,
    id: undefined,
    text: part1Text,
    width: 0,
    height: 0,
    wordWrapWidth: 0,
    caption: {
      ...caption,
      words: part1Words,
    },
    timing: {
      display: {
        from: clipJson.timing.display.from,
        to: lastWordPart1.to * 1000 + clipJson.timing.display.from,
      },
      duration: lastWordPart1.to * 1000,
    },
  };

  const clip2Json = {
    ...clipJson,
    id: undefined,
    text: part2Text,
    width: 0,
    height: 0,
    wordWrapWidth: 0,
    caption: {
      ...caption,
      words: normalizeWordTimings(part2Words),
    },
    timing: {
      display: {
        from: lastWordPart1.to * 1000 + clipJson.timing.display.from,
        to: clipJson.timing.display.to,
      },
      duration: clipJson.timing.display.to - lastWordPart1.to * 1000 - clipJson.timing.display.from,
    },
  };

  try {
    for (const c of [clip1Json, clip2Json]) {
      await core.clip.add(c as any, { trackId });
    }
    core.clip.remove([id]);
  } catch (error) {
    Log.error('Failed to split caption clip:', error);
  }
};

const handleUpdateCaption = async (id: string, text: string, fullUpdate = false) => {
  const state = core.store.getState();
  const clip = state.clips[id];
  if (!clip) return;

  const track = state.tracks.find((t) => t.clipIds.includes(id));
  if (!track) return;

  if (!fullUpdate) {
    const captionClip = clip as any;
    captionClip.text = text;
    captionClip.emit('propsChange', { text });
    return;
  }

  const newWordsText = text.trim().split(/\s+/).filter(Boolean);
  const clipJson = (clip as any).toJSON ? (clip as any).toJSON() : { ...clip };
  const caption = clipJson.caption || {};
  const oldWords = caption.words || [];
  const paragraphIndex = oldWords[0]?.paragraphIndex ?? '';

  const isNewWordAdded = newWordsText.length > oldWords.length;
  let updatedWords;

  if (isNewWordAdded) {
    const totalDurationMs = (clipJson.timing.display.to - clipJson.timing.display.from) / 1000;
    const totalChars = newWordsText.reduce((acc: number, w: string) => acc + w.length, 0);
    const durationPerChar = totalChars > 0 ? totalDurationMs / totalChars : 0;

    let currentShift = 0;
    updatedWords = newWordsText.map((wordText: string, index: number) => {
      const wordDuration = wordText.length * durationPerChar;
      const word = {
        ...(oldWords[index] || { isKeyWord: false, paragraphIndex }),
        text: wordText,
        from: currentShift,
        to: currentShift + wordDuration,
      };
      currentShift += wordDuration;
      return word;
    });
  } else {
    updatedWords = newWordsText.map((wordText: string, index: number) => {
      if (oldWords[index]) {
        return {
          ...oldWords[index],
          text: wordText,
        };
      }
      return {
        text: wordText,
        from: 0,
        to: 0,
        isKeyWord: false,
      };
    });
  }

  const newClipJson = {
    ...clipJson,
    text,
    caption: {
      ...caption,
      words: updatedWords,
    },
    id: undefined,
  };

  try {
    await core.clip.add(newClipJson as any, { trackId: track.id });
    core.clip.remove([id]);
  } catch (error) {
    Log.error('Failed to update caption clip:', error);
  }
};

const handleDeleteCaption = (id: string) => {
  core.clip.remove([id]);
};

const handleSeek = (time: number) => {
  core.seek(time);
};

const handleKeyDown = (e: KeyboardEvent, item: any, currentText: string) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const target = e.target as HTMLTextAreaElement;
    const cursorPosition = target.selectionStart || 0;
    handleSplitCaption(item.id, cursorPosition, currentText);
  }
};
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex flex-1 flex-col gap-4 overflow-hidden min-w-0">
      <div v-if="mediaItems.length === 0" class="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground p-8">
        Add video or audio to the timeline to generate captions.
      </div>
      
      <div v-else-if="captionItems.length > 0" class="flex-1 overflow-hidden">
        <ScrollArea class="h-full px-4">
          <div class="flex flex-col gap-2 pb-4">
            <div
              v-for="item in captionItems"
              :key="item.id"
              class="group relative flex flex-col gap-2 rounded-md p-3 transition-colors border-l-2"
              :class="item.id === activeCaptionId ? 'bg-zinc-700/10 border-zinc-300 border' : 'hover:bg-zinc-700/10 border'"
            >
              <div class="flex items-center justify-between">
                <div
                  class="text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-white transition-colors"
                  @click="handleSeek(item.timing?.display?.from || 0)"
                >
                  {{ formatTime((item.timing?.display?.from || 0) / 1_000_000) }} - {{ formatTime((item.timing?.display?.to || 0) / 1_000_000) }}
                </div>

                <div
                  class="flex items-center gap-1 opacity-0 transition-opacity"
                  :class="{ 'opacity-100': item.id === activeCaptionId || 'group-hover:opacity-100' }"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5 text-muted-foreground hover:text-white"
                    @click.stop="handleSeek(item.timing?.display?.from || 0)"
                  >
                    <Play class="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5 text-muted-foreground hover:text-red-400"
                    @click.stop="handleDeleteCaption(item.id)"
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <Textarea
                :model-value="item.text"
                @update:model-value="(val) => handleUpdateCaption(item.id, String(val), false)"
                @blur="(e: any) => handleUpdateCaption(item.id, e.target.value, true)"
                @keydown="(e: any) => handleKeyDown(e, item, e.target.value)"
                class="min-h-[20px] p-0 resize-none border-none focus-visible:ring-0 bg-transparent text-sm leading-relaxed text-zinc-300 focus:text-white placeholder:text-zinc-600 shadow-none"
                :rows="Math.max(1, Math.ceil((item.text?.length || 0) / 40))"
              />
            </div>
          </div>
        </ScrollArea>
      </div>

      <div v-else class="flex flex-col gap-6 p-4 py-6 items-center text-center">
        <div class="text-sm text-muted-foreground">
          Recognize speech in the selected media and generate captions automatically.
        </div>
        <Button
          @click="handleGenerateCaptions"
          variant="default"
          class="w-full"
          :disabled="isGenerating"
        >
          <template v-if="isGenerating">
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </template>
          <template v-else>
            Generate Captions
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>
