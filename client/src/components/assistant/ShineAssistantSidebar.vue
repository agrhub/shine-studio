<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '@/stores/chatStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { storeToRefs } from 'pinia';
import ChatContentRenderer from '@/pages/projects/workspace/ChatContentRenderer.vue';
import UserMessageRenderer from '@/pages/projects/workspace/UserMessageRenderer.vue';
import AssetLivePreviewGrid from '@/pages/projects/workspace/AssetLivePreviewGrid.vue';
import { Sparkles, Bot } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

const {
  isSidebarOpen,
  isThinking,
  isStreaming,
  messages,
  currentSuggestions,
  dynamicSuggestions,
  activeProgress,
  scope,
  currentPageContext,
  chatModels,
  selectedChatModel,
} = storeToRefs(chatStore);

onMounted(() => {
  chatStore.fetchChatModels();
});

const inputQuery = ref('');
const scrollContainer = ref<HTMLDivElement | null>(null);
const isListening = ref(false);

// Update page context when route changes
watch(
  () => route.path,
  (newPath) => {
    let context = 'dashboard';
    if (newPath.includes('/project/')) context = 'workspace';
    else if (newPath.includes('/assets')) context = 'assets';
    else if (newPath.includes('/analytics')) context = 'analytics';
    else if (newPath.includes('/settings') || newPath.includes('/billing')) context = 'settings';

    const seriesId = (route.params.id as string) || undefined;
    const episodeId = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId || undefined;
    chatStore.setPageContext(context, seriesId, episodeId);
  },
  { immediate: true }
);

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
}

watch(
  () => messages.value.length,
  () => {
    scrollToBottom();
  }
);

watch(
  () => messages.value[messages.value.length - 1]?.content,
  () => {
    scrollToBottom();
  }
);

const activeChips = computed(() => {
  if (dynamicSuggestions.value && dynamicSuggestions.value.length > 0) {
    return dynamicSuggestions.value.map(s => ({
      label: s.label || s.prompt || (s as any).text,
      prompt: s.prompt || s.label || (s as any).text,
      text: s.label || s.prompt || (s as any).text,
      category: s.label ? undefined : 'Action',
    }));
  }
  return currentSuggestions.value.map(s => ({
    label: s.text,
    prompt: s.actionPrompt || s.text,
    text: s.text,
    category: s.category,
  }));
});

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

async function handleSendMessage(textOverride?: string) {
  const query = (textOverride || inputQuery.value).trim();
  if (!query || isThinking.value || isStreaming.value) return;

  inputQuery.value = '';
  await chatStore.sendMessage(query);
  scrollToBottom();
}

function handleSuggestionClick(text: string) {
  handleSendMessage(text);
}

function handleReset() {
  chatStore.resetConversation();
}

function handleClose() {
  chatStore.closeSidebar();
}

// Optional browser Speech-to-Text integration
function toggleSpeechRecognition() {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    ElMessage.warning('Speech recognition is not supported in this browser.');
    return;
  }

  if (isListening.value) {
    isListening.value = false;
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening.value = true;
      ElMessage.info('Listening for voice input...');
    };

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript;
      inputQuery.value = speechResult;
      isListening.value = false;
    };

    recognition.onerror = (err: any) => {
      console.warn('[SpeechRecognition] Error:', err);
      isListening.value = false;
    };

    recognition.onend = () => {
      isListening.value = false;
    };

    recognition.start();
  } catch (err: any) {
    console.error('Speech recognition failed to start:', err);
    isListening.value = false;
  }
}

onMounted(() => {
  scrollToBottom();
});
</script>

<template>
  <!-- Dedicated Right Sidebar Container -->
  <aside
    v-show="isSidebarOpen"
    id="shine-dedicated-assistant-sidebar"
    class="w-[360px] md:w-[400px] lg:w-[440px] bg-[#0c1015]/95 backdrop-blur-xl border-l border-[var(--el-border-color)] flex flex-col h-screen shrink-0 z-30 transition-all duration-300 ease-in-out select-none shadow-2xl relative"
  >
    <!-- Header -->
    <div class="h-16 px-4 border-b border-[var(--el-border-color)]/60 flex items-center justify-between bg-[var(--el-bg-color-page)]/40 shrink-0">
      <!-- Title & Live Status -->
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shrink-0">
          <el-icon :size="16"><Bot /></el-icon>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-[var(--el-text-color-primary)] tracking-tight truncate">{{ $t('chatbot.assistantTitle') }}</span>
            <span
              class="text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold truncate"
              :class="scope === 'series'
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'"
            >
              {{ scope === 'series' ? (seriesStore.currentSeries?.title || 'Series') : 'Global' }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="relative flex h-1.5 w-1.5 shrink-0">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span class="text-[10px] text-muted-foreground truncate">
              {{ scope === 'series' ? `Episode #${seriesStore.activeEpisode?.episode_number || 1}` : `#${currentPageContext}` }}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- Chat model picker (shown when more than one provider is configured) -->
        <el-select
          v-if="chatModels.length > 1"
          :model-value="selectedChatModel"
          size="small"
          class="!w-[92px]"
          placeholder="Model"
          title="Chat model"
          @update:model-value="(v: string) => chatStore.setChatModel(v)"
        >
          <el-option label="Default" value="" />
          <el-option v-for="m in chatModels" :key="m.id" :label="m.label" :value="m.id" />
        </el-select>
        <button
          @click="handleReset"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--el-text-color-secondary)] hover:text-[var(--el-text-color-primary)] hover:bg-[var(--el-fill-color-light)] transition-colors cursor-pointer"
          title="Reset Conversation"
        >
          <el-icon :size="14"><RefreshRight /></el-icon>
        </button>
        <button
          @click="handleClose"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--el-text-color-secondary)] hover:text-[var(--el-text-color-primary)] hover:bg-[var(--el-fill-color-light)] transition-colors cursor-pointer"
          title="Close Assistant"
        >
          <el-icon :size="14"><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- Messages / Content Scrollable Area -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto p-3.5 space-y-4 min-h-0 select-text custom-scrollbar">
      <!-- Welcome Hero (shown when empty or starting) -->
      <div v-if="messages.length <= 1" class="py-4 flex flex-col items-center text-center px-1 select-none">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600/30 via-teal-500/20 to-blue-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-lg ring-4 ring-emerald-500/10">
          <el-icon :size="22"><Sparkles /></el-icon>
        </div>
        <h3 class="text-xs font-bold text-[var(--el-text-color-primary)] mb-1">
          {{ scope === 'series' ? 'Series Production Copilot' : 'Shine Global Studio AI' }}
        </h3>
        <p class="text-[11px] text-[var(--el-text-color-secondary)] max-w-[280px] leading-relaxed mb-4">
          {{ scope === 'series'
            ? 'Full episode context loaded. Direct the AI to generate characters, render storyboards, synthesize voiceover, or run the entire pipeline.'
            : 'Global studio context loaded. Ask about all series, pipeline health, storage, analytics, or generate new production concepts.'
          }}
        </p>

        <!-- Contextual Suggestion Pills -->
        <div class="w-full space-y-2 text-left">
          <div class="text-[10px] font-semibold tracking-wider uppercase text-[var(--el-text-color-secondary)] px-1 flex items-center justify-between">
            <span>{{ $t('chatbot.quickSuggestions') }}</span>
            <span class="text-emerald-400 lowercase font-normal">#{{ currentPageContext }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="(sug, idx) in activeChips"
              :key="idx"
              @click="handleSuggestionClick(sug.text)"
              class="w-full text-left px-3 py-2 rounded-xl border border-[var(--el-border-color)] bg-[var(--el-bg-color)]/60 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-[11px] text-[var(--el-text-color-regular)] hover:text-emerald-300 transition-all duration-200 cursor-pointer shadow-sm flex items-center justify-between group"
            >
              <span class="truncate mr-2">{{ sug.text }}</span>
              <span v-if="sug.category" class="text-[9px] px-1.5 py-0.5 rounded bg-[var(--el-fill-color-light)] text-[var(--el-text-color-secondary)] group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-colors shrink-0">
                {{ sug.category }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Messages Stream List -->
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex flex-col gap-1.5"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <!-- Role Label -->
        <div class="text-[10px] text-[var(--el-text-color-secondary)] px-1 flex items-center gap-1.5 font-medium">
          <span v-if="msg.role === 'assistant'" class="text-emerald-400 flex items-center gap-1">
            <el-icon :size="11"><Cpu /></el-icon> Shine Copilot
          </span>
          <span v-else class="text-[var(--el-text-color-regular)] flex items-center gap-1">
            <el-icon :size="11"><User /></el-icon> You
          </span>
        </div>

        <!-- 1. AI Tool Execution Accordion (Thought & Actions) -->
        <details
          v-if="msg.toolCalls && msg.toolCalls.length > 0"
          class="w-full group text-xs select-none"
        >
          <summary class="flex items-center justify-between px-3 py-1.5 rounded-xl border cursor-pointer transition-all hover:opacity-90 list-none bg-muted/40 border-border/60">
            <div class="flex items-center gap-1.5">
              <el-icon class="text-xs text-primary"><Cpu /></el-icon>
              <span class="font-medium text-[10px] text-muted-foreground">
                Execution Process ({{ msg.toolCalls.length }} action{{ msg.toolCalls.length !== 1 ? 's' : '' }})
              </span>
            </div>
            <div class="flex items-center gap-1 text-[9px] opacity-70 text-muted-foreground">
              <span class="group-open:hidden">▼ Show</span>
              <span class="hidden group-open:inline">▲ Hide</span>
            </div>
          </summary>

          <div class="p-2 space-y-1.5 mt-1 rounded-xl border border-dashed border-border/60 bg-background/50">
            <div
              v-for="(tc, idx) in msg.toolCalls"
              :key="idx"
              class="p-2 rounded-lg border flex flex-col gap-1 text-[10px]"
              :class="{
                'bg-emerald-500/5 border-emerald-500/20': tc.status === 'success',
                'bg-sky-500/5 border-sky-500/20': tc.status === 'running',
                'bg-destructive/5 border-destructive/20': tc.status === 'error',
              }"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5 font-medium">
                  <el-icon v-if="tc.status === 'running'" class="animate-spin text-sky-400"><Loading /></el-icon>
                  <el-icon v-else-if="tc.status === 'success'" class="text-emerald-400"><Check /></el-icon>
                  <el-icon v-else class="text-destructive"><Close /></el-icon>
                  <span>{{ formatToolActionName(tc.name) }}</span>
                </div>
                <span
                  class="text-[8px] px-1 py-0.2 rounded font-mono uppercase font-bold border"
                  :class="{
                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': tc.status === 'success',
                    'bg-sky-500/10 text-sky-400 border-sky-500/20': tc.status === 'running',
                    'bg-destructive/10 text-destructive border-destructive/20': tc.status === 'error',
                  }"
                >
                  {{ tc.status }}
                </span>
              </div>

              <p v-if="tc.result?.message" class="text-[9px] opacity-75 leading-tight">
                {{ tc.result.message }}
              </p>
            </div>
          </div>
        </details>

        <!-- 2. Live Media / Asset Preview Grid -->
        <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="w-full max-w-[98%]">
          <AssetLivePreviewGrid :tool-calls="msg.toolCalls" @retry="handleSendMessage" />
        </div>

        <!-- 3. Message Bubble Content -->
        <div
          v-if="msg.content"
          class="max-w-[95%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed break-words"
          :class="msg.role === 'user'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-sm shadow-md'
            : 'bg-[var(--el-bg-color)] border border-[var(--el-border-color)] text-[var(--el-text-color-primary)] rounded-tl-sm shadow-soft'"
        >
          <UserMessageRenderer v-if="msg.role === 'user'" :content="msg.content" />
          <ChatContentRenderer v-else :content="msg.content" />
        </div>

        <!-- 4. Dynamic Message-Level Action Suggestions -->
        <div
          v-if="msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0"
          class="flex flex-wrap gap-1.5 pt-0.5 max-w-[95%] select-none"
        >
          <button
            v-for="(sug, sIdx) in msg.suggestions"
            :key="sIdx"
            type="button"
            @click="handleSuggestionClick(sug.prompt || sug.label || (sug as any).text)"
            :disabled="isThinking || isStreaming"
            class="text-[10px] px-2.5 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer font-medium shadow-sm"
          >
            <Sparkles class="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span>{{ sug.label || (sug as any).text || sug.prompt }}</span>
          </button>
        </div>
      </div>

      <!-- Live Step Progress / Thinking Indicator -->
      <div v-if="isThinking || isStreaming" class="space-y-2">
        <div
          v-if="activeProgress"
          class="p-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 space-y-1.5"
        >
          <div class="flex items-center justify-between text-[10px] font-semibold">
            <span class="flex items-center gap-1.5">
              <el-icon class="animate-spin"><Loading /></el-icon>
              {{ activeProgress.step.toUpperCase() }}: {{ activeProgress.item }}
            </span>
            <span class="font-mono">{{ activeProgress.current }}/{{ activeProgress.total }}</span>
          </div>
          <el-progress
            :percentage="Math.round((activeProgress.current / Math.max(activeProgress.total, 1)) * 100)"
            :stroke-width="3"
            :show-text="false"
            color="#0ea5e9"
          />
          <p class="text-[9px] opacity-80 truncate">{{ activeProgress.message }}</p>
        </div>

        <div v-else class="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 w-fit animate-pulse">
          <el-icon class="animate-spin" :size="13"><Loading /></el-icon>
          <span class="text-[11px]">{{ $t('chatbot.formulatingResponse') }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Input Area with Suggestions Bar -->
    <div class="p-3 border-t border-[var(--el-border-color)]/60 bg-[var(--el-bg-color-page)]/70 shrink-0 space-y-2">
      <!-- Suggestion Action Chips Carousel directly above Input Bar -->
      <div v-if="activeChips && activeChips.length > 0" class="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar select-none">
        <button
          v-for="(chip, idx) in activeChips"
          :key="idx"
          type="button"
          @click="handleSuggestionClick(chip.prompt || chip.text)"
          :disabled="isThinking || isStreaming"
          class="px-2.5 py-1 rounded-full border text-[10.5px] font-medium whitespace-nowrap transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
          :class="dynamicSuggestions.length > 0
            ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/25'
            : 'bg-[var(--el-fill-color-light)] border-[var(--el-border-color)] text-[var(--el-text-color-regular)] hover:border-emerald-500/40 hover:text-emerald-300'"
        >
          <Sparkles class="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          <span>{{ chip.label || chip.text }}</span>
        </button>
      </div>

      <form @submit.prevent="handleSendMessage()" class="relative flex items-center">
        <!-- Speech Mic Button -->
        <button
          type="button"
          @click="toggleSpeechRecognition"
          class="absolute left-2 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
          :class="isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-[var(--el-text-color-secondary)] hover:text-emerald-400 hover:bg-[var(--el-fill-color-light)]'"
          title="Voice Dictation"
        >
          <el-icon :size="14"><Microphone /></el-icon>
        </button>

        <!-- Text Input Box -->
        <input
          v-model="inputQuery"
          type="text"
          :placeholder="scope === 'series' ? 'Direct episode production, render assets...' : 'Direct studio, query all series, audit jobs...'"
          :disabled="isThinking || isStreaming"
          class="w-full h-10 pl-9 pr-9 text-xs bg-[var(--el-bg-color)] border border-[var(--el-border-color)] rounded-xl text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-secondary)]/60 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
        />

        <!-- Send Button -->
        <button
          type="submit"
          :disabled="!inputQuery.trim() || isThinking || isStreaming"
          class="absolute right-1.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer"
          :class="inputQuery.trim() && !isThinking && !isStreaming
            ? 'bg-emerald-500 text-white shadow hover:bg-emerald-400'
            : 'text-[var(--el-text-color-secondary)]/40 cursor-not-allowed'"
          title="Send Message"
        >
          <el-icon :size="13"><Position /></el-icon>
        </button>
      </form>
    </div>
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary);
}
</style>
