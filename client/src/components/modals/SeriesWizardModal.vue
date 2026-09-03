<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useVisualStyleStore } from '@/stores/useVisualStyleStore';
import { getVisualStyleById } from '@/constants/visualStyles';
import http from '@/utils/http';
import { toast } from 'vue-sonner';

import WizardSidebar from './wizard/WizardSidebar.vue';
import WizardStepMode from './wizard/WizardStepMode.vue';
import WizardStepConfig from './wizard/WizardStepConfig.vue';
import WizardStepMasterPlan from './wizard/WizardStepMasterPlan.vue';
import WizardStepCompliance from './wizard/WizardStepCompliance.vue';
import { WizardFormData, PlanChatMessage, ComplianceResult } from './wizard/types';
import { Film, Check, Right, Promotion } from '@element-plus/icons-vue';
import { findCountry, getDefaultCountryForLocale } from '@/constants/countries';
import router from '@/router/index.ts';

const props = defineProps<{ 
  modelValue: boolean;
  initialTrend?: any;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'created', seriesId: string): void;
}>();

const { t, locale } = useI18n();
const seriesStore = useSeriesStore();
const authStore = useAuthStore();
const visualStyleStore = useVisualStyleStore();

onMounted(() => {
  visualStyleStore.fetchVisualStyles();
});

// ─── Step Control ──────────────────────────────────────────────────────────────
const currentStep = ref(0); // 0=MODE, 1=CONFIG, 2=MASTER PLAN, 3=COMPLIANCE
const masterPlan = ref<any>(null);
const complianceResult = ref<ComplianceResult>({});

const isGeneratingPlan = ref(false);
const isPlanChatSending = ref(false);
const planError = ref('');
const planChatMessages = ref<PlanChatMessage[]>([]);
const stepLabels = computed(() => [
  t('wizard.stepLaunchMode'),
  t('wizard.stepSeriesConfig'),
  t('wizard.stepMasterPlan'),
  t('wizard.stepCompliance'),
]);

const initialCountry = getDefaultCountryForLocale(locale.value);

// ─── Form Data ────────────────────────────────────────────────────────────────
const formData = ref<WizardFormData>({
  mode: 'viral',
  country: initialCountry.name,
  countryCode: initialCountry.code,
  language: initialCountry.primaryLang || 'en-US',
  selectedTrend: null,
  title: '',
  genre: 'Revenge / Drama',
  visualStyle: 'realistic',
  synopsis: '',
  targetEpisodes: 24,
  episodeDurationSeconds: 60,
  episodeDurationMinutes: 1,
  ratio: '9:16',
  referenceFiles: [],
  aiWatermark: true,
  commercialRights: true,
});

const wizardSessionId = ref<string>('wiz_' + Date.now());

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    wizardSessionId.value = 'wiz_' + Date.now();
    if (props.initialTrend) {
      const topic = props.initialTrend;
      formData.value.mode = 'viral';
      formData.value.selectedTrend = topic;
      formData.value.title = topic.topic || topic.title || '';
      formData.value.synopsis = topic.description || topic.synopsis || topic.trope || '';
      if (topic.genre) formData.value.genre = topic.genre;
      if (topic.target_episodes) formData.value.targetEpisodes = Number(topic.target_episodes);
      if (topic.country) {
        const c = findCountry(topic.country);
        formData.value.country = c.name;
        formData.value.countryCode = c.code;
        formData.value.language = c.primaryLang || 'en-US';
      }
      currentStep.value = 1;
    } else {
      currentStep.value = 0;
      masterPlan.value = null;
      complianceResult.value = {};
      planChatMessages.value = [];
      formData.value.title = '';
      formData.value.synopsis = '';
      formData.value.selectedTrend = null;
      const defCountry = getDefaultCountryForLocale(locale.value);
      formData.value.country = defCountry.name;
      formData.value.countryCode = defCountry.code;
      formData.value.language = defCountry.primaryLang || 'en-US';
    }
  }
});

watch(() => formData.value.episodeDurationSeconds, (sec) => {
  formData.value.episodeDurationMinutes = Number((sec / 60).toFixed(2));
});

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0 && s > 0) {
    return t('wizard.durationMinSec', { m, s });
  } else if (m > 0) {
    return t('wizard.durationMinOnly', { m });
  } else {
    return t('wizard.durationSecOnly', { s });
  }
}

// ─── Agentic Stream Helper ───────────────────────────────────────────────────
async function executeAgenticStream(
  prompt: string,
  onUpdate?: (type: string, data: any) => void,
  onChunk?: (chunk: string, accumulated: string) => void
): Promise<{ fullText: string }> {
  let fullText = '';
  let lastIndex = 0;

  let buffer = '';
  await http.post('/ai/agentic/stream',{
      session_id: wizardSessionId.value,
      message: prompt,
      context: {
        title: formData.value.title || formData.value.selectedTrend?.topic || '',
        genre: formData.value.genre,
        visual_style: formData.value.visualStyle,
        visual_style_prompt: (formData.value as any).visualStylePrompt || '',
        country: formData.value.country,
        language: formData.value.language,
        target_episodes: formData.value.targetEpisodes,
        episode_duration_seconds: formData.value.episodeDurationSeconds,
        synopsis: formData.value.synopsis || formData.value.selectedTrend?.description || '',
        ratio: formData.value.ratio,
        currentPlan: masterPlan.value,
      },
    },
    {
      responseType: 'text',
      onDownloadProgress: (progressEvent: any) => {
        const rawText = progressEvent.event?.target?.responseText || progressEvent.event?.target?.response || progressEvent.currentTarget?.response || '';
        const newChunk = rawText.slice(lastIndex);
        lastIndex = rawText.length;
        buffer += newChunk;

        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const block of messages) {
          if (!block.trim()) continue;
          let eventType = 'message';
          const eventMatch = block.match(/^event:\s*(.+)$/m);
          if (eventMatch) eventType = eventMatch[1].trim();

          const dataMatch = block.match(/^data:\s*([\s\S]+)$/m);
          if (dataMatch) {
            try {
              const parsed = JSON.parse(dataMatch[1].trim());
              if (eventType === 'chunk') {
                const chunkStr = parsed?.text || '';
                fullText += chunkStr;
                onChunk?.(chunkStr, fullText);
              } else if (eventType === 'item_updated') {
                onUpdate?.(parsed?.type, parsed?.data);
              } else if (eventType === 'tool_call') {
                if (parsed?.name === 'create_series' && (parsed?.result?.data || parsed?.data)) {
                  onUpdate?.('series_created', parsed?.result?.data || parsed?.data);
                }
              } else if (eventType === 'suggestions') {
                if (Array.isArray(parsed) && parsed.length > 0) {
                  dynamicSuggestions.value = parsed;
                }
              }
            } catch {}
          }
        }
      },
    }
  );

  return { fullText };
}

// ─── Step 2: Master Plan State & Actions (Agentic) ───────────────────────────
const dynamicSuggestions = ref<Array<{ label: string; prompt: string }>>([]);

async function generateMasterPlan() {
  currentStep.value = 2; // Immediately switch to Step 3 so user sees live streaming & skeleton
  isGeneratingPlan.value = true;
  planError.value = '';

  const currentStyle = formData.value.visualStyle || 'realistic';
  const styleObj = getVisualStyleById(currentStyle);
  const topicTitle = formData.value.title || formData.value.selectedTrend?.topic || 'Original Micro-Drama';

  const assistantMsg = ref<PlanChatMessage>({
    role: 'assistant',
    text: '',
    thinking: t('wizard.thinking1'),
  });

  planChatMessages.value = [
    {
      role: 'user',
      text: `🚀 **Initiating Series Master Plan Generation**\n\n- **Title / Topic:** ${topicTitle}\n- **Genre:** ${formData.value.genre}\n- **Setting Country:** ${formData.value.country}\n- **Script Language:** ${formData.value.language}\n- **Format:** ${formData.value.targetEpisodes} Episodes × ${formData.value.episodeDurationSeconds}s (${formData.value.ratio})\n- **Visual Aesthetic:** ${styleObj.name}`,
    },
    assistantMsg.value,
  ];

  const stepTimers: any[] = [];
  stepTimers.push(setTimeout(() => { if (isGeneratingPlan.value) assistantMsg.value.thinking = t('wizard.thinking2'); }, 2500));
  stepTimers.push(setTimeout(() => { if (isGeneratingPlan.value) assistantMsg.value.thinking = t('wizard.thinking3'); }, 5500));
  stepTimers.push(setTimeout(() => { if (isGeneratingPlan.value) assistantMsg.value.thinking = t('wizard.thinking4'); }, 8500));

  try {
    const prompt = `Please generate a complete micro-drama master plan for title "${formData.value.title || formData.value.selectedTrend?.topic || 'Untitled'}", genre "${formData.value.genre}", visualStyle "${currentStyle}", target country "${formData.value.country}", language "${formData.value.language}", ${formData.value.targetEpisodes} episodes @ ${formData.value.episodeDurationSeconds}s/ep in ${formData.value.ratio} format. Synopsis: "${formData.value.synopsis || formData.value.selectedTrend?.description || ''}".`;

    await executeAgenticStream(
      prompt,
      (type, data) => {
        if (type === 'master_plan_generated' || type === 'master_plan_updated') {
          masterPlan.value = data;
          if (data.title) formData.value.title = data.title;
          if (data.synopsis) formData.value.synopsis = data.synopsis;
          assistantMsg.value.thinking = null;
        }
      },
      (_chunk, accumulated) => {
        assistantMsg.value.text = accumulated;
      }
    );

    if (!masterPlan.value) {
      const res: any = await http.post('/ai/generate-master-plan', {
        wizard_session_id: wizardSessionId.value,
        title: formData.value.title || (formData.value.selectedTrend?.topic) || 'Untitled Series',
        genre: formData.value.genre,
        visual_style: currentStyle,
        visual_style_prompt: styleObj.promptModifier,
        synopsis: formData.value.synopsis || (formData.value.selectedTrend?.description),
        total_episodes: formData.value.targetEpisodes,
        episode_duration_seconds: formData.value.episodeDurationSeconds,
        country: formData.value.country,
        language: formData.value.language,
        ratio: formData.value.ratio,
        viral_topic: formData.value.selectedTrend?.topic || '',
      });
      masterPlan.value = res?.data;
      if (masterPlan.value?.title) formData.value.title = masterPlan.value.title;
    }

    if (!assistantMsg.value.text) {
      assistantMsg.value.text = t('wizard.masterPlanCreatedMsg', {
        episodes: formData.value.targetEpisodes,
        duration: formatDuration(formData.value.episodeDurationSeconds),
        country: formData.value.country,
        hook: masterPlan.value?.viralHook || t('wizard.defaultHook'),
      });
    }
  } catch (err: any) {
    planError.value = err?.message || t('wizard.planErrorMsg');
  } finally {
    stepTimers.forEach(clearTimeout);
    assistantMsg.value.thinking = null;
    isGeneratingPlan.value = false;
  }
}

async function sendPlanChat(customMsg?: string) {
  const msg = (typeof customMsg === 'string' ? customMsg : '').trim();
  if (!msg || isPlanChatSending.value) return;

  planChatMessages.value.push({ role: 'user', text: msg });
  isPlanChatSending.value = true;

  const assistantMsg = ref<PlanChatMessage>({
    role: 'assistant',
    text: '',
    thinking: t('wizard.thinkingRefining'),
  });
  planChatMessages.value.push(assistantMsg.value);

  try {
    let createdSeriesId = '';
    const prompt = msg;
    await executeAgenticStream(
      prompt,
      (type, data) => {
        if (type === 'master_plan_updated' || type === 'master_plan_generated') {
          masterPlan.value = data;
          if (data.totalEpisodes) formData.value.targetEpisodes = data.totalEpisodes;
          if (data.title) formData.value.title = data.title;
          if (data.totalDurationSeconds) formData.value.episodeDurationSeconds = data.totalDurationSeconds;
          assistantMsg.value.thinking = null;
        } else if (type === 'series_created') {
          createdSeriesId = data?.id || data?.seriesId || data?.series_id || data?.series?.id || '';
        }
      },
      (_chunk, accumulated) => {
        assistantMsg.value.text = accumulated;
      }
    );

    if (createdSeriesId) {
      try {
        await http.post('/ai/agentic/transfer-session', {
          old_session_id: wizardSessionId.value,
          new_series_id: createdSeriesId,
        });
      } catch {}
      toast.success(t('wizard.createSeriesSuccess'));
      emit('created', createdSeriesId);
      emit('update:modelValue', false);
      router.push(`/project/${createdSeriesId}`);
      return;
    }

    if (!assistantMsg.value.text) {
      assistantMsg.value.text = t('wizard.aiDoneUpdating');
    }
  } catch (err: any) {
    const errorDetail = err?.response?.data?.message || err?.message || t('wizard.planErrorMsg');
    planChatMessages.value.push({
      role: 'error',
      text: t('wizard.adjustmentFailed', { error: errorDetail }),
      failedPrompt: msg,
    });
    toast.error(errorDetail);
  } finally {
    assistantMsg.value.thinking = null;
    isPlanChatSending.value = false;
  }
}

function retryPlanChat(failedPrompt: string, errorIdx: number) {
  planChatMessages.value.splice(errorIdx, 1);
  sendPlanChat(failedPrompt);
}

// ─── Step 3: Compliance State & Actions (Agentic) ─────────────────────────────
const isVerifyingCompliance = ref(false);
const complianceError = ref('');

async function runComplianceVerification() {
  if (!masterPlan.value) return;
  isVerifyingCompliance.value = true;
  complianceError.value = '';
  try {
    const res: any = await http.post('/ai/verify-compliance', {
      master_plan: masterPlan.value,
      country: formData.value.language || 'United States',
      ratio: formData.value.ratio || '9:16',
      language: localStorage.getItem('shine_language') || 'en',
    });
    if (res?.data) {
      complianceResult.value = res.data;
    }
  } catch (err: any) {
    complianceError.value = err?.response?.data?.message || err?.message || t('wizard.complianceErrorMsg');
  } finally {
    isVerifyingCompliance.value = false;
  }
}

const isRefiningFromSuggestions = ref(false);

async function refineMasterPlanFromSuggestions(specificSuggestion?: string) {
  if (!masterPlan.value || isRefiningFromSuggestions.value) return;

  let instruction = '';
  if (specificSuggestion && typeof specificSuggestion === 'string') {
    instruction = `Please refine and optimize the series master plan to strictly implement this supervision recommendation:\n"${specificSuggestion}"`;
  } else if (complianceResult.value?.recommendations && complianceResult.value?.recommendations.length > 0) {
    instruction = `Please refine and optimize the series master plan to address all of the following supervision recommendations and quality gates:\n` +
      complianceResult.value?.recommendations.map((r: string, idx: number) => `${idx + 1}. ${r}`).join('\n');
  } else {
    return;
  }

  isRefiningFromSuggestions.value = true;
  toast.info(t('wizard.refiningFromSuggestions'));

  try {
    const prompt = `Refine master plan according to supervision recommendations: ${instruction}. Current plan: ${JSON.stringify(masterPlan.value)}`;
    await executeAgenticStream(prompt, (type, data) => {
      if (type === 'master_plan_updated') {
        masterPlan.value = data;
        if (data.total_episodes) formData.value.targetEpisodes = data.total_episodes;
        if (data.title) formData.value.title = data.title;
        if (data.total_duration_seconds) formData.value.episodeDurationSeconds = data.total_duration_seconds;
      }
    });

    planChatMessages.value.push({
      role: 'user',
      text: specificSuggestion ? `Suggestion: "${specificSuggestion}"` : 'Applied all supervision recommendations to optimize master plan.',
    });
    planChatMessages.value.push({
      role: 'assistant',
      text: t('wizard.aiDoneUpdating'),
    });

    toast.success(t('wizard.planRefinedSuccess'));
    await runComplianceVerification();
  } catch (err: any) {
    const errorDetail = err?.response?.data?.message || err?.message || t('wizard.planErrorMsg');
    toast.error(t('wizard.adjustmentFailed', { error: errorDetail }));
  } finally {
    isRefiningFromSuggestions.value = false;
  }
}

// ─── Finish & Submit (Agentic Series Creation) ────────────────────────────────
const isSubmitting = ref(false);

async function handleFinish() {
  if (!formData.value.title.trim()) {
    formData.value.title = masterPlan.value?.title || t('wizard.untitled');
  }
  isSubmitting.value = true;
  try {
    let createdSeriesId = '';
    const currentStyle = formData.value.visualStyle || 'realistic';
    const styleObj = getVisualStyleById(currentStyle);

    const prompt = `Create series project "${formData.value.title}" (${formData.value.genre}, ${formData.value.country}) from the approved master plan.`;
    await executeAgenticStream(prompt, (type, data) => {
      if (type === 'series_created') {
        createdSeriesId = data.id || data.seriesId;
      }
    });

    if (!createdSeriesId) {
      const finalPayload = {
        title: formData.value.title,
        genre: formData.value.genre,
        visual_style: currentStyle,
        visual_style_prompt: styleObj.promptModifier,
        country: formData.value.country,
        language: formData.value.language,
        ratio: formData.value.ratio,
        episode_count: masterPlan.value?.total_episodes || formData.value.targetEpisodes,
        episode_duration_seconds: masterPlan.value?.total_duration_seconds || formData.value.episodeDurationSeconds,
        episode_duration_minutes: masterPlan.value?.episode_duration_minutes || formData.value.episodeDurationMinutes || 1,
        synopsis: formData.value.synopsis || masterPlan.value?.synopsis || masterPlan.value?.description || masterPlan.value?.story_core?.core_attraction,
        master_plan: masterPlan.value,
        characters: masterPlan.value?.characters || [],
        locations: masterPlan.value?.locations || [],
        props: masterPlan.value?.props || [],
      };
      const newSeries = await seriesStore.createSeries(finalPayload);
      createdSeriesId = newSeries.id;
    }

    if (createdSeriesId) {
      try {
        await http.post('/ai/agentic/transfer-session', {
          old_session_id: wizardSessionId.value,
          new_series_id: createdSeriesId,
        });
      } catch {}
    }

    toast.success(t('wizard.createSeriesSuccess'));
    emit('created', createdSeriesId);
    setTimeout(() => {
      emit('update:modelValue', false);
      router.push(`/project/${createdSeriesId}`);
    }, 400);
  } catch (err: any) {
    toast.error(err?.message || 'Failed to create series');
  } finally {
    isSubmitting.value = false;
  }
}

function nextStep() {
  if (currentStep.value === 1) {
    generateMasterPlan();
    return;
  }
  if (currentStep.value === 2) {
    currentStep.value = 3;
    runComplianceVerification();
    return;
  }
  currentStep.value = Math.min(3, currentStep.value + 1);
}

const canProceed = computed(() => {
  if (currentStep.value === 0 && formData.value.mode === 'viral') return !!formData.value.selectedTrend;
  if (currentStep.value === 1) return true;
  if (currentStep.value === 2) return !!masterPlan.value;
  return true;
});
</script>

<template>
  <el-dialog
    id="create-series-modal"
    :model-value="props.modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :fullscreen="true"
    class="!rounded-none !p-0 overflow-hidden"
    align-center
    destroy-on-close
    :show-close="false"
  >
    <template #header>
      <div class="px-5 py-3 flex items-center justify-between border-b" style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, var(--el-color-primary), #0ea5e9);">
            <el-icon :size="14" class="text-white"><Film /></el-icon>
          </div>
          <span class="text-xs font-black tracking-widest uppercase" style="color: var(--el-text-color-secondary);">{{ t('wizard.newSeries') }}</span>
        </div>

        <!-- Step Pills -->
        <div class="hidden md:flex items-center gap-1">
          <template v-for="(label, i) in stepLabels" :key="i">
            <div
              class="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all text-xs font-bold"
              :style="currentStep === i
                ? 'background-color: var(--el-color-primary-light-9); color: var(--el-color-primary); border: 1px solid var(--el-color-primary-light-5);'
                : i < currentStep
                  ? 'color: var(--el-color-primary); opacity: 0.8;'
                  : 'color: var(--el-text-color-placeholder);'"
              @click="i < currentStep ? (currentStep = i) : null"
            >
              <div
                class="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black shrink-0"
                :style="currentStep >= i ? 'background-color: var(--el-color-primary); color: #fff;' : 'background-color: var(--el-fill-color-light); color: var(--el-text-color-placeholder);'"
              >
                <el-icon v-if="i < currentStep" :size="10"><Check /></el-icon>
                <span v-else>{{ i + 1 }}</span>
              </div>
              <span class="uppercase tracking-widest hidden lg:block">{{ label }}</span>
            </div>
            <div v-if="i < 3" class="w-6 h-px" style="background-color: var(--el-border-color);"></div>
          </template>
        </div>

        <div class="flex items-center gap-2">
          <el-button plain round @click="emit('update:modelValue', false)">{{ t('wizard.close') }}</el-button>
          <el-button
            v-if="currentStep < 3"
            type="primary"
            round
            :loading="isGeneratingPlan"
            :disabled="!canProceed"
            icon="Right"
            @click="nextStep"
          >
            {{ currentStep === 1 ? t('wizard.generatePlan') : t('wizard.nextStep') }}
          </el-button>
          <el-button
            v-else
            id="create-series-submit"
            type="success"
            round
            :loading="isSubmitting"
            icon="Promotion"
            @click="handleFinish"
          >
            {{ t('wizard.createSeries') }}
          </el-button>
        </div>
      </div>
    </template>

    <div class="flex h-[calc(100vh-92px)]" style="background-color: var(--el-bg-color-page);">
      <!-- Left Sidebar -->
      <WizardSidebar :current-step="currentStep" />

      <!-- Main Content -->
      <main :class="currentStep === 2 ? 'flex-1 p-4 lg:p-6 overflow-hidden flex flex-col' : 'flex-1 p-8 lg:p-12 overflow-y-auto pb-32'">
        <WizardStepMode
          v-if="currentStep === 0"
          :form-data="formData"
        />

        <WizardStepConfig
          v-else-if="currentStep === 1"
          :form-data="formData"
        />

        <WizardStepMasterPlan
          v-else-if="currentStep === 2"
          :form-data="formData"
          :master-plan="masterPlan"
          :is-generating-plan="isGeneratingPlan"
          :plan-error="planError"
          :plan-chat-messages="planChatMessages"
          :is-plan-chat-sending="isPlanChatSending"
          :dynamic-suggestions="dynamicSuggestions"
          @generate-plan="generateMasterPlan"
          @send-chat="sendPlanChat"
          @retry-chat="retryPlanChat"
        />

        <WizardStepCompliance
          v-else-if="currentStep === 3"
          :form-data="formData"
          :compliance-result="complianceResult"
          :is-verifying-compliance="isVerifyingCompliance"
          :is-refining-from-suggestions="isRefiningFromSuggestions"
          @rescan-compliance="runComplianceVerification"
          @refine-suggestions="refineMasterPlanFromSuggestions"
        />
      </main>
    </div>
  </el-dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e5e7eb; border-radius: 10px; }
.dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #374151; }
:deep(.el-dialog__header) { padding: 0 !important; margin-right: 0 !important; }
:deep(.el-dialog__body) { padding: 0 !important; }
</style>
