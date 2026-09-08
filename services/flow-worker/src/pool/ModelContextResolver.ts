/**
 * ModelContextResolver — Intelligent Context-Aware Engine for Google Flow
 * Provides complete support for all Google Flow video and image base models,
 * including Omni Flash, Veo 3.1 (T2V, I2V, R2V, Interpolation, Extend), and Gemini / Imagen models.
 */

import { GenerationJobRequest } from '../types.js';

export const VIDEO_BASE_MODELS: Record<string, { landscape: string; portrait: string }> = {
  // T2V models
  "veo_3_1_t2v_fast": {
    "landscape": "veo_3_1_t2v_fast_landscape",
    "portrait": "veo_3_1_t2v_fast_portrait",
  },
  "veo_3_1_t2v_fast_4s": {
    "landscape": "veo_3_1_t2v_fast_4s",
    "portrait": "veo_3_1_t2v_fast_portrait_4s",
  },
  "veo_3_1_t2v_fast_6s": {
    "landscape": "veo_3_1_t2v_fast_6s",
    "portrait": "veo_3_1_t2v_fast_portrait_6s",
  },
  "veo_3_1_t2v_fast_8s": {
    "landscape": "veo_3_1_t2v_fast_8s",
    "portrait": "veo_3_1_t2v_fast_portrait_8s",
  },
  "veo_3_1_t2v_fast_ultra": {
    "landscape": "veo_3_1_t2v_fast_ultra",
    "portrait": "veo_3_1_t2v_fast_portrait_ultra",
  },
  "veo_3_1_t2v_fast_ultra_relaxed": {
    "landscape": "veo_3_1_t2v_fast_ultra_relaxed",
    "portrait": "veo_3_1_t2v_fast_portrait_ultra_relaxed",
  },
  "veo_3_1_t2v": {
    "landscape": "veo_3_1_t2v_landscape",
    "portrait": "veo_3_1_t2v_portrait",
  },
  "veo_3_1_t2v_4s": {
    "landscape": "veo_3_1_t2v_4s",
    "portrait": "veo_3_1_t2v_portrait_4s",
  },
  "veo_3_1_t2v_6s": {
    "landscape": "veo_3_1_t2v_6s",
    "portrait": "veo_3_1_t2v_portrait_6s",
  },
  "veo_3_1_t2v_8s": {
    "landscape": "veo_3_1_t2v_8s",
    "portrait": "veo_3_1_t2v_portrait_8s",
  },
  "veo_3_1_t2v_4s_4k": {
    "landscape": "veo_3_1_t2v_4s_4k",
    "portrait": "veo_3_1_t2v_portrait_4s_4k",
  },
  "veo_3_1_t2v_4s_1080p": {
    "landscape": "veo_3_1_t2v_4s_1080p",
    "portrait": "veo_3_1_t2v_portrait_4s_1080p",
  },
  "veo_3_1_t2v_6s_4k": {
    "landscape": "veo_3_1_t2v_6s_4k",
    "portrait": "veo_3_1_t2v_portrait_6s_4k",
  },
  "veo_3_1_t2v_6s_1080p": {
    "landscape": "veo_3_1_t2v_6s_1080p",
    "portrait": "veo_3_1_t2v_portrait_6s_1080p",
  },
  "veo_3_1_t2v_8s_4k": {
    "landscape": "veo_3_1_t2v_8s_4k",
    "portrait": "veo_3_1_t2v_portrait_8s_4k",
  },
  "veo_3_1_t2v_8s_1080p": {
    "landscape": "veo_3_1_t2v_8s_1080p",
    "portrait": "veo_3_1_t2v_portrait_8s_1080p",
  },
  "veo_3_1_t2v_4k": {
    "landscape": "veo_3_1_t2v_4k",
    "portrait": "veo_3_1_t2v_portrait_4k",
  },
  "veo_3_1_t2v_1080p": {
    "landscape": "veo_3_1_t2v_1080p",
    "portrait": "veo_3_1_t2v_portrait_1080p",
  },
  "veo_3_1_t2v_lite": {
    "landscape": "veo_3_1_t2v_lite_landscape",
    "portrait": "veo_3_1_t2v_lite_portrait",
  },
  "veo_3_1_t2v_lite_4s": {
    "landscape": "veo_3_1_t2v_lite_4s_landscape",
    "portrait": "veo_3_1_t2v_lite_4s_portrait",
  },
  "veo_3_1_t2v_lite_6s": {
    "landscape": "veo_3_1_t2v_lite_6s_landscape",
    "portrait": "veo_3_1_t2v_lite_6s_portrait",
  },
  "veo_3_1_t2v_lite_8s": {
    "landscape": "veo_3_1_t2v_lite_8s_landscape",
    "portrait": "veo_3_1_t2v_lite_8s_portrait",
  },
  "omni": {
    "landscape": "omni",
    "portrait": "omni_portrait",
  },

  // I2V models
  "veo_3_1_i2v_s_fast_fl": {
    "landscape": "veo_3_1_i2v_s_fast_fl",
    "portrait": "veo_3_1_i2v_s_fast_portrait_fl",
  },
  "veo_3_1_i2v_s_fast_4s_fl": {
    "landscape": "veo_3_1_i2v_s_fast_4s_fl",
    "portrait": "veo_3_1_i2v_s_fast_portrait_4s_fl",
  },
  "veo_3_1_i2v_s_fast_6s_fl": {
    "landscape": "veo_3_1_i2v_s_fast_6s_fl",
    "portrait": "veo_3_1_i2v_s_fast_portrait_6s_fl",
  },
  "veo_3_1_i2v_s_fast_8s_fl": {
    "landscape": "veo_3_1_i2v_s_fast_8s_fl",
    "portrait": "veo_3_1_i2v_s_fast_portrait_8s_fl",
  },
  "veo_3_1_i2v_s_fast_ultra_fl": {
    "landscape": "veo_3_1_i2v_s_fast_ultra_fl",
    "portrait": "veo_3_1_i2v_s_fast_portrait_ultra_fl",
  },
  "veo_3_1_i2v_s_fast_ultra_relaxed": {
    "landscape": "veo_3_1_i2v_s_fast_ultra_relaxed",
    "portrait": "veo_3_1_i2v_s_fast_portrait_ultra_relaxed",
  },
  "veo_3_1_i2v_s": {
    "landscape": "veo_3_1_i2v_s_landscape",
    "portrait": "veo_3_1_i2v_s_portrait",
  },
  "veo_3_1_i2v_s_4s": {
    "landscape": "veo_3_1_i2v_s_4s",
    "portrait": "veo_3_1_i2v_s_portrait_4s",
  },
  "veo_3_1_i2v_s_6s": {
    "landscape": "veo_3_1_i2v_s_6s",
    "portrait": "veo_3_1_i2v_s_portrait_6s",
  },
  "veo_3_1_i2v_s_8s": {
    "landscape": "veo_3_1_i2v_s_8s",
    "portrait": "veo_3_1_i2v_s_portrait_8s",
  },
  "veo_3_1_i2v_s_4s_4k": {
    "landscape": "veo_3_1_i2v_s_4s_4k",
    "portrait": "veo_3_1_i2v_s_portrait_4s_4k",
  },
  "veo_3_1_i2v_s_4s_1080p": {
    "landscape": "veo_3_1_i2v_s_4s_1080p",
    "portrait": "veo_3_1_i2v_s_portrait_4s_1080p",
  },
  "veo_3_1_i2v_s_6s_4k": {
    "landscape": "veo_3_1_i2v_s_6s_4k",
    "portrait": "veo_3_1_i2v_s_portrait_6s_4k",
  },
  "veo_3_1_i2v_s_6s_1080p": {
    "landscape": "veo_3_1_i2v_s_6s_1080p",
    "portrait": "veo_3_1_i2v_s_portrait_6s_1080p",
  },
  "veo_3_1_i2v_s_8s_4k": {
    "landscape": "veo_3_1_i2v_s_8s_4k",
    "portrait": "veo_3_1_i2v_s_portrait_8s_4k",
  },
  "veo_3_1_i2v_s_8s_1080p": {
    "landscape": "veo_3_1_i2v_s_8s_1080p",
    "portrait": "veo_3_1_i2v_s_portrait_8s_1080p",
  },
  "veo_3_1_i2v_s_4k": {
    "landscape": "veo_3_1_i2v_s_4k",
    "portrait": "veo_3_1_i2v_s_portrait_4k",
  },
  "veo_3_1_i2v_s_1080p": {
    "landscape": "veo_3_1_i2v_s_1080p",
    "portrait": "veo_3_1_i2v_s_portrait_1080p",
  },
  "veo_3_1_i2v_lite": {
    "landscape": "veo_3_1_i2v_lite_landscape",
    "portrait": "veo_3_1_i2v_lite_portrait",
  },
  "veo_3_1_i2v_lite_4s": {
    "landscape": "veo_3_1_i2v_lite_4s_landscape",
    "portrait": "veo_3_1_i2v_lite_4s_portrait",
  },
  "veo_3_1_i2v_lite_6s": {
    "landscape": "veo_3_1_i2v_lite_6s_landscape",
    "portrait": "veo_3_1_i2v_lite_6s_portrait",
  },
  "veo_3_1_i2v_lite_8s": {
    "landscape": "veo_3_1_i2v_lite_8s_landscape",
    "portrait": "veo_3_1_i2v_lite_8s_portrait",
  },
  "veo_3_1_interpolation_lite": {
    "landscape": "veo_3_1_interpolation_lite_landscape",
    "portrait": "veo_3_1_interpolation_lite_portrait",
  },
  "veo_3_1_interpolation_lite_4s": {
    "landscape": "veo_3_1_interpolation_lite_4s_landscape",
    "portrait": "veo_3_1_interpolation_lite_4s_portrait",
  },
  "veo_3_1_interpolation_lite_6s": {
    "landscape": "veo_3_1_interpolation_lite_6s_landscape",
    "portrait": "veo_3_1_interpolation_lite_6s_portrait",
  },
  "veo_3_1_interpolation_lite_8s": {
    "landscape": "veo_3_1_interpolation_lite_8s_landscape",
    "portrait": "veo_3_1_interpolation_lite_8s_portrait",
  },

  // R2V models
  "veo_3_1_r2v_fast": {
    "landscape": "veo_3_1_r2v_fast",
    "portrait": "veo_3_1_r2v_fast_portrait",
  },
  "veo_3_1_r2v_fast_8s": {
    "landscape": "veo_3_1_r2v_fast_8s",
    "portrait": "veo_3_1_r2v_fast_portrait_8s",
  },
  "veo_3_1_r2v_fast_ultra": {
    "landscape": "veo_3_1_r2v_fast_ultra",
    "portrait": "veo_3_1_r2v_fast_portrait_ultra",
  },
  "veo_3_1_r2v_fast_ultra_8s": {
    "landscape": "veo_3_1_r2v_fast_ultra_8s",
    "portrait": "veo_3_1_r2v_fast_portrait_ultra_8s",
  },
  "veo_3_1_r2v_fast_ultra_relaxed": {
    "landscape": "veo_3_1_r2v_fast_ultra_relaxed",
    "portrait": "veo_3_1_r2v_fast_ultra_relaxed",
  },
  "veo_3_1_r2v_fast_ultra_relaxed_8s": {
    "landscape": "veo_3_1_r2v_fast_ultra_relaxed_8s",
    "portrait": "veo_3_1_r2v_fast_ultra_relaxed_8s",
  },

  // Extend models (video continuation)
  "veo_3_1_extend": {
    "landscape": "veo_3_1_extend",
    "portrait": "veo_3_1_extend_portrait",
  },
};

export const IMAGE_BASE_MODELS: Record<string, { internalKey: string; name: string }> = {
  // Gemini 3.0 Pro (GEM_PIX_2)
  "gemini-3.0-pro-image": { internalKey: "GEM_PIX_2", name: "Gemini 3.0 Pro Image (GEM_PIX_2)" },
  // Gemini 3.1 Flash (NARWHAL)
  "gemini-3.1-flash-image": { internalKey: "NARWHAL", name: "Gemini 3.1 Flash Image (NARWHAL)" },
  // Imagen 4.0 (IMAGEN_3_5)
  "imagen-4.0-generate-preview": { internalKey: "IMAGEN_3_5", name: "Imagen 4.0 Preview (IMAGEN_3_5)" },
};

export interface ResolvedContext {
  type: 'video' | 'image';
  mode: 't2v' | 'i2v' | 'r2v' | 'interpolation' | 'extend' | 'upsample' | 't2i' | 'i2i';
  aspectRatio: string;        // '9:16' | '16:9' | '1:1' | '4:3' | '3:4'
  resolvedModel: string;      // Canonical internal Flow model key
  baseModelKey: string;       // Matching base key in VIDEO_BASE_MODELS or IMAGE_BASE_MODELS
  agentPrompt: string;        // Formatted natural directive for Flow Agent
  estimatedCredits: number;   // 10 for Veo video, 1 for Image
  imagesToAttach: string[];   // Filtered images needed for this specific mode
}

export class ModelContextResolver {
  /**
   * Normalizes generic aspect ratios to standard strings
   */
  public static normalizeAspectRatio(ratio?: string, fallback: string = '9:16'): string {
    if (!ratio) return fallback;
    const clean = ratio.trim().toLowerCase();
    if (clean === '16:9' || clean.includes('landscape') || clean.includes('wide')) return '16:9';
    if (clean === '9:16' || clean.includes('portrait') || clean.includes('vertical')) return '9:16';
    if (clean === '1:1' || clean.includes('square')) return '1:1';
    if (clean === '4:3') return '4:3';
    if (clean === '3:4') return '3:4';
    return fallback;
  }

  /**
   * Infers video generation mode from model key and inputs
   */
  private static inferModeFromModelKey(key: string, imageCount: number, hasEnd: boolean): ResolvedContext['mode'] {
    if (key === 'omni' || key === 'omni_portrait') {
      return imageCount > 0 ? 'r2v' : 't2v';
    }
    if (key.includes('extend')) return 'extend';
    if (key.includes('interpolation')) return 'interpolation';
    if (key.includes('i2v')) return 'i2v';
    if (key.includes('r2v')) return 'r2v';
    if (key.includes('upsample') || key.includes('upsampler')) return 'upsample';
    if (hasEnd && imageCount >= 2) return 'interpolation';
    if (imageCount === 1) return 'i2v';
    if (imageCount > 1) return 'r2v';
    return 't2v';
  }

  /**
   * Selects and limits input images appropriate for each mode
   */
  private static selectImagesForMode(
    mode: ResolvedContext['mode'],
    input: Partial<GenerationJobRequest>,
    uniqueImages: string[]
  ): string[] {
    const extractUrl = (item: any) => (typeof item === 'string' ? item : (item?.url || ''));
    if (mode === 'interpolation') {
      const start = extractUrl(input.imageStart) || uniqueImages[0];
      const end = extractUrl(input.imageEnd) || uniqueImages[1];
      return [start, end].filter(Boolean) as string[];
    }
    if (mode === 'i2v' || mode === 'extend') {
      const first = extractUrl(input.imageStart) || uniqueImages[0];
      return first ? [first] : [];
    }
    if (mode === 'r2v') {
      return uniqueImages.slice(0, 3);
    }
    return uniqueImages.slice(0, 3);
  }

  /**
   * Intelligently resolves media type, generation mode, model key, and Flow prompt instructions
   */
  public static resolve(input: Partial<GenerationJobRequest>): ResolvedContext {
    const rawModel = (input.model || '').trim();
    const lowerModel = rawModel.toLowerCase().replace(/-/g, '_');
    const rawPrompt = (input.prompt || '').trim();

    // 1. Determine Aspect Ratio
    let aspectRatio = this.normalizeAspectRatio(input.aspectRatio, '9:16');
    if (lowerModel.includes('landscape') || lowerModel.includes('wide')) aspectRatio = '16:9';
    else if (lowerModel.includes('portrait') || lowerModel.includes('vertical')) aspectRatio = '9:16';
    else if (lowerModel.includes('square')) aspectRatio = '1:1';

    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';

    // 2. Aggregate all reference / input images
    const extractUrl = (item: any) => (typeof item === 'string' ? item : (item?.url || ''));
    const allImages = [
      ...(Array.isArray((input as any).namedReferences) ? (input as any).namedReferences.map((r: any) => extractUrl(r)).filter(Boolean) : []),
      ...(Array.isArray(input.images) ? input.images.map(extractUrl).filter(Boolean) : []),
      ...(Array.isArray(input.referenceImages) ? input.referenceImages.map(extractUrl).filter(Boolean) : []),
      ...(Array.isArray(input.characterReferences) ? input.characterReferences.map(extractUrl).filter(Boolean) : []),
      ...(Array.isArray((input as any).imageInputs) ? (input as any).imageInputs.map(extractUrl).filter(Boolean) : []),
      extractUrl(input.imageStart),
      extractUrl(input.imageEnd),
    ].filter(Boolean) as string[];

    const uniqueImages = Array.from(new Set(allImages));
    const hasStart = Boolean(input.imageStart);
    const hasEnd = Boolean(input.imageEnd);
    const hasCharacterRefs = Boolean(input.characterReferences && input.characterReferences.length > 0);

    // 3. Determine if Image or Video
    const isExplicitImage = input.type === 'image' ||
      lowerModel.includes('image') ||
      lowerModel.includes('imagen') ||
      lowerModel.includes('narwhal') ||
      lowerModel.includes('gem_pix') ||
      lowerModel.includes('preview');

    const type: 'video' | 'image' = isExplicitImage ? 'image' : 'video';
    let mode: ResolvedContext['mode'] = 't2v';
    let resolvedModel = 'veo_3_1_t2v_fast_portrait';
    let baseModelKey = 'veo_3_1_t2v_fast';
    let imagesToAttach: string[] = [];

    if (type === 'image') {
      mode = uniqueImages.length > 0 ? 'i2i' : 't2i';
      imagesToAttach = uniqueImages.slice(0, 5);

      const normalizedImgModel = rawModel.toLowerCase().trim();
      if (IMAGE_BASE_MODELS[normalizedImgModel]) {
        baseModelKey = normalizedImgModel;
        resolvedModel = IMAGE_BASE_MODELS[normalizedImgModel].internalKey;
      } else if (normalizedImgModel.includes('3.0') || normalizedImgModel.includes('3_0') || normalizedImgModel.includes('gem_pix')) {
        baseModelKey = 'gemini-3.0-pro-image';
        resolvedModel = IMAGE_BASE_MODELS['gemini-3.0-pro-image'].internalKey;
      } else if (normalizedImgModel.includes('3.1') || normalizedImgModel.includes('3_1') || normalizedImgModel.includes('narwhal')) {
        baseModelKey = 'gemini-3.1-flash-image';
        resolvedModel = IMAGE_BASE_MODELS['gemini-3.1-flash-image'].internalKey;
      } else {
        baseModelKey = 'imagen-4.0-generate-preview';
        resolvedModel = IMAGE_BASE_MODELS['imagen-4.0-generate-preview'].internalKey;
      }
    } else {
      // ── VIDEO MODEL RESOLUTION ─────────────────────────────────────────────

      // 1. Omni / Omni-Flash / Abra special support
      if (lowerModel.includes('omni') || lowerModel.includes('abra')) {
        baseModelKey = 'omni';
        resolvedModel = isPortrait ? VIDEO_BASE_MODELS['omni'].portrait : VIDEO_BASE_MODELS['omni'].landscape;
        mode = uniqueImages.length > 0 ? 'r2v' : 't2v';
        imagesToAttach = uniqueImages.slice(0, 3);
      } else {
        let matched = false;

        // 2. Check if rawModel or cleanKey is a BASE KEY in VIDEO_BASE_MODELS first
        const cleanBaseKey = rawModel.trim() || lowerModel.replace(/_(landscape|portrait)$/, '');
        if (VIDEO_BASE_MODELS[cleanBaseKey]) {
          baseModelKey = cleanBaseKey;
          resolvedModel = isPortrait ? VIDEO_BASE_MODELS[cleanBaseKey].portrait : VIDEO_BASE_MODELS[cleanBaseKey].landscape;
          mode = this.inferModeFromModelKey(cleanBaseKey, uniqueImages.length, hasEnd);
          imagesToAttach = this.selectImagesForMode(mode, input, uniqueImages);
          matched = true;
        }

        // 3. If not a base key, check if rawModel directly matches a concrete landscape/portrait value
        if (!matched) {
          for (const [bKey, variants] of Object.entries(VIDEO_BASE_MODELS)) {
            if (rawModel === variants.landscape || rawModel === variants.portrait) {
              baseModelKey = bKey;
              resolvedModel = rawModel;
              mode = this.inferModeFromModelKey(bKey, uniqueImages.length, hasEnd);
              imagesToAttach = this.selectImagesForMode(mode, input, uniqueImages);
              matched = true;
              break;
            }
          }
        }

        // 4. Smart Context-Aware Resolution if not explicitly specified
        if (!matched) {
          if (input.mode === 'extend' || lowerModel.includes('extend')) {
            baseModelKey = 'veo_3_1_extend';
            mode = 'extend';
            resolvedModel = isPortrait ? VIDEO_BASE_MODELS['veo_3_1_extend'].portrait : VIDEO_BASE_MODELS['veo_3_1_extend'].landscape;
            imagesToAttach = uniqueImages.slice(0, 1);
          } else if (hasStart && hasEnd && uniqueImages.length >= 2) {
            // Interpolation
            mode = 'interpolation';
            const durKey = input.duration === 4 ? '_4s' : input.duration === 6 ? '_6s' : input.duration === 8 ? '_8s' : '';
            baseModelKey = `veo_3_1_interpolation_lite${durKey}`;
            const target = VIDEO_BASE_MODELS[baseModelKey] || VIDEO_BASE_MODELS['veo_3_1_interpolation_lite'];
            resolvedModel = isPortrait ? target.portrait : target.landscape;
            imagesToAttach = [extractUrl(input.imageStart) || uniqueImages[0], extractUrl(input.imageEnd) || uniqueImages[1]].filter(Boolean);
          } else if (hasStart && !hasCharacterRefs && uniqueImages.length === 1) {
            // Image to Video (I2V)
            mode = 'i2v';
            const is4k = lowerModel.includes('4k') || input.resolution === '4k';
            const is1080p = lowerModel.includes('1080p') || input.resolution === '1080p';
            const dur = input.duration === 4 ? '4s' : input.duration === 6 ? '6s' : input.duration === 8 ? '8s' : '';

            let candidateKey = 'veo_3_1_i2v_s_fast_fl';
            if (is4k && dur) candidateKey = `veo_3_1_i2v_s_${dur}_4k`;
            else if (is1080p && dur) candidateKey = `veo_3_1_i2v_s_${dur}_1080p`;
            else if (is4k) candidateKey = 'veo_3_1_i2v_s_4k';
            else if (is1080p) candidateKey = 'veo_3_1_i2v_s_1080p';
            else if (dur) candidateKey = `veo_3_1_i2v_s_fast_${dur}_fl`;
            else if (lowerModel.includes('ultra_relaxed')) candidateKey = 'veo_3_1_i2v_s_fast_ultra_relaxed';
            else if (lowerModel.includes('ultra')) candidateKey = 'veo_3_1_i2v_s_fast_ultra_fl';
            else if (lowerModel.includes('lite')) candidateKey = 'veo_3_1_i2v_lite';

            baseModelKey = VIDEO_BASE_MODELS[candidateKey] ? candidateKey : 'veo_3_1_i2v_s_fast_fl';
            const target = VIDEO_BASE_MODELS[baseModelKey];
            resolvedModel = isPortrait ? target.portrait : target.landscape;
            imagesToAttach = [extractUrl(input.imageStart) || uniqueImages[0]].filter(Boolean);
          } else if (uniqueImages.length > 1 || hasCharacterRefs) {
            // Reference to Video (R2V)
            mode = 'r2v';
            const dur = input.duration === 8 ? '_8s' : '';
            let candidateKey = `veo_3_1_r2v_fast${dur}`;
            if (lowerModel.includes('ultra_relaxed')) candidateKey = `veo_3_1_r2v_fast_ultra_relaxed${dur}`;
            else if (lowerModel.includes('ultra')) candidateKey = `veo_3_1_r2v_fast_ultra${dur}`;

            baseModelKey = VIDEO_BASE_MODELS[candidateKey] ? candidateKey : 'veo_3_1_r2v_fast';
            const target = VIDEO_BASE_MODELS[baseModelKey];
            resolvedModel = isPortrait ? target.portrait : target.landscape;
            imagesToAttach = uniqueImages.slice(0, 3);
          } else {
            // Text to Video (T2V)
            mode = 't2v';
            const is4k = lowerModel.includes('4k') || input.resolution === '4k';
            const is1080p = lowerModel.includes('1080p') || input.resolution === '1080p';
            const dur = input.duration === 4 ? '4s' : input.duration === 6 ? '6s' : input.duration === 8 ? '8s' : '';

            let candidateKey = 'veo_3_1_t2v_fast';
            if (is4k && dur) candidateKey = `veo_3_1_t2v_${dur}_4k`;
            else if (is1080p && dur) candidateKey = `veo_3_1_t2v_${dur}_1080p`;
            else if (is4k) candidateKey = 'veo_3_1_t2v_4k';
            else if (is1080p) candidateKey = 'veo_3_1_t2v_1080p';
            else if (dur) candidateKey = `veo_3_1_t2v_fast_${dur}`;
            else if (lowerModel.includes('ultra_relaxed')) candidateKey = 'veo_3_1_t2v_fast_ultra_relaxed';
            else if (lowerModel.includes('ultra')) candidateKey = 'veo_3_1_t2v_fast_ultra';
            else if (lowerModel.includes('lite')) candidateKey = `veo_3_1_t2v_lite${dur ? `_${dur}` : ''}`;

            baseModelKey = VIDEO_BASE_MODELS[candidateKey] ? candidateKey : 'veo_3_1_t2v_fast';
            const target = VIDEO_BASE_MODELS[baseModelKey];
            resolvedModel = isPortrait ? target.portrait : target.landscape;
          }
        }
      }
    }

    // 5. Generate Natural Agent Directive Prompt
    const agentPrompt = this.buildAgentPrompt({
      type,
      mode,
      aspectRatio,
      prompt: rawPrompt,
      imageCount: imagesToAttach.length,
      duration: input.duration || 5,
      isOmni: baseModelKey === 'omni',
    });

    return {
      type,
      mode,
      aspectRatio,
      resolvedModel,
      baseModelKey,
      agentPrompt,
      estimatedCredits: type === 'video' ? 10 : 1,
      imagesToAttach,
    };
  }

  /**
   * Formats optimal natural language command for Google Flow AI Agent
   */
  private static buildAgentPrompt(params: {
    type: 'video' | 'image';
    mode: string;
    aspectRatio: string;
    prompt: string;
    imageCount: number;
    duration: number;
    isOmni?: boolean;
  }): string {
    const { type, mode, aspectRatio, prompt, imageCount, duration, isOmni } = params;
    const ratioDesc = aspectRatio === '9:16' ? 'vertical 9:16 portrait' : aspectRatio === '16:9' ? 'horizontal 16:9 widescreen' : `${aspectRatio}`;

    // Deduplicate repeated sentences or lines in prompt (e.g. repeated negative directives)
    const cleanPrompt = (prompt || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .filter((line, idx, arr) => arr.indexOf(line) === idx)
      .join('\n');

    if (type === 'video') {
      if (isOmni) {
        if (imageCount > 0) {
          return `Generate a fast multimodal ${ratioDesc} ${duration}s video using Omni reference images: ${cleanPrompt}`;
        }
        return `Generate a fast multimodal ${ratioDesc} ${duration}s video using Omni Flash: ${cleanPrompt}`;
      }
      if (mode === 'i2v' && imageCount > 0) {
        return `Create a ${ratioDesc} ${duration}s video starting from this image: ${cleanPrompt}`;
      }
      if (mode === 'interpolation' && imageCount >= 2) {
        return `Generate a smooth ${ratioDesc} video transition from the first image to the second image: ${cleanPrompt}`;
      }
      if (mode === 'r2v' && imageCount > 1) {
        return `Generate a ${ratioDesc} video keeping the character and style from the reference images: ${cleanPrompt}`;
      }
      if (mode === 'extend') {
        return `Continue and extend this ${ratioDesc} video seamlessly: ${cleanPrompt}`;
      }
      return `Generate a high quality ${ratioDesc} video of: ${cleanPrompt}`;
    } else {
      if (mode === 'i2i' && imageCount > 0) {
        return `Create a ${ratioDesc} image variation based on the reference images: ${cleanPrompt}`;
      }
      return `Generate a high quality ${ratioDesc} image of: ${cleanPrompt}`;
    }
  }

  /**
   * Complete list of all supported base models and concrete endpoints
   */
  public static getAllSupportedModels() {
    const list: Array<{
      id: string;
      baseModel: string;
      name: string;
      type: 'video' | 'image';
      mode: string;
      ratio: '9:16' | '16:9' | 'any';
    }> = [];

    // 1. Add all Video Models (Base + Concrete Landscape/Portrait)
    for (const [baseKey, variants] of Object.entries(VIDEO_BASE_MODELS)) {
      const mode = this.inferModeFromModelKey(baseKey, 0, false);
      const isOmni = baseKey === 'omni';
      const cleanName = isOmni 
        ? 'Google Flow Omni Flash' 
        : baseKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // Base alias entry
      list.push({
        id: baseKey,
        baseModel: baseKey,
        name: `${cleanName} (Auto Ratio)`,
        type: 'video',
        mode,
        ratio: 'any',
      });

      // Landscape concrete entry
      list.push({
        id: variants.landscape,
        baseModel: baseKey,
        name: `${cleanName} (Landscape 16:9)`,
        type: 'video',
        mode,
        ratio: '16:9',
      });

      // Portrait concrete entry
      list.push({
        id: variants.portrait,
        baseModel: baseKey,
        name: `${cleanName} (Portrait 9:16)`,
        type: 'video',
        mode,
        ratio: '9:16',
      });
    }

    // 2. Add all Image Models
    for (const [imageKey, info] of Object.entries(IMAGE_BASE_MODELS)) {
      list.push({
        id: imageKey,
        baseModel: imageKey,
        name: `${info.name} (Auto Ratio)`,
        type: 'image',
        mode: 't2i',
        ratio: 'any',
      });
      list.push({
        id: `${imageKey}-portrait`,
        baseModel: imageKey,
        name: `${info.name} (Portrait 9:16)`,
        type: 'image',
        mode: 't2i',
        ratio: '9:16',
      });
      list.push({
        id: `${imageKey}-landscape`,
        baseModel: imageKey,
        name: `${info.name} (Landscape 16:9)`,
        type: 'image',
        mode: 't2i',
        ratio: '16:9',
      });
    }

    return list;
  }

  /**
   * Curated list of popular model presets for UI dropdowns
   */
  public static getSupportedModels() {
    return [
      // Omni Flash
      { id: 'omni', name: 'Omni Flash (Fast Multimodal Video - Auto)', type: 'video', mode: 'omni', ratio: 'any' },
      { id: 'omni_portrait', name: 'Omni Flash Portrait (Fast Multimodal 9:16)', type: 'video', mode: 'omni', ratio: '9:16' },

      // Veo 3.1 T2V
      { id: 'veo_3_1_t2v_fast_portrait', name: 'Veo 3.1 Text to Video Fast (Portrait 9:16)', type: 'video', mode: 't2v', ratio: '9:16' },
      { id: 'veo_3_1_t2v_fast_landscape', name: 'Veo 3.1 Text to Video Fast (Landscape 16:9)', type: 'video', mode: 't2v', ratio: '16:9' },
      { id: 'veo_3_1_t2v_fast_4s', name: 'Veo 3.1 T2V Fast 4s (Auto)', type: 'video', mode: 't2v', ratio: 'any' },
      { id: 'veo_3_1_t2v_fast_6s', name: 'Veo 3.1 T2V Fast 6s (Auto)', type: 'video', mode: 't2v', ratio: 'any' },
      { id: 'veo_3_1_t2v_fast_8s', name: 'Veo 3.1 T2V Fast 8s (Auto)', type: 'video', mode: 't2v', ratio: 'any' },
      { id: 'veo_3_1_t2v_fast_ultra', name: 'Veo 3.1 T2V Fast Ultra Quality', type: 'video', mode: 't2v', ratio: 'any' },
      { id: 'veo_3_1_t2v_4k', name: 'Veo 3.1 T2V 4K High Resolution', type: 'video', mode: 't2v', ratio: 'any' },
      { id: 'veo_3_1_t2v_1080p', name: 'Veo 3.1 T2V 1080P HD', type: 'video', mode: 't2v', ratio: 'any' },

      // Veo 3.1 I2V
      { id: 'veo_3_1_i2v_s_fast_fl', name: 'Veo 3.1 Image to Video Fast (Landscape 16:9)', type: 'video', mode: 'i2v', ratio: '16:9' },
      { id: 'veo_3_1_i2v_s_fast_portrait_fl', name: 'Veo 3.1 Image to Video Fast (Portrait 9:16)', type: 'video', mode: 'i2v', ratio: '9:16' },
      { id: 'veo_3_1_i2v_s_fast_4s_fl', name: 'Veo 3.1 I2V Fast 4s (Auto)', type: 'video', mode: 'i2v', ratio: 'any' },
      { id: 'veo_3_1_i2v_s_fast_6s_fl', name: 'Veo 3.1 I2V Fast 6s (Auto)', type: 'video', mode: 'i2v', ratio: 'any' },
      { id: 'veo_3_1_i2v_s_fast_8s_fl', name: 'Veo 3.1 I2V Fast 8s (Auto)', type: 'video', mode: 'i2v', ratio: 'any' },

      // Veo 3.1 Interpolation & R2V
      { id: 'veo_3_1_interpolation_lite_portrait', name: 'Veo 3.1 Interpolation Start & End (Portrait 9:16)', type: 'video', mode: 'interpolation', ratio: '9:16' },
      { id: 'veo_3_1_interpolation_lite_landscape', name: 'Veo 3.1 Interpolation Start & End (Landscape 16:9)', type: 'video', mode: 'interpolation', ratio: '16:9' },
      { id: 'veo_3_1_r2v_fast_portrait', name: 'Veo 3.1 Reference Images to Video (Portrait 9:16)', type: 'video', mode: 'r2v', ratio: '9:16' },
      { id: 'veo_3_1_r2v_fast_landscape', name: 'Veo 3.1 Reference Images to Video (Landscape 16:9)', type: 'video', mode: 'r2v', ratio: '16:9' },
      { id: 'veo_3_1_extend', name: 'Veo 3.1 Video Continuation / Extend', type: 'video', mode: 'extend', ratio: 'any' },

      // Images
      { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image (Narwhal Auto)', type: 'image', mode: 't2i', ratio: 'any' },
      { id: 'gemini-3.1-flash-image-portrait', name: 'Gemini 3.1 Flash Image (Narwhal Portrait 9:16)', type: 'image', mode: 't2i', ratio: '9:16' },
      { id: 'gemini-3.1-flash-image-landscape', name: 'Gemini 3.1 Flash Image (Narwhal Landscape 16:9)', type: 'image', mode: 't2i', ratio: '16:9' },
      { id: 'gemini-3.0-pro-image', name: 'Gemini 3.0 Pro Image (GEM_PIX_2)', type: 'image', mode: 't2i', ratio: 'any' },
      { id: 'imagen-4.0-generate-preview', name: 'Imagen 4.0 Generate Preview (IMAGEN_3_5)', type: 'image', mode: 't2i', ratio: 'any' },
    ];
  }
}
