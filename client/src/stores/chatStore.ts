import { defineStore } from 'pinia';
import http from '@/utils/http';
import { useTimelineStore } from '@/stores/timelineStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import type { ChatMessage, Command, CostGuardrails } from '@/types/api';
import i18n from '@/i18n';
import { ElMessage } from 'element-plus';
import { toast } from 'vue-sonner';
import { useAuthStore } from '@/stores/useAuthStore';

export interface AssistantSuggestion {
  text: string;
  category?: string;
  actionPrompt?: string;
}

export interface ToolCallState {
  id?: string;
  name: string;
  args: any;
  status: 'running' | 'success' | 'error';
  result?: any;
  retries?: number;
}

export interface ProgressState {
  step: string;
  item: string;
  current: number;
  total: number;
  message: string;
}

export interface ExtendedChatMessage extends ChatMessage {
  toolCalls?: ToolCallState[];
  suggestions?: Array<{ label: string; prompt: string }>;
}

export const PAGE_SUGGESTIONS: Record<string, AssistantSuggestion[]> = {
  dashboard: [
    { text: 'Summarize series performance & viewer retention', category: 'Analytics' },
    { text: 'Suggest top 5 viral drama hooks for next series', category: 'Creative' },
    { text: 'Plan a new 24-episode CEO Revenge mini-drama', category: 'Planning' },
    { text: 'Audit credit consumption and render velocity', category: 'System' },
  ],
  wizard: [
    { text: 'Draft 24-episode Master Plan with 3-act arcs', category: 'Planning' },
    { text: 'Create protagonist and antagonist character profiles', category: 'Characters' },
    { text: 'Generate high-tension cliffhangers for every episode', category: 'Creative' },
    { text: 'Suggest optimal visual style & aesthetic prompt', category: 'Visuals' },
  ],
  workspace: [
    { text: 'Breakdown screenplay into 6-second cinematic shots', category: 'Storyboard' },
    { text: 'Generate 8-angle facial consistency anchors for cast', category: 'Cast' },
    { text: 'Auto-mix 3D binaural spatial audio track', category: 'Audio' },
    { text: 'Translate dialogue & generate voiceover dubs', category: 'Voice' },
    { text: 'Auto-generate synchronized subtitle captions', category: 'Captions' },
    { text: 'Run full autonomous production pipeline', category: 'Pipeline' },
  ],
  assets: [
    { text: 'Search cinematic stock footage on Pexels', category: 'Stock' },
    { text: 'Generate modern luxury penthouse location asset', category: 'Generation' },
    { text: 'Create custom prop asset with clean background', category: 'Props' },
    { text: 'Audit storage usage and sync missing media', category: 'Storage' },
  ],
  analytics: [
    { text: 'Evaluate viewer drop-off points in Episode 1', category: 'Retention' },
    { text: 'Calculate estimated return on credits for active series', category: 'ROI' },
    { text: 'Compare conversion rates across target countries', category: 'Markets' },
  ],
  settings: [
    { text: 'Audit AI model endpoints and API health', category: 'Diagnostics' },
    { text: 'Check storage adapter and CDN latency', category: 'Infrastructure' },
    { text: 'Configure credit budget guardrails', category: 'Budget' },
  ],
};

export const useChatStore = defineStore('chat', {
  state: () => ({
    isSidebarOpen: localStorage.getItem('shine_assistant_open') === 'true',
    currentPageContext: 'dashboard' as string,
    activeSeriesId: null as string | null,
    activeEpisodeId: null as string | null,
    scope: 'global' as 'global' | 'series',
    messages: [] as ExtendedChatMessage[],
    dynamicSuggestions: [] as Array<{ label: string; prompt: string }>,
    activeProgress: null as ProgressState | null,
    isThinking: false,
    isStreaming: false,
    isLoadingHistory: false,
    loadedUserId: null as string | null,
    costGuardrails: {
      max_budget_usd: 3.50,
      current_spend_usd: 1.25,
      low_res_proxy_mode: false,
    } as CostGuardrails,
  }),

  getters: {
    currentSuggestions(state): AssistantSuggestion[] {
      const pageKey = state.currentPageContext?.toLowerCase() || 'dashboard';
      return PAGE_SUGGESTIONS[pageKey] || PAGE_SUGGESTIONS.dashboard;
    },
    isWorkspace(state): boolean {
      return state.currentPageContext === 'workspace' && Boolean(state.activeSeriesId);
    },
    activeSessionId(state): string {
      if (state.scope === 'series' && state.activeSeriesId) {
        return `${state.activeSeriesId}_${state.activeEpisodeId || 'main'}`;
      }
      return 'global';
    },
  },

  actions: {
    clearUserSession() {
      this.messages = [];
      this.dynamicSuggestions = [];
      this.activeProgress = null;
      this.loadedUserId = null;
      this.setDefaultWelcomeMessage();
    },

    toggleSidebar() {
      this.isSidebarOpen = !this.isSidebarOpen;
      localStorage.setItem('shine_assistant_open', String(this.isSidebarOpen));
      if (this.isSidebarOpen && this.messages.length === 0) {
        this.loadHistory();
      }
    },

    openSidebar() {
      this.isSidebarOpen = true;
      localStorage.setItem('shine_assistant_open', 'true');
      if (this.messages.length === 0) {
        this.loadHistory();
      }
    },

    closeSidebar() {
      this.isSidebarOpen = false;
      localStorage.setItem('shine_assistant_open', 'false');
    },

    setPageContext(context: string, seriesId?: string, episodeId?: string) {
      const prevScope = this.scope;
      const prevSeriesId = this.activeSeriesId;

      this.currentPageContext = context;
      this.activeSeriesId = seriesId || null;
      this.activeEpisodeId = episodeId || null;
      this.scope = context === 'workspace' && seriesId ? 'series' : 'global';

      // Reload history if scope or series changed
      if (prevScope !== this.scope || (this.scope === 'series' && prevSeriesId !== this.activeSeriesId)) {
        this.loadHistory();
      }
    },

    async loadHistory(targetIdOverride?: string, page = 1, limit = 50) {
      const authStore = useAuthStore();
      const currentUserId = authStore.user?.id || null;

      // If active user changed, purge in-memory messages before loading
      if (this.loadedUserId !== currentUserId) {
        this.messages = [];
        this.dynamicSuggestions = [];
        this.loadedUserId = currentUserId;
      }

      if (!currentUserId) {
        this.setDefaultWelcomeMessage();
        return;
      }

      const targetId = targetIdOverride || (this.scope === 'series' && this.activeSeriesId ? this.activeSeriesId : 'global');
      if (this.isLoadingHistory) {
        return;
      }
      this.isLoadingHistory = true;
      try {
        const offset = (page - 1) * limit;
        const res: any = await http.get(`/ai/agentic/history/${targetId}?limit=${limit}&offset=${offset}`);
        const data = res?.data || res;
        let historyList: any[] = [];

        if (data?.messages && Array.isArray(data.messages)) {
          historyList = data.messages;
        } else if (Array.isArray(data)) {
          historyList = data;
        }

        if (historyList.length > 0) {
          const loaded = historyList.map((m: any) => ({
            id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            role: m.role || 'assistant',
            content: m.content || m.text || '',
            timestamp: m.timestamp || Date.now(),
            toolCalls: (m.toolCalls || [])
              .filter((tc: any, idx: number, arr: any[]) => arr.findIndex((t: any) => t.name === tc.name && (t.status === 'success' || JSON.stringify(t.args) === JSON.stringify(tc.args))) === idx)
              .map((tc: any) => tc.status === 'running' ? { ...tc, status: 'success' } : tc),
            suggestions: m.suggestions || [],
          }));

          if (page > 1) {
            this.messages = [...loaded, ...this.messages];
          } else {
            this.messages = loaded;
          }

          // Restore dynamic suggestions from last assistant message
          for (let i = this.messages.length - 1; i >= 0; i--) {
            const msg = this.messages[i];
            if (msg.role === 'assistant') {
              if (msg.suggestions && msg.suggestions.length > 0) {
                this.dynamicSuggestions = msg.suggestions;
                break;
              }
              const sugMatch = msg.content.match(/```(?:suggestions|json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
              if (sugMatch) {
                try {
                  const parsed = JSON.parse(sugMatch[1]);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    this.dynamicSuggestions = parsed;
                    msg.suggestions = parsed;
                    msg.content = msg.content.replace(sugMatch[0], '').trim();
                    break;
                  }
                } catch {}
              }
            }
          }
        } else if (page === 1) {
          this.setDefaultWelcomeMessage();
        }
      } catch (err) {
        console.warn('[ChatStore] Could not load agentic history:', err);
        if (this.messages.length === 0) {
          this.setDefaultWelcomeMessage();
        }
      } finally {
        this.isLoadingHistory = false;
      }
    },

    setDefaultWelcomeMessage() {
      const isSeries = this.scope === 'series' && this.activeSeriesId;
      const contextTitle = isSeries ? 'Series Studio' : this.currentPageContext.toUpperCase();

      this.messages = [
        {
          id: `msg-welcome-${Date.now()}`,
          role: 'assistant',
          content: isSeries
            ? i18n.global.t('chatbot.welcomeSeries')
            : i18n.global.t('chatbot.welcomeGlobal', { context: contextTitle }),
          timestamp: Date.now(),
        },
      ];
    },

    async resetConversation() {
      this.setDefaultWelcomeMessage();
      this.dynamicSuggestions = [];
      this.activeProgress = null;
      ElMessage.info('Assistant conversation reset.');
    },

    async sendMessage(content: string, _attachments?: string[]) {
      const text = content.trim();
      if (!text || this.isStreaming) return;

      const userMsgId = `usr_${Date.now()}`;
      this.messages.push({
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      });

      const assistantMsgId = `asst_${Date.now()}`;
      const assistantMsg: ExtendedChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
      };
      this.messages.push(assistantMsg);

      this.isThinking = true;
      this.isStreaming = true;
      let hasPendingWorkspaceSync = false;
      let lastIndex = 0;

      const seriesStore = useSeriesStore();
      const pipelineStore = usePipelineStore();
      const timelineStore = useTimelineStore();
      const collabStore = useCollaborationStore();
      const authStore = useAuthStore();

      const seriesId = this.scope === 'series' ? this.activeSeriesId || undefined : 'global';
      const episodeId = this.scope === 'series' ? this.activeEpisodeId || undefined : 'main';
      const currentLocale = String((i18n.global.locale as any)?.value || (i18n.global as any).locale || 'en');
      const userProfileLang = authStore.user?.language || currentLocale;

      try {
        await http.post(
          '/ai/agentic/stream',
          {
            session_id: this.activeSessionId,
            series_id: seriesId,
            episode_id: episodeId,
            message: text,
            context: {
              pageContext: this.currentPageContext,
              scope: this.scope,
              appLanguage: currentLocale,
              profileLanguage: userProfileLang,
              language: userProfileLang || currentLocale,
            },
          },
          {
            timeout: 0,
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
                      assistantMsg.content += (parsed?.text || '');
                    } else if (eventType === 'step_progress') {
                      this.activeProgress = parsed;
                      pipelineStore.setActiveProgress(parsed);
                    } else if (eventType === 'suggestions') {
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        this.dynamicSuggestions = parsed;
                      }
                    } else if (eventType === 'tool_call') {
                      if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
                      const existing = assistantMsg.toolCalls.find(
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
                        assistantMsg.toolCalls.push({ ...parsed });
                      }
                    } else if (eventType === 'item_updated' || eventType === 'series_updated') {
                      hasPendingWorkspaceSync = true;
                    }
                  } catch {}
                }
              }
            },
          }
        );
      } catch (err: any) {
        assistantMsg.content += `\n\n❌ **Error:** ${err.message || i18n.global.t('chatbot.errorConnecting') || 'Failed to connect to Copilot'}`;
        toast.error(err.message || 'Failed to connect to Shine Copilot');
      } finally {
        this.isThinking = false;
        this.isStreaming = false;

        // Extract suggestions from assistantMsg.content markdown code block if present
        const suggestionsMatch = assistantMsg.content.match(/```(?:suggestions|json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
        if (suggestionsMatch) {
          try {
            const parsed = JSON.parse(suggestionsMatch[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const valid = parsed.filter((p: any) => (p.label || p.text || p.prompt) && (p.prompt || p.label || p.text));
              if (valid.length > 0) {
                this.dynamicSuggestions = valid;
                assistantMsg.suggestions = valid;
              }
            }
          } catch {}
          assistantMsg.content = assistantMsg.content.replace(suggestionsMatch[0], '').trim();
        }

        if (this.dynamicSuggestions && this.dynamicSuggestions.length > 0 && (!assistantMsg.suggestions || assistantMsg.suggestions.length === 0)) {
          assistantMsg.suggestions = [...this.dynamicSuggestions];
        }

        // Perform single batch synchronization with workspace once stream completes
        if (hasPendingWorkspaceSync) {
          hasPendingWorkspaceSync = false;
          try {
            if (this.scope === 'series' && this.activeSeriesId) {
              if (this.activeEpisodeId) {
                await seriesStore.loadEpisodeScript(this.activeSeriesId, this.activeEpisodeId);
              }
              await seriesStore.loadWorkspaceData(this.activeSeriesId);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('pipeline-asset-updated', { detail: { batch: true } }));
            }
          } catch (syncErr) {
            console.warn('[ChatStore] Post-stream sync notice:', syncErr);
          }
        }
      }
    },

    async searchMemory(query: string) {
      try {
        const res = (await http.get(`/ai/assistant/memory/search?query=${encodeURIComponent(query)}`)) as any;
        ElMessage.info(i18n.global.t('toast.memorySearched') || 'Searched series knowledge base.');
        return res.data?.data?.results || [];
      } catch (err: any) {
        ElMessage.error('Memory search failed');
        return [];
      }
    },

    async fetchCostGuardrails() {
      try {
        const res = (await http.get('/admin/cost-guardrails')) as any;
        if (res.data?.data) {
          this.costGuardrails = res.data.data;
        }
      } catch (e) {
        // Keep default guardrails
      }
    },
  },
});
