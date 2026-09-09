<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useScriptStore } from '@/stores/useScriptStore';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';
import type { AssetVersion, Character, CharacterWardrobeVariant } from '@/types/api';
import http from '@/utils/http';
import AssetCustomizationDialog from '@/components/workspace/AssetCustomizationDialog.vue';

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();
const scriptStore = useScriptStore();
const activeEpisode = computed(() => seriesStore.activeEpisode);

// ─── Assets State (Characters, Locations, Props) ─────────────────────────────
const extractedCharacters = ref<any[]>([]);
const extractedLocations = ref<any[]>([]);
const extractedProps = ref<any[]>([]);
const isGeneratingAssetImage = ref<Record<string, boolean>>({});
const selectedWardrobeVariant = ref<Record<string, string>>({});

watch(
  () => [seriesStore.currentSeries, activeEpisode.value],
  () => {
    const s = seriesStore.currentSeries;
    const ep = activeEpisode.value;
    extractedCharacters.value = (ep?.characters && ep.characters.length > 0)
      ? ep.characters
      : (s?.characters || seriesStore.charactersList || []);

    extractedLocations.value = (ep?.locations && ep.locations.length > 0)
      ? ep.locations
      : (s?.locations || []);

    extractedProps.value = (ep?.props && ep.props.length > 0)
      ? ep.props
      : (s?.props || []);

    // Auto-select first wardrobe variant if not selected
    for (const c of extractedCharacters.value) {
      if (c && c.id && Array.isArray(c.wardrobe_variants) && c.wardrobe_variants.length > 0) {
        if (!selectedWardrobeVariant.value[c.id]) {
          selectedWardrobeVariant.value[c.id] = c.wardrobe_variants[0].variant_id;
        }
      }
    }
  },
  { immediate: true, deep: true }
);

function getActiveWardrobeDesc(char: Character) {
  const selectedId = selectedWardrobeVariant.value[char.id];
  const variants = char.wardrobe_variants;
  if (selectedId && Array.isArray(variants)) {
    const v = variants.find((wv: any) => wv.variant_id === selectedId);
    if (v) return v.clothing_and_accessories || '';
  }
  return char.clothing_and_accessories || '';
}

function getCharacterAvatar(char: Character | { id: string; name: string; avatar: string }): string {
  if (!char) return '';
  const master = seriesStore.getCharacterById(char.id || char.name);
  return master?.avatar || char.avatar || '';
}

function getActiveCharacterImage(char: Character): string {
  if (!char) return '';
  const selectedId = selectedWardrobeVariant.value[char.id];
  const variants = char.wardrobe_variants;
  if (selectedId && Array.isArray(variants)) {
    const v = variants.find((wv: CharacterWardrobeVariant) => wv.variant_id === selectedId);
    const img = v?.image_url;
    if (img) return img;
  }
  // Check if any wardrobe variant has a rendered image
  if (Array.isArray(variants) && variants.length > 0) {
    const activeV = variants.find((wv: CharacterWardrobeVariant) => wv.image_url);
    const img = activeV?.image_url;
    if (img) return img;
  }
  return getCharacterAvatar({
    id: char.id,
    name: char.name,
    avatar: '',
  });
}

function selectWardrobeVariant(charId: string, variantId: string) {
  selectedWardrobeVariant.value[charId] = variantId;
}

function getActiveWardrobeVariant(char: Character): CharacterWardrobeVariant | undefined {
  if (!char || !Array.isArray(char.wardrobe_variants) || char.wardrobe_variants.length === 0) return undefined;
  const selectedId = selectedWardrobeVariant.value[char.id];
  if (selectedId) {
    const found = char.wardrobe_variants.find((wv) => wv.variant_id === selectedId);
    if (found) return found;
  }
  return char.wardrobe_variants[0];
}

function handleSelectWardrobe(char: Character, wv: any) {
  selectWardrobeVariant(char.id, wv.variant_id);
  openCustomizer('wardrobe', char, wv);
}

function handleCustomizeCharacter(char: Character) {
  const activeWv = getActiveWardrobeVariant(char);
  if (activeWv) {
    openCustomizer('wardrobe', char, activeWv);
  } else {
    openCustomizer('character', char);
  }
}

// ─── Active AI Agent Lock State Helpers ─────────────────────────────────────
function isCharacterLocked(char: any): boolean {
  return !!(isGeneratingAssetImage.value[char.id] || pipelineStore.isItemRendering(char.name));
}

function isLocationLocked(loc: any): boolean {
  return !!(isGeneratingAssetImage.value[loc.id] || pipelineStore.isItemRendering(loc.name));
}

function isPropLocked(prop: any): boolean {
  return !!(isGeneratingAssetImage.value[prop.id] || pipelineStore.isItemRendering(prop.name));
}

// ─── Asset Customizer Modal State ──────────────────────────────────────────
const isCustomizerOpen = ref(false);
const customizerAssetType = ref<'character' | 'wardrobe' | 'location' | 'prop' | 'scene_frame'>('character');
const customizerAssetId = ref('');
const customizerVariantId = ref<string | undefined>(undefined);
const customizerTitle = ref('');
const customizerSubtitle = ref('');
const customizerInitialPrompt = ref('');
const customizerCurrentImageUrl = ref('');
const customizerVersions = ref<any[]>([]);
const customizerCharacterData = ref<any>(null);

function openCustomizer(type: 'character' | 'wardrobe' | 'location' | 'prop' | 'scene_frame', asset: any, variant?: any) {
  customizerAssetType.value = type;
  customizerAssetId.value = asset.id || asset.name;
  customizerVariantId.value = variant?.variant_id || variant?.id;
  customizerTitle.value = variant ? `${asset.name} - ${variant.name}` : (asset.title || asset.name || 'Asset');
  customizerSubtitle.value = variant?.clothing_and_accessories || asset.physical_characteristics || asset.description || asset.frame_visual || '';
  customizerCharacterData.value = (type === 'character' || type === 'wardrobe') ? asset : null;

  // Intelligent prompt resolution with multi-level fallbacks
  let initialPrompt = variant?.prompt || asset.prompt || '';
  if (!initialPrompt) {
    if (type === 'wardrobe') {
      const wardrobeDesc = variant?.clothing_and_accessories || variant?.description || '';
      initialPrompt = wardrobeDesc;
      // const charFeatures = asset.physical_characteristics || asset.traits || asset.visual_traits || '';
      // if (wardrobeDesc && charFeatures) {
      //   initialPrompt = `${asset.name}, ${charFeatures}, wearing ${wardrobeDesc}. Signature wardrobe outfit presentation, highly detailed.`;
      // } else if (wardrobeDesc) {
      //   initialPrompt = `${asset.name}, wearing ${wardrobeDesc}. Signature wardrobe outfit presentation, highly detailed.`;
      // }
    } else if (type === 'character') {
      const charFeatures = asset.physical_characteristics || asset.traits || asset.visual_traits || '';
      const wardrobeDesc = asset.clothing_and_accessories || '';
      initialPrompt = charFeatures || wardrobeDesc;
      //initialPrompt = [asset.name, charFeatures, wardrobeDesc ? `wearing ${wardrobeDesc}` : ''].filter(Boolean).join(', ');
    } else if (type === 'location') {
      const locationDesc = asset.physical_characteristics || asset.description || '';
      initialPrompt = locationDesc;
      //initialPrompt = [asset.name, asset.physical_characteristics, asset.time_of_day].filter(Boolean).join(', ');
    } else if (type === 'prop') {
      const propDesc = asset.physical_characteristics || asset.description || '';
      initialPrompt = propDesc;
      //initialPrompt = [asset.name, asset.physical_characteristics].filter(Boolean).join(', ');
    }
  }
  customizerInitialPrompt.value = initialPrompt;

  const currentImg = variant?.image_url || asset.image_url || asset.avatar || asset.storyboard_frame_url || '';
  customizerCurrentImageUrl.value = currentImg;

  let rawVersions: any[] = [];
  if (variant && Array.isArray(variant.versions) && variant.versions.length > 0) {
    rawVersions = [...variant.versions];
  } else if (Array.isArray(asset.versions) && asset.versions.length > 0) {
    rawVersions = [...asset.versions];
  }

  // Synthesize Version 1 if asset/wardrobe already has an active image but no version history array
  if (rawVersions.length === 0 && currentImg) {
    rawVersions = [
      {
        id: `v1_${customizerVariantId.value || customizerAssetId.value}`,
        image_url: currentImg,
        prompt: initialPrompt || customizerSubtitle.value || '',
        created_at: new Date().toISOString(),
        is_selected: true,
      }
    ];
  }

  customizerVersions.value = rawVersions;
  isCustomizerOpen.value = true;
}

function handleCustomizerUpdated(payload: { active_image_url: string; asset?: unknown; version: AssetVersion; versions?: AssetVersion[]; sub_asset?: string; variant_id?: string }) {
  toast.success(t('workspace.assetUpdated', 'Asset version updated successfully!'));

  const isCharOrWardrobe = customizerAssetType.value === 'wardrobe' || customizerAssetType.value === 'character' || payload.sub_asset === 'avatar' || payload.sub_asset === 'wardrobe';

  if (isCharOrWardrobe) {
    const charId = customizerAssetId.value;
    const char = extractedCharacters.value.find((c: any) => c.id === charId || c.name === charId);
    if (char) {
      if (payload.sub_asset === 'avatar' || (!payload.variant_id && !customizerVariantId.value)) {
        char.avatar = payload.active_image_url;
        char.image_url = payload.active_image_url;
        //if (payload.version?.prompt) char.prompt = payload.version.prompt;
        if (Array.isArray(payload.versions)) {
          char.versions = [...payload.versions];
        } else {
          if (!Array.isArray(char.versions)) char.versions = [];
          char.versions = char.versions.map((v: any) => ({ ...v, is_selected: false }));
          if (payload.version) {
            const idx = char.versions.findIndex((v: any) => v.id === payload.version.id);
            if (idx >= 0) char.versions[idx] = { ...payload.version, is_selected: true };
            else char.versions.push({ ...payload.version, is_selected: true });
          }
        }
      } else {
        const vId = payload.variant_id || customizerVariantId.value;
        if (Array.isArray(char.wardrobe_variants)) {
          const wv = char.wardrobe_variants.find((v: any) => v.variant_id === vId || v.id === vId);
          if (wv) {
            wv.image_url = payload.active_image_url;
            //if (payload.version?.prompt) wv.prompt = payload.version.prompt;
            if (Array.isArray(payload.versions)) {
              wv.versions = [...payload.versions];
            } else {
              if (!Array.isArray(wv.versions)) wv.versions = [];
              wv.versions = wv.versions.map((v: any) => ({ ...v, is_selected: false }));
              if (payload.version) {
                const idx = wv.versions.findIndex((v: any) => v.id === payload.version.id);
                if (idx >= 0) wv.versions[idx] = { ...payload.version, is_selected: true };
                else wv.versions.push({ ...payload.version, is_selected: true });
              }
            }
          }
        }
      }
    }
    saveEpisodeAssets();
  } else if (customizerAssetType.value === 'location') {
    const loc = extractedLocations.value.find((l: any) => l.id === customizerAssetId.value || l.name === customizerAssetId.value);
    if (loc) {
      loc.image_url = payload.active_image_url;
      //if (payload.version?.prompt) loc.prompt = payload.version.prompt;
      if (Array.isArray(payload.versions)) {
        loc.versions = [...payload.versions];
      } else {
        if (!Array.isArray(loc.versions)) loc.versions = [];
        loc.versions = loc.versions.map((v: any) => ({ ...v, is_selected: false }));
        if (payload.version) {
          const idx = loc.versions.findIndex((v: any) => v.id === payload.version.id);
          if (idx >= 0) loc.versions[idx] = { ...payload.version, is_selected: true };
          else loc.versions.push({ ...payload.version, is_selected: true });
        }
      }
    }
    saveEpisodeAssets();
  } else if (customizerAssetType.value === 'prop') {
    const prop = extractedProps.value.find((p: any) => p.id === customizerAssetId.value || p.name === customizerAssetId.value);
    if (prop) {
      prop.image_url = payload.active_image_url;
      //if (payload.version?.prompt) prop.prompt = payload.version.prompt;
      if (Array.isArray(payload.versions)) {
        prop.versions = [...payload.versions];
      } else {
        if (!Array.isArray(prop.versions)) prop.versions = [];
        prop.versions = prop.versions.map((v: any) => ({ ...v, is_selected: false }));
        if (payload.version) {
          const idx = prop.versions.findIndex((v: any) => v.id === payload.version.id);
          if (idx >= 0) prop.versions[idx] = { ...payload.version, is_selected: true };
          else prop.versions.push({ ...payload.version, is_selected: true });
        }
      }
    }
    saveEpisodeAssets();
  }

  if (seriesStore.currentSeries?.id) {
    seriesStore.loadWorkspaceData(seriesStore.currentSeries.id);
  }
}

async function saveEpisodeAssets() {
  const epId = activeEpisode.value?.id;
  const sId = seriesStore.currentSeries?.id;
  if (!epId || !sId) return;
  try {
    if (extractedCharacters.value.length > 0 || extractedLocations.value.length > 0 || extractedProps.value.length > 0) {
      await http.patch(`/series/${sId}`, {
        characters: extractedCharacters.value,
        locations: extractedLocations.value,
        props: extractedProps.value,
      });
    }
    await http.patch(`/series/${sId}/episodes/${epId}`, {
      reference_assets: {
        character_ids: extractedCharacters.value.map((c: any) => c.id || c.name),
        location_ids: extractedLocations.value.map((l: any) => l.id || l.name),
        prop_ids: extractedProps.value.map((p: any) => p.id || p.name),
      },
    });
  } catch (e) {
    console.warn('[saveEpisodeAssets] Failed to save assets to database:', e);
  }
}

function sendToChatbot(prompt: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trigger-chatbot-action', { detail: { prompt } }));
  }
}

async function confirmGenerationScope(customMessage?: string): Promise<'missing' | 'all' | 'cancel'> {
  try {
    const action = await ElMessageBox.confirm(
      customMessage || t('workspace.generationConfirmMessage', 'Do you want to render only missing items or re-render all items completely?'),
      t('workspace.generationConfirmTitle', 'Generation Scope'),
      {
        distinguishCancelAndClose: true,
        confirmButtonText: t('workspace.generateMissingOnly', 'Generate Missing Only (Fast)'),
        cancelButtonText: t('workspace.regenerateAll', 'Re-render All (Force)'),
        type: 'info',
        roundButton: true,
      }
    );
    return action === 'confirm' ? 'missing' : 'all';
  } catch (action) {
    if (action === 'cancel') {
      return 'all';
    }
    return 'cancel';
  }
}

async function handleRenderCharacters(agentMode = true) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-render all character wardrobe variants for this episode');
    } else {
      sendToChatbot('Generate all character wardrobe variants missing images for this episode');
    }
    return;
  }
  for (const char of extractedCharacters.value) {
    const hasCharImage = !!char.avatar;
    const variants = char.wardrobe_variants || [];
    if (variants.length > 0) {
      for (const variant of variants) {
        if (variant.image_url) continue;
        if (variants.length === 1 && hasCharImage) {
          variant.image_url = char.avatar;
          continue;
        }
        await handleGenerateCharacterSheet(char, variant.variant_id);
      }
    }
    if (!char.avatar) {
      await handleGenerateCharacterSheet(char);
    }
  }
}

async function handleRenderLocations(agentMode = true) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-render all location environment sheets for this episode');
    } else {
      sendToChatbot('Generate all location environment sheets missing images for this episode');
    }
    return;
  }
  for (const loc of extractedLocations.value) {
    if (loc.image_url) continue;
    await handleGenerateLocationSheet(loc);
  }
}

async function handleRenderProps(agentMode = true) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-render all prop product shots for this episode');
    } else {
      sendToChatbot('Generate all prop product shots missing images for this episode');
    }
    return;
  }
  for (const prop of extractedProps.value) {
    if (prop.image_url) continue;
    await handleGeneratePropSheet(prop);
  }
}

async function handleGenerateCharacterSheet(char: Character, variantId?: string, agentMode = true) {
  isGeneratingAssetImage.value[char.id] = true;
  try {
    const selectedVariantId = variantId || selectedWardrobeVariant.value[char.id];
    const matchedVariant = char.wardrobe_variants?.find((wv: any) => wv.variant_id === selectedVariantId);
    const wardrobeToUse = matchedVariant?.clothing_and_accessories || char.clothing_and_accessories || '';
    const variantLabel = matchedVariant ? ` (${matchedVariant.name})` : '';
    if (agentMode) {
      sendToChatbot(`Generate character sheet for "${char.name}"${variantLabel}`);
      return;
    }
    toast.info(`${t('workspace.generatingSheet', 'Generating Character Sheet')} (${char.name}${variantLabel})...`);

    // Retrieve existing facial portrait from Series Cast or character avatar
    const matchedCast = (seriesStore.charactersList || []).find(
      (c: any) => c.name?.toLowerCase().trim() === char.name?.toLowerCase().trim() || c.id === char.id
    );

    const referenceAvatar = matchedCast?.avatar || '';
    const resolvedPhysical = char.physical_characteristics || matchedCast?.visual_traits || matchedCast?.physical_characteristics || matchedCast?.appearance || matchedCast?.traits || '';

    const res = await scriptStore.generateCharacterSheet({
      character_id: char.id || char.name,
      series_id: seriesStore.currentSeries?.id || '',
      variant_id: selectedVariantId || '',
      physical_characteristics: resolvedPhysical,
      clothing_and_accessories: wardrobeToUse,
      visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
      reference_image_url: referenceAvatar || undefined,
    });

    if (matchedVariant) {
      matchedVariant.image_url = res.image_url;
      //if (res.prompt) matchedVariant.prompt = res.prompt;
      if (!Array.isArray(matchedVariant.versions)) matchedVariant.versions = [];
      if (res.version) {
        matchedVariant.versions.push(res.version);
      }
    }

    await saveEpisodeAssets();
    toast.success(`${t('workspace.sheetReady', 'Character sheet ready')} (${char.name}${variantLabel})`);
  } catch (err: any) {
    toast.error(`${t('common.error', 'Error')}: ${err.message}`);
  } finally {
    isGeneratingAssetImage.value[char.id] = false;
  }
}

async function handleGenerateLocationSheet(loc: any, agentMode = true) {
  isGeneratingAssetImage.value[loc.id] = true;
  try {
    if (agentMode) {
      sendToChatbot(`Generate location visual sheet for "${loc.name}"`);
      return;
    }
    toast.info(`${t('workspace.generatingSheet', 'Generating Location Sheet')} (${loc.name})...`);
    const res = await scriptStore.generateLocationSheet({
      location_id: loc.id || loc.name,
      series_id: seriesStore.currentSeries?.id || '',
      physical_characteristics: loc.physical_characteristics,
      time_of_day: loc.time_of_day,
      visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
    });
    loc.image_url = res.image_url;
    //if (res.prompt) loc.prompt = res.prompt;
    if (!Array.isArray(loc.versions)) loc.versions = [];
    if (res.version) loc.versions.push(res.version);
    await saveEpisodeAssets();
    toast.success(`${t('workspace.sheetReady', 'Location sheet ready')} (${loc.name})`);
  } catch (err: any) {
    toast.error(`${t('common.error', 'Error')}: ${err.message}`);
  } finally {
    isGeneratingAssetImage.value[loc.id] = false;
  }
}

async function handleGeneratePropSheet(prop: any, agentMode = true) {
  isGeneratingAssetImage.value[prop.id] = true;
  try {
    if (agentMode) {
      sendToChatbot(`Generate prop product shot for "${prop.name}"`);
      return;
    }
    toast.info(`${t('workspace.generatingSheet', 'Generating Prop Shot')} (${prop.name})...`);
    const res = await scriptStore.generatePropSheet({
      prop_id: prop.id || prop.name,
      series_id: seriesStore.currentSeries?.id || '',
      physical_characteristics: prop.physical_characteristics,
      visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
    });
    prop.image_url = res.image_url;
    //if (res.prompt) prop.prompt = res.prompt;
    if (!Array.isArray(prop.versions)) prop.versions = [];
    if (res.version) prop.versions.push(res.version);
    await saveEpisodeAssets();
    toast.success(`${t('workspace.sheetReady', 'Prop shot ready')} (${prop.name})`);
  } catch (err: any) {
    toast.error(`${t('common.error', 'Error')}: ${err.message}`);
  } finally {
    isGeneratingAssetImage.value[prop.id] = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 1. Characters Section (2-in-1 Sheet: Portrait + Full Body) -->
    <div class="p-4 rounded-2xl border shadow-soft space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-color-primary);">
          <el-icon :size="14"><User /></el-icon> {{ t('workspace.characters', 'Characters') }} ({{ extractedCharacters.length }})
        </h3>
        <el-button link type="primary" size="small" icon="MagicStick" @click="handleRenderCharacters(true)">
          {{ t('workspace.autofill', 'Autofill') }}
        </el-button>
      </div>

      <div v-if="extractedCharacters.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <el-card
          v-for="char in extractedCharacters"
          :key="char.id"
          v-loading="isCharacterLocked(char)"
          class="!rounded-xl"
          :body-style="{ padding: '10px', overflow: 'hidden' }"
        >
          <!-- 2-in-1 Preview / Placeholder -->
          <div class="w-full aspect-[4/3] rounded-lg border overflow-hidden relative flex items-center justify-center" style="border-color: var(--el-border-color);">
            <el-image
              :src="getActiveCharacterImage(char)"
              :preview-src-list="[getActiveCharacterImage(char)]"
              :alt="char.name"
              class="w-full h-full"
              fit="cover"
            >
              <template #error>
                <div class="flex flex-col items-center justify-center p-2 text-center h-full">
                  <el-icon :size="24"><User /></el-icon>
                  <span class="text-[9px] font-medium" style="color: var(--el-text-color-placeholder);">{{ t('workspace.noRenderYet') }}</span>
                </div>
              </template>
            </el-image>
          </div>

          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center gap-2 min-w-0">
              <el-avatar
                v-if="getCharacterAvatar(char)"
                :size="22"
                :src="getCharacterAvatar(char)"
                shape="circle"
                class="border border-white/20 bg-black/40 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                :title="t('workspace.customizeAvatar', 'Customize Character Avatar')"
                @click.stop="openCustomizer('character', char)"
              />
              <span class="font-bold text-xs truncate" style="color: var(--el-text-color-primary);">{{ char.name }}</span>
            </div>
          </div>
          <p v-if="char.physical_characteristics" :title="char.physical_characteristics" class="text-[10px] line-clamp-2 leading-tight mt-2" style="color: var(--el-text-color-secondary);">
            <strong style="color: var(--el-text-color-primary);">Face/Body:</strong> {{ char.physical_characteristics }}
          </p>
          <p class="text-[10px] line-clamp-2 leading-tight mt-1" :title="getActiveWardrobeDesc(char)" style="color: var(--el-text-color-secondary);">
            <strong style="color: var(--el-text-color-primary);">Wardrobe:</strong> {{ getActiveWardrobeDesc(char) }}
          </p>
          <div v-if="char.wardrobe_variants && char.wardrobe_variants.length > 0" :title="getActiveWardrobeDesc(char)" class="flex gap-1 flex-wrap items-center mt-2">
            <span class="text-[9px] font-semibold opacity-70">Wardrobe:</span>
            <el-tag
              v-for="wv in char.wardrobe_variants"
              :key="wv.variant_id"
              size="small"
              :type="selectedWardrobeVariant[char.id] === wv.variant_id ? 'primary' : 'warning'"
              :effect="selectedWardrobeVariant[char.id] === wv.variant_id ? 'dark' : 'plain'"
              round
              class="text-[8px] cursor-pointer hover:opacity-80 transition-opacity"
              :title="t('workspace.customizeWardrobe', 'Customize this wardrobe')"
              @click="handleSelectWardrobe(char, wv)"
            >
              👔 {{ wv.name }}
            </el-tag>
          </div>

          <div class="flex flex-col items-center gap-1.5 mt-2">
            <el-button
              size="small"
              round
              type="primary"
              :plain="!!getActiveCharacterImage(char)"
              :icon="getActiveCharacterImage(char) ? 'RefreshLeft' : 'Picture'"
              :loading="isCharacterLocked(char)"
              :disabled="isCharacterLocked(char)"
              class="!flex-1 !text-[10px] w-full"
              @click="handleGenerateCharacterSheet(char)"
            >
              {{ isCharacterLocked(char) ? 'Rendering...' : (getActiveCharacterImage(char) ? t('workspace.reRender', 'Re-render') : t('workspace.render', 'Render')) }}
            </el-button>
            <el-button
              size="small"
              round
              icon="EditPen"
              class="!text-[10px] w-full !ml-0"
              :title="t('workspace.customizeTooltip', 'Advanced Customization (Custom Prompt & Version Selection)')"
              @click="handleCustomizeCharacter(char)"
            >
              {{ t('workspace.customize', 'Customize') }}
            </el-button>
          </div>
        </el-card>
      </div>
      <div v-else class="p-4 rounded-xl border border-dashed text-center text-xs" style="border-color: var(--el-border-color); color: var(--el-text-color-placeholder);">
        {{ t('workspace.noCharactersYet', 'No characters extracted yet. Click "Analysis" in the Script tab.') }}
      </div>
    </div>

    <!-- 2. Locations Section (4-in-1 Sheet: 1 Wide + 3 Perspectives) -->
    <div class="p-4 rounded-2xl border shadow-soft space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-color-primary);">
          <el-icon :size="14"><Location /></el-icon> {{ t('workspace.locations', 'Locations') }} ({{ extractedLocations.length }})
        </h3>
        <el-button link type="primary" size="small" icon="MagicStick" @click="handleRenderLocations(true)">
          {{ t('workspace.autofill', 'Autofill') }}
        </el-button>
      </div>

      <div v-if="extractedLocations.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <el-card
          v-for="loc in extractedLocations"
          :key="loc.id"
          v-loading="isLocationLocked(loc)"
          :body-style="{ padding: '10px', overflow: 'hidden' }"
          class="!rounded-xl"
        >
          <!-- 4-in-1 Sheet Preview -->
          <div class="w-full aspect-[4/3] rounded-lg border overflow-hidden relative flex items-center justify-center" style="border-color: var(--el-border-color);">
            <el-image :src="loc.image_url" :preview-src-list="loc.image_url ? [loc.image_url] : []" :alt="loc.name" class="w-full h-full" fit="cover">
              <template #error>
                <div class="flex flex-col items-center justify-center p-2 text-center h-full">
                  <el-icon :size="24"><Location /></el-icon>
                  <span class="text-[9px] font-medium" style="color: var(--el-text-color-placeholder);">{{ t('workspace.noRenderYet') }}</span>
                </div>
              </template>
            </el-image>
            <el-tag size="small" effect="plain" round class="absolute top-2 right-2">{{ loc.time_of_day || 'Daytime' }}</el-tag>
          </div>

          <div class="flex justify-between items-center mt-2">
            <span class="font-bold text-xs" style="color: var(--el-text-color-primary);">{{ loc.name }}</span>
          </div>
          <p class="text-[10px] line-clamp-2 leading-tight mt-1" :title="loc.physical_characteristics" style="color: var(--el-text-color-secondary);">
            {{ loc.physical_characteristics }}
          </p>

          <div class="flex flex-col items-center gap-1.5 mt-2">
            <el-button
              size="small"
              round
              type="primary"
              :plain="!!loc.image_url"
              :icon="loc.image_url ? 'RefreshLeft' : 'Picture'"
              :loading="isLocationLocked(loc)"
              :disabled="isLocationLocked(loc)"
              class="!flex-1 !text-[10px] w-full"
              @click="handleGenerateLocationSheet(loc)"
            >
              {{ isLocationLocked(loc) ? 'Rendering...' : (loc.image_url ? t('workspace.reRender', 'Re-render') : t('workspace.render', 'Render')) }}
            </el-button>
            <el-button
              size="small"
              round
              icon="EditPen"
              class="!text-[10px] w-full !ml-0"
              :title="t('workspace.customizeTooltip', 'Advanced Customization (Custom Prompt & Version Selection)')"
              @click="openCustomizer('location', loc)"
            >
              {{ t('workspace.customize', 'Customize') }}
            </el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 3. Props Section (Isolated Product Shots) -->
    <div class="p-4 rounded-2xl border shadow-soft space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-color-primary);">
          <el-icon :size="14"><Box /></el-icon> {{ t('workspace.props', 'Props & Objects') }} ({{ extractedProps.length }})
        </h3>
        <el-button link type="primary" size="small" icon="MagicStick" @click="handleRenderProps(true)">
          {{ t('workspace.autofill', 'Autofill') }}
        </el-button>
      </div>

      <div v-if="extractedProps.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <el-card
          v-for="prop in extractedProps"
          :key="prop.id"
          v-loading="isPropLocked(prop)"
          :body-style="{ padding: '10px', overflow: 'hidden' }"
          class="!rounded-xl"
        >
          <!-- Product Shot Preview -->
          <div class="w-full aspect-[16/9] rounded-lg border overflow-hidden relative flex items-center justify-center" style="border-color: var(--el-border-color);">
            <el-image :src="prop.image_url" :preview-src-list="prop.image_url ? [prop.image_url] : []" :alt="prop.name" class="w-full h-full" fit="cover">
              <template #error>
                <div class="flex flex-col items-center justify-center p-2 text-center h-full">
                  <el-icon :size="24"><Box /></el-icon>
                  <span class="text-[9px] font-medium" style="color: var(--el-text-color-placeholder);">{{ t('workspace.noRenderYet') }}</span>
                </div>
              </template>
            </el-image>
          </div>

          <div class="flex items-center justify-between mt-2">
            <span class="font-bold text-xs" style="color: var(--el-text-color-primary);">{{ prop.name }}</span>
          </div>
          <p class="text-[10px] line-clamp-2 leading-tight mt-2" :title="prop.physical_characteristics" style="color: var(--el-text-color-secondary);">
            {{ prop.physical_characteristics }}
          </p>

          <div class="flex flex-col items-center gap-1.5 mt-2">
            <el-button
              size="small"
              round
              type="primary"
              :plain="!!prop.image_url"
              :icon="prop.image_url ? 'RefreshLeft' : 'Picture'"
              :loading="isPropLocked(prop)"
              :disabled="isPropLocked(prop)"
              class="!flex-1 !text-[10px] w-full"
              @click="handleGeneratePropSheet(prop)"
            >
              {{ isPropLocked(prop) ? 'Rendering...' : (prop.image_url ? t('workspace.reRender', 'Re-render') : t('workspace.render', 'Render')) }}
            </el-button>
            <el-button
              size="small"
              round
              icon="EditPen"
              class="!text-[10px] w-full !ml-0"
              :title="t('workspace.customizeTooltip', 'Advanced Customization (Custom Prompt & Version Selection)')"
              @click="openCustomizer('prop', prop)"
            >
              {{ t('workspace.customize', 'Customize') }}
            </el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- ─── Asset Advanced Customization Dialog ──────────────────────────────── -->
    <AssetCustomizationDialog
      v-model="isCustomizerOpen"
      :series-id="seriesStore.currentSeries?.id || ''"
      :episode-id="(seriesStore.activeEpisode as any)?.id || ''"
      :asset-type="customizerAssetType"
      :asset-id="customizerAssetId"
      :variant-id="customizerVariantId"
      :asset-title="customizerTitle"
      :asset-subtitle="customizerSubtitle"
      :initial-prompt="customizerInitialPrompt"
      :current-image-url="customizerCurrentImageUrl"
      :versions="customizerVersions"
      :character-data="customizerCharacterData"
      @updated="handleCustomizerUpdated"
    />
  </div>
</template>
