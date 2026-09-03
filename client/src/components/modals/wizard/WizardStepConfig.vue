<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVisualStyleStore } from '@/stores/useVisualStyleStore';
import { GENRE_OPTIONS } from '@/constants/genres';
import { GEMINI_SPEECH_LANGUAGES, getLanguageByCode } from '@/constants/geminiLanguages';
import CountryFlag from '@/components/common/CountryFlag.vue';
import { WizardFormData } from './types';
import { Check, UploadFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  formData: WizardFormData;
}>();

const { t } = useI18n();
const visualStyleStore = useVisualStyleStore();

const ratioOptions = ['9:16', '16:9', '4:3', '1:1'];

const allLanguages = GEMINI_SPEECH_LANGUAGES;
const selectedLanguageObj = computed(() => getLanguageByCode(props.formData.language));
const flagCode = computed(() => getLanguageByCode(props.formData.language));
function onLanguageSelectChange(langCode: string) {
  props.formData.language = langCode;
}

function formatDuration(totalSeconds: number): string {
  const sec = Number(totalSeconds) || 90;
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

// ─── Visual Styles Filtering ──────────────────────────────────────────────────
const styleCategories = computed(() => visualStyleStore.categories);
const selectedStyleCategory = ref<string>('All');
const styleSearchQuery = ref('');

const filteredVisualStyles = computed(() => {
  return visualStyleStore.styles.filter((s) => {
    const matchesCat =
      selectedStyleCategory.value === 'All'
        ? true
        : selectedStyleCategory.value === 'Featured'
        ? s.isFeatured
        : s.category === selectedStyleCategory.value;

    const query = styleSearchQuery.value.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.category.toLowerCase().includes(query);

    return matchesCat && matchesSearch;
  });
});

/** Map raw category string → i18n key */
function catI18nKey(cat: string): string {
  const map: Record<string, string> = {
    'All': 'styles.cat_all',
    'Featured': 'styles.cat_featured',
    'Realistic': 'styles.cat_realistic',
    'Animation': 'styles.cat_animation',
    '3D & CGI': 'styles.cat_3dcgi',
    'Illustrated': 'styles.cat_illustrated',
    'Artistic': 'styles.cat_artistic',
    'Retro': 'styles.cat_retro',
  };
  return map[cat] || '';
}
function tCat(cat: string): string {
  const key = catI18nKey(cat);
  return key ? (t(key) || cat) : cat;
}

// ─── Genres List ──────────────────────────────────────────────────────────────
const genresList = computed(() => {
  return GENRE_OPTIONS.map((g) => ({
    name: g.name,
    label: t(g.labelKey) || g.name,
    emoji: g.emoji,
    tagline: g.taglineKey ? (t(g.taglineKey) || g.tagline) : g.tagline,
    desc: g.descKey ? (t(g.descKey) || g.desc) : g.desc,
    image: g.image,
    badge: g.badgeKey ? (t(g.badgeKey) || g.badge) : g.badge,
  }));
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-10">
    <div>
      <h1 class="text-4xl font-black mb-2" style="color: var(--el-text-color-primary);">{{ t('wizard.stepSeriesConfigTitle') }}</h1>
      <p class="text-sm" style="color: var(--el-text-color-secondary);">{{ t('wizard.stepSeriesConfigDesc') }}</p>
    </div>

    <!-- Section 1: Genre & Story DNA (with visual cards) -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-black uppercase tracking-wider flex items-center gap-2" style="color: var(--el-text-color-primary);">
            <el-icon class="text-primary"><Film /></el-icon>
            {{ t('wizard.genreAndArchetype') }}
          </h2>
          <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">{{ t('wizard.themeSubtitle') }}</p>
        </div>
        <el-tag size="small" type="primary" effect="plain" round class="font-bold">
          {{ formData.genre }}
        </el-tag>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div
          v-for="g in genresList"
          :key="g.name"
          class="group cursor-pointer rounded-2xl border-2 transition-all overflow-hidden flex flex-col justify-between hover:shadow-lg relative"
          :style="formData.genre === g.name
            ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9);'
            : 'border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);'"
          @click="formData.genre = g.name"
        >
          <!-- Thumbnail Header -->
          <div class="h-28 w-full relative overflow-hidden bg-surface-container shrink-0">
            <img
              :src="g.image"
              :alt="g.name"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>

            <!-- Badges -->
            <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span class="text-xl filter drop-shadow-md">{{ g.emoji }}</span>
              <span v-if="g.badge" class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-500/90 text-white shadow-xs">
                {{ g.badge }}
              </span>
            </div>

            <!-- Selected Checkmark -->
            <div
              v-if="formData.genre === g.name"
              class="absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center bg-primary text-white shadow-md"
            >
              <el-icon :size="12"><Check /></el-icon>
            </div>

            <div class="absolute bottom-2 left-3 right-3 text-white">
              <div class="font-black text-xs tracking-tight drop-shadow-xs">{{ g.label }}</div>
              <div class="text-[10px] text-amber-300 font-semibold truncate">{{ g.tagline }}</div>
            </div>
          </div>

          <!-- Description -->
          <div class="p-3.5 flex-1 flex flex-col justify-between">
            <p class="text-[11px] leading-relaxed line-clamp-2" style="color: var(--el-text-color-secondary);">
              {{ g.desc }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: AI Video Visual Style (Frameloop AI Style Showcase) -->
    <div class="space-y-4 pt-4 border-t border-[var(--el-border-color)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-black uppercase tracking-wider flex items-center gap-2" style="color: var(--el-text-color-primary);">
            <el-icon class="text-amber-500"><MagicStick /></el-icon>
            {{ t('wizard.visualStyleHeading', { count: filteredVisualStyles.length }) }}
          </h2>
          <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">
            {{ t('wizard.visualStyleSubtitle') }}
          </p>
        </div>

        <!-- Search Style Input -->
        <el-input
          v-model="styleSearchQuery"
          :placeholder="t('wizard.searchStylesPlaceholder')"
          clearable
          size="small"
          style="max-width: 280px"
        >
          <template #prefix>
            <el-icon class="text-gray-400"><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <!-- Category Filter Chips -->
      <div class="flex flex-wrap items-center gap-1.5 pt-1">
        <el-button
          v-for="cat in styleCategories"
          :key="cat"
          size="small"
          round
          class="!ml-0"
          :type="selectedStyleCategory === cat ? 'primary' : ''"
          :plain="selectedStyleCategory !== cat"
          @click="selectedStyleCategory = cat"
        >
          {{ tCat(cat) }}
        </el-button>
      </div>

      <!-- Visual Styles Grid (5 cols on large screens, scrollable with max height) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
        <div
          v-for="s in filteredVisualStyles"
          :key="s.id"
          class="group cursor-pointer rounded-2xl border-2 transition-all overflow-hidden flex flex-col justify-between hover:shadow-lg relative"
          :style="formData.visualStyle === s.id
            ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9); box-shadow: 0 0 0 2px var(--el-color-primary-light-7);'
            : 'border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);'"
          @click="formData.visualStyle = s.id"
        >
          <!-- Thumbnail Box -->
          <div class="aspect-[4/3] w-full relative overflow-hidden bg-surface-container shrink-0">
            <img
              :src="s.image"
              :alt="s.name"
              class="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

            <!-- Category Tag -->
            <div class="absolute top-2 left-2">
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white border border-white/10">
                {{ tCat(s.category) }}
              </span>
            </div>

            <!-- Badge -->
            <div v-if="s.badge" class="absolute top-2 right-2">
              <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black shadow-xs">
                {{ t('styles.badge_' + s.badge.toLowerCase().replace(/\s+/g, '_')) || s.badge }}
              </span>
            </div>

            <!-- Selected Badge -->
            <div
              v-if="formData.visualStyle === s.id"
              class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-primary text-white shadow-md"
            >
              <el-icon :size="10"><Check /></el-icon>
            </div>
          </div>

          <!-- Info Box -->
          <div class="p-2.5 flex-1 flex flex-col justify-between">
            <h4 class="font-bold text-xs leading-snug line-clamp-1" style="color: var(--el-text-color-primary);">
              {{ t('styles.name_' + s.id) || s.name }}
            </h4>
            <p class="text-[10px] leading-tight line-clamp-2 mt-1" style="color: var(--el-text-color-secondary);">
              {{ t('styles.desc_' + s.id) || s.description }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Format & Timing (Aspect Ratio, Episodes, Duration) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-[var(--el-border-color)]">
      <!-- Aspect Ratio -->
      <div class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-text-color-secondary);">
          <el-icon class="text-xs"><FullScreen /></el-icon>
          {{ t('wizard.aspectRatio') }}
        </h3>
        <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('wizard.framingSubtitle') }}</p>
        <div class="grid grid-cols-2 gap-2">
          <el-button
            v-for="r in ratioOptions"
            :key="r"
            round
            size="small"
            class="!ml-0"
            :type="formData.ratio === r ? 'primary' : ''"
            :plain="formData.ratio !== r"
            @click="formData.ratio = r"
          >
            {{ r }} <span class="text-[10px] opacity-75 ml-1">{{ r === '9:16' ? '(TikTok)' : r === '16:9' ? '(YT/TV)' : '' }}</span>
          </el-button>
        </div>
      </div>

      <!-- Target Episodes -->
      <div class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-text-color-secondary);">
          <el-icon class="text-xs"><Files /></el-icon>
          {{ t('wizard.episodesLabel', { count: formData.targetEpisodes }) }}
        </h3>
        <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('wizard.totalChaptersSubtitle') }}</p>
        <el-slider v-model="formData.targetEpisodes" :min="10" :max="100" :step="2" />
        <div class="flex justify-between text-[10px] font-semibold" style="color: var(--el-text-color-placeholder);">
          <span>{{ t('wizard.episodesShortArc') }}</span><span>{{ t('wizard.episodesEpic') }}</span>
        </div>
      </div>

      <!-- Episode Duration -->
      <div class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-text-color-secondary);">
          <el-icon class="text-xs"><Timer /></el-icon>
          {{ t('wizard.durationPerEpHeading') }}: <span style="color: var(--el-color-primary);">{{ formatDuration(formData.episodeDurationSeconds) }}</span>
        </h3>
        <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('wizard.targetPaceSubtitle') }}</p>
        <el-slider
          v-model="formData.episodeDurationSeconds"
          :min="30"
          :max="600"
          :step="15"
          :format-tooltip="formatDuration"
        />
        <div class="flex justify-between text-[10px] font-semibold" style="color: var(--el-text-color-placeholder);">
          <span>{{ t('wizard.durationFlash') }}</span><span>{{ t('wizard.durationMiniSeries') }}</span>
        </div>
      </div>
    </div>

    <!-- Country & Story Description -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-black uppercase tracking-wider block" style="color: var(--el-text-color-secondary);">
            <el-icon class="text-primary mr-1"><ChatDotRound /></el-icon>
            {{ t('wizard.language') }}
          </label>
        </div>
        <el-select
          v-model="formData.language"
          class="w-full"
          size="large"
          filterable
          @change="onLanguageSelectChange"
        >
          <template #prefix>
            <CountryFlag :code="flagCode?.countryCode" :flag="flagCode?.flag" size="small" class="mr-1.5 shrink-0" />
          </template>
          <el-option
            v-for="l in allLanguages"
            :key="l.code"
            :label="`${l.language} - ${l.nativeName}`"
            :value="l.code"
          >
            <div class="flex items-center justify-between w-full">
              <span class="flex items-center gap-2">
                <CountryFlag :code="l.countryCode" :flag="l.flag" size="small" />
                <span class="font-medium text-xs">{{ l.language }}</span>
                <span class="text-[11px] text-gray-400">({{ l.nativeName }})</span>
              </span>
              <span class="text-xs font-mono font-bold" style="color: var(--el-color-primary);">{{ l.code }}</span>
            </div>
          </el-option>
        </el-select>
        <p class="text-[10px] text-[var(--el-text-color-secondary)] mt-1 flex items-center justify-between">
          <span>{{ t('wizard.aiNarrationScript') }}: <strong class="text-primary">{{ selectedLanguageObj?.nativeName || 'English' }}</strong></span>
        </p>
      </div>
      <div class="space-y-2">
        <label class="text-[11px] font-black uppercase tracking-wider block" style="color: var(--el-text-color-secondary);">{{ t('wizard.storyDescription') }}</label>
        <el-input v-model="formData.synopsis" type="textarea" :rows="3" :placeholder="t('wizard.storyDescPlaceholder')" />
      </div>
    </div>

    <!-- Reference Assets Upload -->
    <!-- <div class="space-y-3">
      <h3 class="text-xs font-black uppercase tracking-wider" style="color: var(--el-text-color-secondary);">{{ t('wizard.referenceAssets') }}</h3>
      <p class="text-xs" style="color: var(--el-text-color-placeholder);">{{ t('wizard.referenceAssetsDesc') }}</p>
      <el-upload drag multiple action="#" :auto-upload="false" accept=".jpg,.jpeg,.png,.webp,.mp4,.txt,.pdf,.docx" class="w-full">
        <el-icon class="el-icon--upload" :size="48"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          {{ t('wizard.dropFiles') }}
        </div>
        <template #tip>
          <div class="el-upload__tip text-center">
            {{ t('wizard.supportedAssetFormats') }}
          </div>
        </template>
      </el-upload>
    </div> -->
  </div>
</template>
