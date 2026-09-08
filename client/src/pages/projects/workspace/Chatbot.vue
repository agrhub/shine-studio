<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { toast } from 'vue-sonner';
import http from '@/utils/http';
import { Bot } from 'lucide-vue-next';
import ChatContentRenderer from './ChatContentRenderer.vue';
import UserMessageRenderer from './UserMessageRenderer.vue';
import AssetLivePreviewGrid from './AssetLivePreviewGrid.vue';

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

interface ToolCallState {
  id?: string;
  name: string;
  args: any;
  status: 'running' | 'success' | 'error';
  result?: any;
  retries?: number;
}

interface ProgressState {
  step: string;
  item: string;
  current: number;
  total: number;
  message: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallState[];
}

const activeProgress = ref<ProgressState | null>(null);

const messages = ref<Message[]>([
  {
    id: 'welcome',
    role: 'assistant',
    content: t(
      'chatbot.welcomeMessage',
      `👋 **Hello! I am Shine AI Production Copilot.**\nI have loaded the full context of the active episode. You can ask me to:\n- 🚀 **Run the Full Pipeline** automatically\n- 👗 **Generate all Character Wardrobe Variants**\n- 🎬 **Generate Storyboard frames** for each scene\n- 🎥 **Generate Image-to-Video clips**\n- 🎙️ **Generate TTS Voiceover & Background Music (BGM)**\n- 📊 **Check Episode status & progress**`
    ),
    timestamp: Date.now(),
  },
]);

const inputPrompt = ref('');
const isStreaming = ref(false);
const isProgressCollapsed = ref(false);
const chatContainer = ref<HTMLElement | null>(null);

const route = useRoute();
const activeEpisode = computed(() => seriesStore.activeEpisode as any);
const seriesId = computed(() => (route?.params?.id as string) || seriesStore.currentSeries?.id || '');
const episodeId = computed(() => activeEpisode.value?.id || '1');

const lastLoadedSeriesId = ref<string | null>(null);
const isLoadingHistory = ref(false);

async function loadHistory(force = false) {
  const targetId = seriesId.value || seriesStore.currentSeries?.id;
  if (!targetId) return;
  if (!force && targetId === lastLoadedSeriesId.value) return;
  if (isLoadingHistory.value) return;

  isLoadingHistory.value = true;
  try {
    const res: any = await http.get(`/ai/agentic/history/${targetId}`);
    lastLoadedSeriesId.value = targetId;
    let historyList: any[] = [];
    if (res?.data?.messages && Array.isArray(res.data.messages)) {
      historyList = res.data.messages;
    } else if (Array.isArray(res?.data)) {
      historyList = res.data;
    } else if (Array.isArray(res?.messages)) {
      historyList = res.messages;
    } else if (Array.isArray((seriesStore.currentSeries as any)?.chat_history) && (seriesStore.currentSeries as any).chat_history.length > 0) {
      historyList = (seriesStore.currentSeries as any).chat_history;
    }

    if (historyList.length > 0) {
      messages.value = historyList.map((m: any) => ({
        id: m.id || `msg_${Date.now()}`,
        role: m.role || 'assistant',
        content: m.content || m.text || '',
        timestamp: m.timestamp || Date.now(),
        toolCalls: (m.toolCalls || [])
          .filter((tc: any, idx: number, arr: any[]) => arr.findIndex((t: any) => t.name === tc.name && (t.status === 'success' || JSON.stringify(t.args) === JSON.stringify(tc.args))) === idx)
          .map((tc: any) => tc.status === 'running' ? { ...tc, status: 'success' } : tc),
        suggestions: m.suggestions || [],
      }));

      // Restore dynamic suggestions from the last assistant message in history
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const msg = messages.value[i];
        if (msg.role === 'assistant') {
          if (Array.isArray((msg as any).suggestions) && (msg as any).suggestions.length > 0) {
            dynamicSuggestions.value = (msg as any).suggestions;
            break;
          }
          const suggestionsMatch = msg.content.match(/```(?:suggestions|json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
          if (suggestionsMatch) {
            try {
              const parsed = JSON.parse(suggestionsMatch[1]);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dynamicSuggestions.value = parsed.filter((p: any) => p.label && p.prompt);
                break;
              }
            } catch {}
          }
        }
      }

      scrollToBottom();
    }
  } catch (err) {
    console.warn('[Chatbot] Could not load agentic history:', err);
    if (Array.isArray((seriesStore.currentSeries as any)?.chat_history) && (seriesStore.currentSeries as any).chat_history.length > 0) {
      messages.value = (seriesStore.currentSeries as any).chat_history.map((m: any) => ({
        id: m.id || `msg_${Date.now()}`,
        role: m.role || 'assistant',
        content: m.content || m.text || '',
        timestamp: m.timestamp || Date.now(),
        toolCalls: (m.toolCalls || [])
          .filter((tc: any, idx: number, arr: any[]) => arr.findIndex((t: any) => t.name === tc.name && (t.status === 'success' || JSON.stringify(t.args) === JSON.stringify(tc.args))) === idx)
          .map((tc: any) => tc.status === 'running' ? { ...tc, status: 'success' } : tc),
        suggestions: m.suggestions || [],
      }));
      scrollToBottom();
    }
  } finally {
    isLoadingHistory.value = false;
  }
}

watch(
  () => seriesId.value || seriesStore.currentSeries?.id,
  (newId) => {
    if (newId) loadHistory();
  },
  { immediate: true }
);

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

// ─── Dynamic Contextual & Initial Suggestion Chips ───────────────────────────
const dynamicSuggestions = ref<Array<{ label: string; prompt: string }>>([]);

const hasUnrenderedCharacters = computed(() => {
  const chars = (seriesStore.charactersList?.length ? seriesStore.charactersList : activeEpisode.value?.characters) || [];
  return chars.length > 0 && chars.some((c: any) => !c.avatar);
});

const quickChips = computed(() => {
  const chips: Array<{ label: string; prompt: string }> = [
    {
      label: t('chatbot.chipFullPipeline', '🚀 Full Pipeline'),
      prompt: t('chatbot.promptFullPipeline', 'Run the complete production pipeline for this episode'),
    },
  ];

  if (hasUnrenderedCharacters.value) {
    chips.push({
      label: t('chatbot.chipCharacters', '🎨 Render Characters'),
      prompt: t('chatbot.promptCharacters', 'Generate portraits and character sheets for all characters to lock facial consistency'),
    });
  } else {
    chips.push({
      label: t('chatbot.chipWardrobes', '👗 Render Wardrobes'),
      prompt: t('chatbot.promptWardrobes', 'Generate all character wardrobe variants that are missing images'),
    });
  }

  chips.push(
    {
      label: t('chatbot.chipStoryboard', '🎬 Render Storyboard'),
      prompt: t('chatbot.promptStoryboard', 'Generate storyboard image frames for all scenes'),
    },
    {
      label: t('chatbot.chipVideos', '🎥 Render Video AI'),
      prompt: t('chatbot.promptVideos', 'Generate Image-to-Video clips for all scenes'),
    },
    {
      label: t('chatbot.chipVoiceovers', '🎙️ TTS Voiceovers'),
      prompt: t('chatbot.promptVoiceovers', 'Generate voiceover audio and sync subtitles for all dialogue scenes'),
    },
    {
      label: t('chatbot.chipCaptions', '📝 Translate & Subtitles'),
      prompt: t('chatbot.promptCaptions', 'Translate dialogue and generate word-level synced captions'),
    },
    {
      label: t('chatbot.chipLocationsProps', '🏛️ Locations & Props'),
      prompt: t('chatbot.promptLocationsProps', 'Generate location concept frames and key prop asset sheets'),
    },
    {
      label: t('chatbot.chipRenderEpisode', '🎞️ Render Episode Video'),
      prompt: t('chatbot.promptRenderEpisode', 'Render the final 9:16 composite video for this episode'),
    },
    {
      label: t('chatbot.chipStatus', '📊 Episode Status'),
      prompt: t('chatbot.promptStatus', 'Check the status of all assets and scenes for this episode'),
    }
  );

  return chips;
});

const activeChips = computed(() => {
  if (dynamicSuggestions.value.length > 0) {
    return dynamicSuggestions.value;
  }
  return quickChips.value;
});

// ─── '@' Mention Objects Autocomplete System ──────────────────────────────────
interface MentionItem {
  id: string;
  category: 'Series' | 'Episode' | 'Character' | 'Location' | 'Prop' | 'Scene' | 'Voice' | 'Caption' | 'Video';
  name: string;
  detail?: string;
  icon: string;
  tagColor?: string;
}

const showMentionDropdown = ref(false);
const mentionQuery = ref('');
const selectedMentionIndex = ref(0);
const inputRef = ref<any>(null);

const mentionItems = computed<MentionItem[]>(() => {
  const items: MentionItem[] = [];

  // Series & Episode
  if (seriesStore.currentSeries?.title) {
    items.push({
      id: 'mention_series',
      category: 'Series',
      name: seriesStore.currentSeries.title,
      detail: `${seriesStore.currentSeries.genre || 'Drama'} • ${seriesStore.currentSeries.visual_style || 'Cinematic'}`,
      icon: 'Film',
      tagColor: 'primary',
    });
  }
  if (activeEpisode.value?.title) {
    items.push({
      id: 'mention_episode',
      category: 'Episode',
      name: activeEpisode.value.title,
      detail: `Episode #${activeEpisode.value.episode_number || 1}`,
      icon: 'VideoPlay',
      tagColor: 'success',
    });
  }

  // Characters
  const chars = (seriesStore.charactersList?.length ? seriesStore.charactersList : activeEpisode.value?.characters) || [];
  chars.forEach((c: any) => {
    items.push({
      id: `char_${c.name}`,
      category: 'Character',
      name: c.name,
      detail: c.role || c.physical_characteristics?.slice(0, 40) || 'Character',
      icon: 'User',
      tagColor: 'warning',
    });
  });

  // Locations
  const locs = (activeEpisode.value?.locations || seriesStore.currentSeries?.locations) || [];
  locs.forEach((l: any) => {
    items.push({
      id: `loc_${l.name}`,
      category: 'Location',
      name: l.name,
      detail: l.physical_characteristics?.slice(0, 40) || 'Location',
      icon: 'Location',
      tagColor: 'info',
    });
  });

  // Props
  const prps = (activeEpisode.value?.props || seriesStore.currentSeries?.props) || [];
  prps.forEach((p: any) => {
    items.push({
      id: `prop_${p.name}`,
      category: 'Prop',
      name: p.name,
      detail: p.physical_characteristics?.slice(0, 40) || 'Prop item',
      icon: 'Box',
      tagColor: 'danger',
    });
  });

  // Scenes
  const scs = activeEpisode.value?.scenes || seriesStore.activeScript?.scenes || [];
  scs.forEach((s: any) => {
    const idx = s.index;
    items.push({
      id: `scene_${idx}`,
      category: 'Scene',
      name: `Scene ${idx}`,
      detail: s.setting || (s.dialogue?.[0]?.line || s.dialogue || '').slice(0, 30) || `${s.duration_seconds || s.durationSeconds || 6}s`,
      icon: 'Camera',
      tagColor: 'primary',
    });
  });

  // Voiceover & Captions
  items.push({
    id: 'mention_voice',
    category: 'Voice',
    name: 'Voiceover & Dubbing',
    detail: 'TTS Audio & Character voice styles',
    icon: 'Microphone',
    tagColor: 'warning',
  });
  items.push({
    id: 'mention_caption',
    category: 'Caption',
    name: 'Subtitles & Captions',
    detail: 'Word-by-word synced subtitle cues',
    icon: 'ChatDotRound',
    tagColor: 'success',
  });
  items.push({
    id: 'mention_video',
    category: 'Video',
    name: 'Image-to-Video Engine',
    detail: '9:16 vertical AI video clips',
    icon: 'VideoCamera',
    tagColor: 'info',
  });

  return items;
});

const filteredMentions = computed(() => {
  const q = mentionQuery.value.toLowerCase().trim();
  if (!q) return mentionItems.value;
  return mentionItems.value.filter(
    item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.detail && item.detail.toLowerCase().includes(q))
  );
});

function handleInputChange(e: any) {
  const text = inputPrompt.value;
  const cursor = (e?.target?.selectionStart ?? text.length) as number;
  const beforeCursor = text.slice(0, cursor);
  const lastAt = beforeCursor.lastIndexOf('@');

  if (lastAt !== -1 && (lastAt === 0 || /\s/.test(beforeCursor[lastAt - 1]))) {
    const query = beforeCursor.slice(lastAt + 1);
    if (!/\s/.test(query)) {
      mentionQuery.value = query;
      showMentionDropdown.value = true;
      selectedMentionIndex.value = 0;
      return;
    }
  }
  showMentionDropdown.value = false;
}

function handleInputKeydown(evt: any) {
  const e = evt as KeyboardEvent;
  if (showMentionDropdown.value && filteredMentions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % filteredMentions.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedMentionIndex.value = (selectedMentionIndex.value - 1 + filteredMentions.value.length) % filteredMentions.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = filteredMentions.value[selectedMentionIndex.value];
      if (selected) {
        insertMention(selected);
      }
      return;
    }
    if (e.key === 'Escape') {
      showMentionDropdown.value = false;
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function insertMention(item: MentionItem) {
  const text = inputPrompt.value;
  const lastAt = text.lastIndexOf('@');
  const mentionText = `@[${item.category}: ${item.name}] `;

  if (lastAt !== -1) {
    inputPrompt.value = text.slice(0, lastAt) + mentionText;
  } else {
    inputPrompt.value = (text ? text + ' ' : '') + mentionText;
  }

  showMentionDropdown.value = false;
  nextTick(() => {
    inputRef.value?.focus();
  });
}

function toggleMentionList() {
  mentionQuery.value = '';
  showMentionDropdown.value = !showMentionDropdown.value;
  selectedMentionIndex.value = 0;
}

function formatToolActionName(name: string): string {
  const map: Record<string, string> = {
    generate_character_asset: '🎨 Generating Character Sheet',
    generate_location_asset: '🏛️ Generating Location Concept',
    generate_prop_asset: '📦 Generating Prop Asset',
    generate_scene_storyboard: '🎬 Drawing Storyboard Frame',
    generate_scene_video: '🎥 Rendering AI Video Clip',
    generate_scene_voiceover: '🎙️ Generating TTS Voiceover',
    run_pipeline_step: '⚡ Executing Pipeline Step',
    run_full_pipeline: '🚀 Running Full Production Pipeline',
    render_episode_video: '🎞️ Rendering Episode Composite Video',
    analyze_scene_timeline: '🔍 Analyzing Scene Timeline',
    split_scene: '✂️ Splitting Scene',
    merge_scenes: '🔗 Merging Scenes',
    delete_scene: '🗑️ Deleting Scene',
    reorder_scenes: '🔄 Reordering Scenes',
  };
  return map[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function sendMessage(customText?: string) {
  const text = (customText || inputPrompt.value).trim();
  if (!text || isStreaming.value) return;

  if (!seriesId.value || !episodeId.value) {
    toast.error(t('chatbot.noActiveEpisode', 'Please select an episode before chatting'));
    return;
  }

  const userMsgId = `usr_${Date.now()}`;
  messages.value.push({
    id: userMsgId,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  });

  inputPrompt.value = '';
  scrollToBottom();

  const assistantMsgId = `asst_${Date.now()}`;
  const assistantMsg = ref<Message>({
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    toolCalls: [],
  });

  messages.value.push(assistantMsg.value);
  isStreaming.value = true;
  let hasPendingWorkspaceSync = false;
  scrollToBottom();

  let lastIndex = 0;
  try {
    await http.post(
      '/ai/agentic/stream',
      {
        session_id: seriesId.value ? `${seriesId.value}_${episodeId.value || 'main'}` : undefined,
        series_id: seriesId.value,
        episode_id: episodeId.value,
        message: text,
      },
      {
        timeout: 0, // Disables the timeout for this request
        responseType: 'text',
        onDownloadProgress: (progressEvent: any) => {
          const rawText = progressEvent.event?.target?.responseText || progressEvent.event?.target?.response || progressEvent.currentTarget?.response || '';
          const newChunk = rawText.slice(lastIndex);
          lastIndex = rawText.length;

          const lines = newChunk.split('\n\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            let eventType = 'message';
            const eventMatch = line.match(/^event:\s*(.+)$/m);
            if (eventMatch) eventType = eventMatch[1].trim();

            const dataMatch = line.match(/^data:\s*([\s\S]+)$/m);
            if (dataMatch) {
              try {
                const parsed = JSON.parse(dataMatch[1].trim());
                if (eventType === 'chunk') {
                  assistantMsg.value.content += (parsed?.text || '');
                  scrollToBottom();
                } else if (eventType === 'step_progress') {
                  activeProgress.value = parsed;
                  pipelineStore.setActiveProgress(parsed);
                  scrollToBottom();
                } else if (eventType === 'suggestions') {
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    dynamicSuggestions.value = parsed;
                  }
                } else if (eventType === 'tool_call') {
                  if (!assistantMsg.value.toolCalls) assistantMsg.value.toolCalls = [];
                  const existing = assistantMsg.value.toolCalls.find(
                    (tc) => (parsed.id && tc.id === parsed.id) ||
                            (tc.name === parsed.name && (
                              tc.status === 'running' ||
                              !parsed.args ||
                              (tc.args?.characterName && tc.args?.characterName === parsed.args?.characterName) ||
                              (tc.args?.sceneIndex !== undefined && tc.args?.sceneIndex === parsed.args?.sceneIndex) ||
                              (tc.args?.locationName && tc.args?.locationName === parsed.args?.locationName) ||
                              (tc.args?.propName && tc.args?.propName === parsed.args?.propName) ||
                              JSON.stringify(tc.args) === JSON.stringify(parsed.args)
                            ))
                  );
                  if (existing) {
                    existing.status = parsed.status;
                    existing.result = parsed.result;
                    if (parsed.args) existing.args = { ...existing.args, ...parsed.args };
                  } else {
                    assistantMsg.value.toolCalls.push({ ...parsed });
                  }
                  scrollToBottom();
                } else if (eventType === 'item_updated' || eventType === 'series_updated') {
                  // Mark pending sync to update workspace in 1 batch once streaming finishes
                  hasPendingWorkspaceSync = true;
                  // if (seriesId.value && episodeId.value) {
                  //   seriesStore.loadEpisodeScript(seriesId.value, episodeId.value);
                  // }
                  // if (typeof window !== 'undefined') {
                  //   window.dispatchEvent(new CustomEvent('pipeline-asset-updated', { detail: parsed }));
                  // }
                }
              } catch {}
            }
          }
        },
      }
    );
  } catch (err: any) {
    assistantMsg.value.content += `\n\n❌ **Error:** ${err.message || t('chatbot.errorConnecting', 'Failed to connect to Copilot')}`;
    toast.error(err.message || t('chatbot.errorConnecting', 'Failed to connect to Copilot'));
  } finally {
    // Perform single batch synchronization with workspace once stream completes
    if (hasPendingWorkspaceSync) {
      hasPendingWorkspaceSync = false;
      try {
        if (seriesId.value && episodeId.value) {
          await seriesStore.loadEpisodeScript(seriesId.value, episodeId.value);
        }
        if (seriesId.value) {
          await seriesStore.loadWorkspaceData(seriesId.value);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pipeline-asset-updated', { detail: { batch: true } }));
        }
      } catch (syncErr) {
        console.warn('[Chatbot] Batch sync error:', syncErr);
      }
    }
    if (assistantMsg.value) {
      assistantMsg.value.content = assistantMsg.value.content
        .replace(/```(?:suggestions|json)?\s*\[\s*\{[\s\S]*?\}\s*\]\s*```/gi, '')
        .replace(/```suggestions[\s\S]*?```/gi, '')
        .trim();
    }
    isStreaming.value = false;
    activeProgress.value = null;
    pipelineStore.setActiveProgress(null);
    scrollToBottom();
  }
}

function clearChat() {
  messages.value = [
    {
      id: 'welcome_cleared',
      role: 'assistant',
      content: t('chatbot.clearedMessage', '🧹 Chat history cleared. How can I assist you with your production?'),
      timestamp: Date.now(),
    },
  ];
}

function handleTriggerAction(event: Event) {
  const customEvent = event as CustomEvent;
  if (customEvent.detail?.prompt) {
    sendMessage(customEvent.detail.prompt);
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('trigger-chatbot-action', handleTriggerAction);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('trigger-chatbot-action', handleTriggerAction);
  }
});

defineExpose({
  sendMessage,
});
</script>

<template>
  <div class="flex flex-col h-full space-y-3.5">
    <!-- Header Banner -->
    <div class="p-3.5 rounded-2xl border flex items-center justify-between shadow-soft" style="background: linear-gradient(135deg, rgba(62, 207, 142, 0.1) 0%, rgba(14, 165, 233, 0.08) 100%); border-color: var(--el-border-color);">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-tr from-emerald-500 to-sky-500 text-white shadow-md">
          <el-icon :size="16"><Bot /></el-icon>
        </div>
        <div>
          <div class="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-text-color-primary);">
            <span>{{ t('chatbot.title', 'Shine Agent') }}</span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p class="text-[10px]" style="color: var(--el-text-color-secondary);">
            {{ activeEpisode?.title || t('chatbot.noActiveEpisode', 'No Episode Active') }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <el-button circle plain size="small" icon="Delete" @click="clearChat" :title="t('chatbot.clearChat', 'Clear chat')" />
        <!-- <el-button circle plain size="small" icon="Close" @click="$emit('close')" :title="t('chatbot.close', 'Close')" /> -->
      </div>
    </div>

    <!-- Pipeline Steps Progress & Quick Action Card -->
    <div class="p-2.5 rounded-xl border shadow-soft transition-all duration-300" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color);">
      <!-- Header with Toggle Button -->
      <div
        class="flex items-center justify-between text-[10px] font-black uppercase tracking-wider cursor-pointer select-none"
        :class="{ 'mb-2': !isProgressCollapsed }"
        style="color: var(--el-text-color-secondary);"
        @click="isProgressCollapsed = !isProgressCollapsed"
        :title="isProgressCollapsed ? t('common.expand', 'Expand') : t('common.collapse', 'Collapse')"
      >
        <div class="flex items-center gap-1.5">
          <span>{{ t('chatbot.pipelineStatus', 'Pipeline Progress') }}</span>
          <el-tag size="small" effect="plain" round class="!text-[9px] !px-1.5 font-mono">
            {{ pipelineStore.pipelineSteps.filter(s => s.status === 'done').length }}/{{ pipelineStore.pipelineSteps.length }}
          </el-tag>
        </div>
        <div class="flex items-center gap-1">
          <el-button
            link
            size="small"
            class="!p-0"
            :icon="isProgressCollapsed ? 'ArrowDown' : 'ArrowUp'"
          />
        </div>
      </div>

      <!-- Collapsible Body (Grid + Chips) -->
      <div v-show="!isProgressCollapsed" class="space-y-2 pt-0.5">
        <div class="flex gap-1">
          <div
            v-for="step in pipelineStore.pipelineSteps"
            :key="step.id"
            :title="`${step.label}: ${step.status}`"
            class="flex-1 h-2 rounded-full cursor-pointer transition-all hover:scale-105"
            :style="step.status === 'done'
              ? 'background-color: var(--el-color-primary);'
              : step.status === 'running'
              ? 'background-color: #0ea5e9;'
              : step.status === 'error'
              ? 'background-color: #ef4444;'
              : 'background-color: var(--el-border-color);'"
            @click="sendMessage(`Run pipeline step ${step.id}: ${step.label}`)"
          ></div>
        </div>
      </div>
    </div>

    <!-- Chat Messages Stream Container -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto space-y-3.5 pr-1 custom-scrollbar h-auto">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex flex-col gap-1.5"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <!-- Role Label & Avatar -->
        <div class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1" style="color: var(--el-text-color-secondary);">
          <el-icon v-if="msg.role === 'assistant'"><Cpu /></el-icon>
          <el-icon v-else><User /></el-icon>
          <span>{{ msg.role === 'assistant' ? t('chatbot.agentRole', 'Shine Agent') : t('chatbot.userRole', 'You') }}</span>
        </div>

        <!-- 1. AI Reasoning / Thinking & Action Process (Collapsible Modern Accordion - PLACED FIRST ABOVE RESPONSE) -->
        <details
          v-if="msg.toolCalls && msg.toolCalls.length > 0"
          class="w-full group text-xs select-none"
        >
          <summary class="flex items-center justify-between px-3 py-1.5 rounded-xl border cursor-pointer transition-all hover:opacity-90 list-none" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-lighter);">
            <div class="flex items-center gap-2">
              <el-icon class="text-xs text-primary"><Cpu /></el-icon>
              <span class="font-medium text-[11px]" style="color: var(--el-text-color-secondary);">
                {{ t('chatbot.thoughtProcess', 'Thought & Execution Process') }} ({{ msg.toolCalls.length }} {{ t('chatbot.actions', 'actions') }})
              </span>
            </div>
            <div class="flex items-center gap-1 text-[10px] opacity-70">
              <span class="group-open:hidden">▼ {{ t('common.show') }}</span>
              <span class="hidden group-open:inline">▲ {{ t('common.hide') }}</span>
            </div>
          </summary>

          <div class="p-2 space-y-2 mt-1 rounded-xl border border-dashed" style="border-color: var(--el-border-color); background-color: var(--el-bg-color-page)">
            <div
              v-for="(tc, idx) in msg.toolCalls"
              :key="idx"
              class="p-2 rounded-lg border flex flex-col gap-1 text-[11px]"
              :style="tc.status === 'success'
                ? 'background-color: rgba(62, 207, 142, 0.05); border-color: rgba(62, 207, 142, 0.2);'
                : (tc.status === 'running'
                  ? 'background-color: rgba(14, 165, 233, 0.05); border-color: rgba(14, 165, 233, 0.2);'
                  : 'background-color: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2);')"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5 font-medium">
                  <el-icon v-if="tc.status === 'running'" class="animate-spin" style="color: #0ea5e9;"><Loading /></el-icon>
                  <el-icon v-else-if="tc.status === 'success'" style="color: var(--el-color-primary);"><Check /></el-icon>
                  <el-icon v-else style="color: #ef4444;"><Close /></el-icon>
                  <span>{{ formatToolActionName(tc.name) }}</span>
                </div>
                <el-tag
                  size="small"
                  round
                  :type="tc.status === 'success' ? 'success' : (tc.status === 'running' ? 'primary' : 'danger')"
                  class="!text-[9px] !h-4 !px-1.5"
                >
                  {{ tc.status }}
                </el-tag>
              </div>

              <!-- Message details / Failure notes -->
              <p v-if="tc.result?.message" class="text-[10px] opacity-75 leading-tight">
                {{ tc.result.message }}
              </p>

              <!-- Quick Retry on Failure -->
              <div v-if="tc.status === 'error' || tc.result?.data?.failedItems?.length" class="mt-1 flex items-center gap-2">
                <el-button
                  size="small"
                  type="danger"
                  plain
                  round
                  class="!text-[10px] !h-5"
                  @click="sendMessage(`Retry failed items in ${tc.name}`)"
                >
                  🔄 {{ t('chatbot.retryFailedItems') }}
                </el-button>
              </div>
            </div>
          </div>
        </details>

        <!-- 2. Live Asset Generation Preview Grid (Rendered Media / Progress Cards) -->
        <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="w-full max-w-[95%]">
          <AssetLivePreviewGrid :tool-calls="msg.toolCalls" @retry="sendMessage" />
        </div>

        <!-- 3. Message Body with Element Plus Rich UI Rendering -->
        <div v-if="msg.content"
          class="p-3.5 rounded-2xl max-w-[95%] text-xs leading-relaxed border shadow-soft break-words"
          :style="msg.role === 'user'
            ? 'background: linear-gradient(135deg, var(--el-color-primary) 0%, #0ea5e9 100%); color: white; border-color: transparent;'
            : 'background-color: var(--el-card-bg-color); border-color: var(--el-border-color); color: var(--el-text-color-primary);'"
        >
          <UserMessageRenderer v-if="msg.role === 'user'" :content="msg.content" />
          <ChatContentRenderer v-else :content="msg.content" />
        </div>
      </div>

      <!-- Streaming Live Progress Indicator with Animation -->
      <div
        v-if="isStreaming"
        class="p-3 rounded-2xl border shadow-md w-full max-w-[95%] space-y-2 animate-fade-in"
        style="background: linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(62, 207, 142, 0.08) 100%); border-color: rgba(14, 165, 233, 0.3);"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <el-icon class="animate-spin text-base" style="color: var(--el-color-primary);"><Loading /></el-icon>
            <span class="text-xs font-bold" style="color: var(--el-text-color-primary);">
              {{ activeProgress?.message || t('chatbot.agentThinking', 'Copilot is thinking and executing tasks...') }}
            </span>
          </div>
          <el-tag v-if="activeProgress" size="small" type="primary" effect="dark" round class="!font-mono !text-[10px]">
            {{ activeProgress.current }}/{{ activeProgress.total }}
          </el-tag>
        </div>

        <el-progress
          v-if="activeProgress && activeProgress.total > 1"
          :percentage="Math.round((activeProgress.current / activeProgress.total) * 100)"
          :stroke-width="4"
          :show-text="false"
          status="success"
        />
      </div>
    </div>

    <!-- Bottom Input Area with '@' Mention Popover -->
    <div class="relative p-3 rounded-2xl border flex flex-col gap-2 shrink-0 shadow-soft" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color);">
      <!-- Floating '@' Mention Autocomplete List -->
      <div
        v-if="showMentionDropdown"
        class="absolute bottom-full left-0 right-0 mb-2 p-1.5 rounded-2xl border shadow-xl max-h-60 overflow-y-auto custom-scrollbar z-50 backdrop-blur-md"
        style="background-color: var(--el-bg-color-overlay); border-color: var(--el-border-color);"
      >
        <div class="flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border-b mb-1" style="color: var(--el-text-color-secondary); border-color: var(--el-border-color-light);">
          <span>{{ t('chatbot.mentionObjects', 'Mention Objects (@)') }}</span>
          <span class="text-[9px] lowercase font-normal opacity-70">{{ t('chatbot.navigateSelectHint') }}</span>
        </div>

        <div v-if="filteredMentions.length === 0" class="p-3 text-center text-xs opacity-60">
          {{ t('chatbot.noMatchingObjects') }}
        </div>

        <div
          v-for="(item, idx) in filteredMentions"
          :key="item.id"
          @click="insertMention(item)"
          @mouseenter="selectedMentionIndex = idx"
          class="flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all text-xs"
          :style="selectedMentionIndex === idx
            ? 'background-color: var(--el-fill-color); color: var(--el-color-primary);'
            : 'color: var(--el-text-color-primary);'"
        >
          <div class="flex items-center gap-2 min-w-0">
            <el-tag
              size="small"
              round
              :type="item.tagColor as any || 'primary'"
              effect="plain"
              class="!text-[10px] !px-1.5 shrink-0"
            >
              {{ item.category }}
            </el-tag>
            <div class="truncate">
              <span class="font-bold mr-1.5">{{ item.name }}</span>
              <span v-if="item.detail" class="text-[10px] opacity-60 truncate">{{ item.detail }}</span>
            </div>
          </div>
          <el-icon class="text-xs opacity-50"><ArrowRight /></el-icon>
        </div>
      </div>

      <!-- Suggestion Action Chips directly above Chat Input -->
      <div v-if="activeChips && activeChips.length > 0" class="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 custom-scrollbar">
        <button
          v-for="chip in activeChips"
          :key="chip.label"
          @click="sendMessage(chip.prompt)"
          :disabled="isStreaming"
          class="px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
          :style="dynamicSuggestions.length > 0
            ? 'background: linear-gradient(135deg, rgba(62, 207, 142, 0.18) 0%, rgba(14, 165, 233, 0.15) 100%); border-color: rgba(62, 207, 142, 0.45); color: var(--el-text-color-primary);'
            : 'background-color: var(--el-fill-color-light); border-color: var(--el-border-color); color: var(--el-text-color-regular);'"
        >
          <span>{{ chip.label }}</span>
        </button>
      </div>

      <!-- Textarea Input -->
      <el-input
        ref="inputRef"
        v-model="inputPrompt"
        type="textarea"
        :rows="2"
        :placeholder="t('chatbot.inputPlaceholder', 'Command AI Agent (e.g. Type @ to mention character/scene, generate storyboard)...')"
        resize="none"
        @input="handleInputChange"
        @keydown="handleInputKeydown"
        class="!border-none"
      />

      <!-- Action Toolbar -->
      <div class="flex items-center justify-between pt-0.5">
        <div class="flex items-center gap-2">
          <!-- Quick @ Mention Button -->
          <el-button
            size="small"
            round
            plain
            class="!text-[11px] !px-2.5 !h-6"
            :type="showMentionDropdown ? 'primary' : 'info'"
            @click="toggleMentionList"
            title="Mention series, episode, characters, scenes, audio..."
          >
            <span class="font-bold mr-0.5">@</span>
            <span>{{ t('chatbot.mention') }}</span>
          </el-button>

          <span class="text-[10px]" style="color: var(--el-text-color-secondary);">
            {{ t('chatbot.pressEnter', 'Press Enter to send') }}
          </span>
        </div>

        <el-button
          type="primary"
          round
          size="small"
          icon="Promotion"
          :loading="isStreaming"
          :disabled="!inputPrompt.trim()"
          class="!font-bold !px-4"
          @click="sendMessage()"
        >
          {{ t('chatbot.send', 'Send') }}
        </el-button>
      </div>
    </div>
  </div>
</template>
