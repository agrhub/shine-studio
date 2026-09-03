<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import http from '@/utils/http';
import CountryFlag from '@/components/common/CountryFlag.vue';
import { WORLD_COUNTRIES, TOP_COUNTRIES, findCountry, type WorldCountry } from '@/constants/countries';
import { getLanguageByCode } from '@/constants/geminiLanguages';
import { WizardFormData } from './types';
import { Check, TrendCharts, MagicStick } from '@element-plus/icons-vue';

const props = defineProps<{
  formData: WizardFormData;
}>();

const { t, locale } = useI18n();

const viralTopics = ref<any[]>([]);
const isFetchingTrends = ref(false);
const trendsError = ref('');
const trendPage = ref(1);
const trendPageSize = ref(6);
const trendTotal = ref(0);

const popularCountries = computed(() => TOP_COUNTRIES.filter((c) => c.isPopular));
const allCountries = WORLD_COUNTRIES;

const selectedCountryObj = computed(() => findCountry(props.formData.country));
const selectedLanguageObj = computed(() => getLanguageByCode(props.formData.language));

function selectCountry(c: WorldCountry) {
  props.formData.country = c.name;
  props.formData.countryCode = c.code;
  props.formData.language = c.primaryLang || 'en-US';
  trendPage.value = 1;
}

function onCountrySelectChange(countryName: string) {
  const c = findCountry(countryName);
  props.formData.country = c.name;
  props.formData.countryCode = c.code;
  props.formData.language = c.primaryLang || 'en-US';
  trendPage.value = 1;
}

async function fetchViralTrends(pageNumber: number = 1) {
  isFetchingTrends.value = true;
  trendsError.value = '';
  trendPage.value = pageNumber;
  const currentLang = locale.value || localStorage.getItem('shine_language') || 'en';
  try {
    const targetCountry = props.formData.country || 'United States';
    const res: any = await http.get(`/ai/trends/viral-topics?region=${encodeURIComponent(targetCountry)}&lang=${currentLang}&page=${pageNumber}&pageSize=${trendPageSize.value}`);
    viralTopics.value = res?.data || [];
    if (res?.pagination) {
      trendTotal.value = res.pagination.total || viralTopics.value.length;
    } else {
      trendTotal.value = viralTopics.value.length;
    }
    if (viralTopics.value.length === 0) trendsError.value = t('wizard.noTrendsMsg');
  } catch {
    trendsError.value = t('wizard.trendsErrorMsg');
    viralTopics.value = [];
  } finally {
    isFetchingTrends.value = false;
  }
}

function selectTrend(topic: any) {
  props.formData.selectedTrend = topic;
  props.formData.title = topic.topic || topic.title;
  props.formData.synopsis = topic.description || topic.synopsis || topic.trope || '';
  if (topic.genre) props.formData.genre = topic.genre;
  if (topic.targetEpisodes) props.formData.targetEpisodes = topic.targetEpisodes;
  if (topic.country) {
    const c = findCountry(topic.country);
    props.formData.country = c.name;
    props.formData.countryCode = c.code;
    props.formData.language = c.primaryLang || 'en-US';
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-10">
    <div>
      <h1 class="text-4xl font-black mb-2" style="color: var(--el-text-color-primary);">{{ t('wizard.stepLaunchModeTitle') }}</h1>
      <p class="text-sm" style="color: var(--el-text-color-secondary);">{{ t('wizard.chooseLaunchModeDesc') }}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- Viral Trend Mode Card -->
      <div
        class="cursor-pointer rounded-2xl p-6 border-2 transition-all relative overflow-hidden"
        :style="formData.mode === 'viral'
          ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9);'
          : 'border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);'"
        @click="formData.mode = 'viral'"
      >
        <div v-if="formData.mode === 'viral'" class="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style="background-color: var(--el-color-primary);">
          <el-icon :size="10" class="text-white"><Check /></el-icon>
        </div>
        <h3 class="text-xl font-black mb-2" style="color: var(--el-text-color-primary);">{{ t('wizard.viralTrendMode') }}</h3>
        <p class="text-sm leading-relaxed mb-4" style="color: var(--el-text-color-secondary);">{{ t('wizard.viralTrendModeDesc') }}</p>
        <div class="flex flex-wrap gap-2">
          <el-tag size="small" type="danger" effect="plain" round class="font-bold uppercase text-[10px]">{{ t('wizard.realtimeData') }}</el-tag>
          <el-tag size="small" type="warning" effect="plain" round class="font-bold uppercase text-[10px]">{{ t('wizard.autoFill') }}</el-tag>
          <el-tag size="small" type="success" effect="plain" round class="font-bold uppercase text-[10px]">{{ t('wizard.viralSuccessMultiplier') }}</el-tag>
        </div>
      </div>

      <!-- Manual Mode Card -->
      <div
        class="cursor-pointer rounded-2xl p-6 border-2 transition-all relative overflow-hidden"
        :style="formData.mode === 'manual'
          ? 'border-color: #0ea5e9; background-color: rgba(14, 165, 233, 0.08);'
          : 'border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);'"
        @click="formData.mode = 'manual'"
      >
        <div v-if="formData.mode === 'manual'" class="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style="background-color: #0ea5e9;">
          <el-icon :size="10" class="text-white"><Check /></el-icon>
        </div>
        <h3 class="text-xl font-black mb-2" style="color: var(--el-text-color-primary);">{{ t('wizard.manualMode') }}</h3>
        <p class="text-sm leading-relaxed mb-4" style="color: var(--el-text-color-secondary);">{{ t('wizard.manualModeDesc') }}</p>
        <div class="flex flex-wrap gap-2">
          <el-tag size="small" type="primary" effect="plain" round class="font-bold uppercase text-[10px]">{{ t('wizard.fullControl') }}</el-tag>
          <el-tag size="small" type="info" effect="plain" round class="font-bold uppercase text-[10px]">{{ t('wizard.originalStory') }}</el-tag>
        </div>
      </div>
    </div>

    <!-- Viral: Main Language & Country Selector + Trends -->
    <div v-if="formData.mode === 'viral'" class="space-y-6">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-black flex items-center gap-2" style="color: var(--el-text-color-primary);">
            <el-icon class="text-primary"><ChatDotRound /></el-icon>
            {{ t('wizard.mainLangAndCountry') }}
          </h2>
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('wizard.langAndMarket') }}: <strong class="text-primary">{{ selectedLanguageObj?.nativeName || 'English' }} ({{ formData.country }})</strong>
          </span>
        </div>

        <!-- Popular Language / Country Chips -->
        <div class="flex flex-wrap items-center gap-2">
          <el-button
            v-for="c in popularCountries"
            :key="c.code"
            :type="formData.country === c.name ? 'primary' : ''"
            round plain class="!ml-0" size="small"
            @click="selectCountry(c)"
          >
            <CountryFlag :code="c.code" :flag="c.flag" size="small" />
            <span class="!ml-1">{{ c.nativeName }} ({{ c.name }})</span>
          </el-button>
        </div>

        <!-- Full Search & Dropdown + Scan Button -->
        <div class="flex flex-wrap items-center gap-3 pt-1">
          <div class="flex-1 min-w-[220px] max-w-[340px]">
            <el-select
              v-model="formData.country"
              :placeholder="t('wizard.searchLangPlaceholder')"
              filterable
              size="default"
              class="w-full"
              @change="onCountrySelectChange"
            >
              <template #prefix>
                <CountryFlag :code="selectedCountryObj.code" :flag="selectedCountryObj.flag" size="small" class="mr-1.5 shrink-0" />
              </template>
              <el-option
                v-for="c in allCountries"
                :key="c.code"
                :label="`${c.name} (${c.nativeName}) — ${c.primaryLang}`"
                :value="c.name"
              >
                <div class="flex items-center justify-between w-full">
                  <span class="flex items-center gap-2">
                    <CountryFlag :code="c.code" :flag="c.flag" size="small" />
                    <span class="font-medium text-xs">{{ c.name }}</span>
                    <span class="text-[11px] text-gray-400">({{ c.nativeName }})</span>
                  </span>
                  <span class="text-[10px] text-gray-500 font-mono font-bold">{{ c.primaryLang }}</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <el-button
            type="primary"
            icon="MagicStick"
            round
            :loading="isFetchingTrends"
            @click="() => fetchViralTrends()"
          >
            {{ isFetchingTrends ? t('wizard.scanning') : (t('wizard.fetchTrends') || 'Fetch Trends') }}
          </el-button>
        </div>
      </div>

      <!-- Loading State for Trends -->
      <div v-if="isFetchingTrends" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <el-card v-for="i in 3" :key="i" shadow="never" class="!rounded-2xl" style="background-color: var(--el-bg-color-overlay); border-color: var(--el-border-color);">
          <div class="animate-pulse space-y-3">
            <div class="h-4 rounded w-3/4" style="background-color: var(--el-fill-color-light);"></div>
            <div class="h-3 rounded" style="background-color: var(--el-fill-color-light);"></div>
            <div class="h-3 rounded w-2/3" style="background-color: var(--el-fill-color-light);"></div>
          </div>
        </el-card>
      </div>

      <div v-else-if="trendsError">
        <el-alert type="error" show-icon :closable="false" :title="trendsError" />
      </div>

      <!-- Viral Topics Grid -->
      <div v-else-if="viralTopics.length > 0">
        <h3 class="text-sm font-black mb-4 uppercase tracking-wider flex items-center gap-2" style="color: var(--el-text-color-primary);">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
          {{ t('wizard.liveTrendsMarket', { country: formData.country.toUpperCase() }) }}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="topic in viralTopics"
            :key="topic.id"
            class="cursor-pointer rounded-2xl border-2 p-5 transition-all hover:shadow-lg flex flex-col justify-between"
            :style="formData.selectedTrend?.id === topic.id
              ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9);'
              : 'border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);'"
            @click="selectTrend(topic)"
          >
            <div>
              <div class="flex justify-between items-start mb-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white" style="background: linear-gradient(135deg, #f87171, #fb923c);">
                  <el-icon :size="16"><TrendCharts /></el-icon>
                </div>
                <el-tag size="small" type="danger" effect="plain" round class="font-black text-[10px] uppercase">
                  {{ topic.hashtagVelocity || 'TRENDING' }}
                </el-tag>
              </div>
              <h4 class="font-black text-sm mb-1 leading-snug" style="color: var(--el-text-color-primary);">{{ topic.topic }}</h4>
              <p class="text-[11px] leading-relaxed mb-3" style="color: var(--el-text-color-secondary);">{{ topic.description || topic.competitorHook || topic.trope }}</p>
            </div>
            <div class="pt-3 border-t flex items-center justify-between" style="border-color: var(--el-border-color-light);">
              <span class="text-[10px] font-semibold" style="color: var(--el-text-color-placeholder);">{{ t('wizard.engagement') }}</span>
              <span class="text-sm font-black" style="color: var(--el-color-primary);">{{ topic.engagementScore || topic.engagement_score || 85 }}%</span>
            </div>
          </div>
        </div>

        <!-- Pagination for Wizard Modal Trends -->
        <div v-if="trendTotal > trendPageSize" class="mt-5 flex items-center justify-between gap-4 border-t border-[var(--el-border-color-light)] pt-3">
          <div class="text-[11px] text-[var(--el-text-color-secondary)]">
            {{ t('common.showing') }} {{ ((trendPage - 1) * trendPageSize) + 1 }} - {{ Math.min(trendPage * trendPageSize, trendTotal) }} / {{ trendTotal }}
          </div>
          <el-pagination
            v-model:current-page="trendPage"
            :page-size="trendPageSize"
            :total="trendTotal"
            layout="prev, pager, next"
            background
            small
            @current-change="(n: number) => fetchViralTrends(n)"
          />
        </div>
      </div>

      <div v-else>
        <el-empty :description="t('wizard.selectCountryAndFetch', { country: formData.country })" />
      </div>
    </div>

    <!-- Manual: Basic Info -->
    <div v-else class="space-y-5 w-full">
      <div>
        <label class="text-[11px] font-black uppercase tracking-wider block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('wizard.seriesTitle') }}</label>
        <el-input v-model="formData.title" :placeholder="t('wizard.seriesTitlePlaceholder')" size="large" />
      </div>
      <div>
        <label class="text-[11px] font-black uppercase tracking-wider block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('wizard.descriptionTopic') }}</label>
        <el-input v-model="formData.synopsis" type="textarea" :rows="4" :placeholder="t('wizard.descriptionPlaceholder')" />
      </div>
    </div>
  </div>
</template>
