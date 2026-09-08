import type {
  CharacterSeriesEntity,
  CharacterWardrobeVariant,
  LocationAsset,
  PropAsset,
  SceneEntity,
  EpisodeEntity,
} from '@/types.js';
import {
  CharacterSeriesEntitySchema,
  LocationAssetSchema,
  PropAssetSchema,
  SceneEntitySchema,
} from '@/schemas/AISchemas.js';
import { nanoid } from 'nanoid';

export interface DialogueLine {
  character: string;
  line: string;
  emotion?: string;
  speech_tone?: string;
  speech_start_sec?: number;
  speech_end_sec?: number;
}

export interface ExtractedMedia {
  url: string;
  mimeType: string;
  buffer?: Buffer;
}

export class EntityNormalizer {
  /**
   * Helper to format ExtractedMedia with consistent URL, MIME, and Buffer
   */
  private static toExtractedMedia(rawUrlOrBase64: string, defaultMime: string, isRawBase64 = false): ExtractedMedia | null {
    if (!rawUrlOrBase64 || typeof rawUrlOrBase64 !== 'string') return null;
    const trimmed = rawUrlOrBase64.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('data:')) {
      const parts = trimmed.split(';');
      const mime = parts[0].replace('data:', '') || defaultMime;
      const base64Index = trimmed.indexOf(';base64,');
      let buf: Buffer | undefined;
      if (base64Index !== -1) {
        const b64Data = trimmed.slice(base64Index + 8);
        try {
          buf = Buffer.from(b64Data, 'base64');
        } catch (_) {}
      }
      return { url: trimmed, mimeType: mime, buffer: buf };
    }

    if (isRawBase64) {
      let buf: Buffer | undefined;
      try {
        buf = Buffer.from(trimmed, 'base64');
      } catch (_) {}
      return {
        url: `data:${defaultMime};base64,${trimmed}`,
        mimeType: defaultMime,
        buffer: buf,
      };
    }

    // Direct HTTP(S) / GCS / Storage URI
    return {
      url: trimmed,
      mimeType: defaultMime,
    };
  }

  /**
   * Adaptive Image Extractor:
   * Handles Google GenAI, Vertex AI, Gemini API, and Google Flow response structures:
   * 1. String-first fast check (data:image URIs, imageBytes JSON, direct URLs, Google CDN)
   * 2. Candidate content parts (inlineData, fileData, markdown ![...], raw base64 PNG/JPEG/WEBP)
   * 3. Imagen 3 format (generatedImages / images)
   * 4. Google Flow format (media[].image, results[].image, generatedImage.fifeUrl)
   * 5. Deep recursive fallback scan
   */
  static extractImageFromResponse(response: any): ExtractedMedia | null {
    if (!response) return null;

    // 0. String-First Fast-Path: Inspect raw string / stringified JSON
    try {
      const rawStr = typeof response === 'string' ? response : JSON.stringify(response);

      // Fast check A: embedded data:image/... URI
      const dataUriMatch = rawStr.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
      if (dataUriMatch) {
        const fullMatch = dataUriMatch[0];
        const mime = fullMatch.split(';')[0].replace('data:', '') || 'image/png';
        return this.toExtractedMedia(fullMatch, mime);
      }

      // Fast check B: base64 imageBytes pattern in JSON
      const imageBytesMatch = rawStr.match(/"(?:imageBytes|image_bytes|bytesBase64Encoded|mediaBytes|b64_json)"\s*:\s*"([A-Za-z0-9+/=]{100,})"/);
      if (imageBytesMatch && imageBytesMatch[1]) {
        const mimeMatch = rawStr.match(/"(?:mimeType|mime_type)"\s*:\s*"([^"]+)"/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        return this.toExtractedMedia(imageBytesMatch[1], mime, true);
      }

      // Fast check C: Direct image extension URL (png, jpg, jpeg, webp, gif, svg)
      const httpsImageMatch = rawStr.match(/https?:\/\/[^\s"'\\]+\.(?:png|jpg|jpeg|webp|gif|svg)(?:\?[^\s"'\\]*)?/i);
      if (httpsImageMatch) {
        const ext = (httpsImageMatch[0].split('?')[0].split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return this.toExtractedMedia(httpsImageMatch[0], mime);
      }

      // Fast check D: Google Labs Fife URL / CDN
      const fifeMatch = rawStr.match(/"(?:fifeUrl|fife_url)"\s*:\s*"([^"]+)"/);
      if (fifeMatch && fifeMatch[1]) {
        return this.toExtractedMedia(fifeMatch[1], 'image/jpeg');
      }
    } catch (_) {}

    // 1. Standard candidate parts (Gemini / Vertex AI)
    const candidates = response?.candidates || response?.predictions || response?.data?.candidates || [];
    for (const cand of Array.isArray(candidates) ? candidates : [candidates]) {
      // 1a. Vertex AI direct prediction format
      if (cand?.bytesBase64Encoded && typeof cand.bytesBase64Encoded === 'string') {
        const mime = cand.mimeType || 'image/png';
        return this.toExtractedMedia(cand.bytesBase64Encoded, mime, true);
      }

      const parts = cand?.content?.parts || cand?.parts || [];
      for (const part of Array.isArray(parts) ? parts : [parts]) {
        // inlineData / inline_data
        const inline = part?.inlineData || part?.inline_data;
        if (inline?.data) {
          const mime = inline.mimeType || inline.mime_type || 'image/png';
          return this.toExtractedMedia(inline.data, mime, true);
        }

        // imageBytes / image_bytes directly on part
        const directBytes = part?.imageBytes || part?.image_bytes || part?.image?.imageBytes || part?.image?.image_bytes || part?.image?.bytesBase64Encoded;
        if (directBytes && typeof directBytes === 'string' && directBytes.length > 50) {
          const mime = part?.mimeType || part?.mime_type || part?.image?.mimeType || 'image/png';
          return this.toExtractedMedia(directBytes, mime, true);
        }

        // fileData / file_data URI
        const fileUri = part?.fileData?.fileUri || part?.file_data?.file_uri || part?.fileData?.uri || part?.image?.uri || part?.image?.gcsUri;
        if (fileUri && typeof fileUri === 'string' && (fileUri.startsWith('http://') || fileUri.startsWith('https://') || fileUri.startsWith('gs://'))) {
          return this.toExtractedMedia(fileUri, part?.fileData?.mimeType || 'image/png');
        }

        // text containing data URI, markdown link, or raw base64
        if (part?.text && typeof part.text === 'string') {
          const text = part.text.trim();
          const dataUriMatch = text.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
          if (dataUriMatch) {
            const mime = dataUriMatch[0].split(';')[0].replace('data:', '') || 'image/png';
            return this.toExtractedMedia(dataUriMatch[0], mime);
          }
          const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
          if (mdMatch && mdMatch[1]) {
            return this.toExtractedMedia(mdMatch[1], 'image/png');
          }
          if (text.length > 500 && (text.startsWith('iVBOR') || text.startsWith('/9j/') || text.startsWith('UklGR') || text.startsWith('R0lGO'))) {
            const mime = text.startsWith('/9j/') ? 'image/jpeg' : text.startsWith('UklGR') ? 'image/webp' : text.startsWith('R0lGO') ? 'image/gif' : 'image/png';
            return this.toExtractedMedia(text, mime, true);
          }
        }
      }
    }

    // 2. Imagen 3 format (generatedImages / generated_images / images)
    const genImages = response?.generatedImages || response?.generated_images || response?.images || response?.data?.generatedImages || response?.data?.images || [];
    for (const item of Array.isArray(genImages) ? genImages : [genImages]) {
      const img = item?.image || item;
      const bytes = img?.imageBytes || img?.image_bytes || img?.bytesBase64Encoded || img?.bytes;
      if (bytes && typeof bytes === 'string' && bytes.length > 50) {
        const mime = img?.mimeType || img?.mime_type || 'image/png';
        return this.toExtractedMedia(bytes, mime, true);
      }
      const uri = img?.uri || img?.url || img?.gcsUri || img?.fifeUrl || img?.generatedImage?.fifeUrl;
      if (uri && typeof uri === 'string' && uri.length > 5) {
        return this.toExtractedMedia(uri, img?.mimeType || 'image/png');
      }
    }

    // 3. Google Flow format (media[].image, results[].image, generatedImage.fifeUrl)
    const flowItems = [
      ...(Array.isArray(response?.media) ? response.media : [response?.media]),
      ...(Array.isArray(response?.results) ? response.results : [response?.results]),
      ...(Array.isArray(response?.data?.media) ? response.data.media : [response?.data?.media]),
      ...(Array.isArray(response?.data?.results) ? response.data.results : [response?.data?.results]),
      ...(Array.isArray(response?.response?.results) ? response.response.results : [response?.response?.results]),
      ...(Array.isArray(response?.requests?.[0]?.media) ? response.requests[0].media : []),
    ].filter(Boolean);

    for (const item of flowItems) {
      const img = item?.image || item;
      const bytes = img?.imageBytes || img?.image_bytes || img?.bytesBase64Encoded;
      if (bytes && typeof bytes === 'string' && bytes.length > 50) {
        return this.toExtractedMedia(bytes, img?.mimeType || 'image/png', true);
      }
      const fife = img?.generatedImage?.fifeUrl || img?.fifeUrl || item?.fifeUrl;
      if (fife && typeof fife === 'string' && fife.length > 5) {
        return this.toExtractedMedia(fife, 'image/jpeg');
      }
      const uri = img?.uri || img?.url;
      if (uri && typeof uri === 'string' && uri.length > 5) {
        return this.toExtractedMedia(uri, img?.mimeType || 'image/png');
      }
    }

    // 4. Deep recursive scanner for any nested base64 image data or URL (fallback)
    const scanDeep = (obj: any, depth = 0): ExtractedMedia | null => {
      if (!obj || typeof obj !== 'object' || depth > 6) return null;

      for (const key of ['imageBytes', 'image_bytes', 'bytesBase64Encoded', 'bytes_base64_encoded', 'b64_json', 'base64Data', 'mediaBytes']) {
        if (typeof obj[key] === 'string' && obj[key].length > 100) {
          const mime = obj.mimeType || obj.mime_type || 'image/png';
          return this.toExtractedMedia(obj[key], mime, true);
        }
      }

      if (obj.fifeUrl && typeof obj.fifeUrl === 'string') {
        return this.toExtractedMedia(obj.fifeUrl, 'image/jpeg');
      }

      for (const [, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          if (v.startsWith('data:image/')) {
            const mime = v.split(';')[0].replace('data:', '') || 'image/png';
            return this.toExtractedMedia(v, mime);
          }
          if (v.length > 1000 && (v.startsWith('iVBOR') || v.startsWith('/9j/') || v.startsWith('UklGR') || v.startsWith('R0lGO'))) {
            const mime = v.startsWith('/9j/') ? 'image/jpeg' : v.startsWith('UklGR') ? 'image/webp' : v.startsWith('R0lGO') ? 'image/gif' : 'image/png';
            return this.toExtractedMedia(v, mime, true);
          }
        } else if (typeof v === 'object' && v !== null) {
          const res = scanDeep(v, depth + 1);
          if (res) return res;
        }
      }
      return null;
    };

    return scanDeep(response);
  }

  /**
   * Adaptive Video Extractor:
   * Handles Google GenAI, Vertex AI, Gemini Veo / Omni, and Google Flow video response structures:
   * 1. String-first fast check (data:video URIs, videoBytes JSON, direct .mp4/.webm URLs, CDN URLs)
   * 2. Veo / Omni formats (generatedVideos[].video bytes or uri)
   * 3. Candidate content parts (inlineData video/mp4, videoBytes, encodedVideo, fileData)
   * 4. Google Flow format (opResult.metadata.video, mediaItem.video, encodedVideo, fifeUrl)
   * 5. Deep recursive fallback scan
   */
  static extractVideoFromResponse(response: any): ExtractedMedia | null {
    if (!response) return null;

    // 0. String-First Fast-Path: Inspect raw string / stringified JSON
    try {
      const rawStr = typeof response === 'string' ? response : JSON.stringify(response);

      // Fast check A: embedded data:video/... URI
      const dataUriMatch = rawStr.match(/data:video\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
      if (dataUriMatch) {
        const fullMatch = dataUriMatch[0];
        const mime = fullMatch.split(';')[0].replace('data:', '') || 'video/mp4';
        return this.toExtractedMedia(fullMatch, mime);
      }

      // Fast check B: base64 videoBytes pattern in JSON
      const videoBytesMatch = rawStr.match(/"(?:videoBytes|video_bytes|encodedVideo|encoded_video)"\s*:\s*"([A-Za-z0-9+/=]{100,})"/);
      if (videoBytesMatch && videoBytesMatch[1]) {
        const mimeMatch = rawStr.match(/"(?:mimeType|mime_type)"\s*:\s*"([^"]+)"/);
        const mime = mimeMatch ? mimeMatch[1] : 'video/mp4';
        return this.toExtractedMedia(videoBytesMatch[1], mime, true);
      }

      // Fast check C: Direct video extension URL (mp4, webm, mov, mkv)
      const directVideoMatch = rawStr.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov|mkv)(?:\?[^\s"'\\]*)?/i);
      if (directVideoMatch) {
        const ext = (directVideoMatch[0].split('?')[0].split('.').pop() || 'mp4').toLowerCase();
        const mime = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
        return this.toExtractedMedia(directVideoMatch[0], mime);
      }

      // Fast check D: Google Storage / Labs video CDN URL
      const storageVideoMatch = rawStr.match(/https?:\/\/(?:storage\.googleapis\.com|aisandbox-pa\.googleapis\.com|lh3\.googleusercontent\.com)[^\s"'\\]*(?:video|media)[^\s"'\\]*/i);
      if (storageVideoMatch) {
        return this.toExtractedMedia(storageVideoMatch[0], 'video/mp4');
      }
    } catch (_) {}

    // 1. Google Veo & Omni format (generatedVideos / generated_videos / videos)
    const genVideos = response?.generatedVideos ||
      response?.generated_videos ||
      response?.videos ||
      response?.response?.generatedVideos ||
      response?.data?.generatedVideos ||
      [];

    for (const item of Array.isArray(genVideos) ? genVideos : [genVideos]) {
      const vid = item?.video || item;
      const bytes = vid?.videoBytes || vid?.video_bytes || vid?.bytesBase64Encoded || vid?.encodedVideo || item?.videoBytes;
      if (bytes && typeof bytes === 'string' && bytes.length > 50) {
        const mime = vid?.mimeType || vid?.mime_type || item?.mimeType || 'video/mp4';
        return this.toExtractedMedia(bytes, mime, true);
      }
      const uri = vid?.uri || vid?.gcsUri || vid?.url || vid?.fifeUrl || item?.uri || item?.gcsUri;
      if (uri && typeof uri === 'string' && uri.length > 5) {
        const mime = vid?.mimeType || vid?.mime_type || item?.mimeType || 'video/mp4';
        return this.toExtractedMedia(uri, mime);
      }
    }

    // 2. Candidate content parts (Gemini Multimodal generateContent / candidates)
    const candidates = response?.candidates || response?.predictions || response?.data?.candidates || [];
    for (const cand of Array.isArray(candidates) ? candidates : [candidates]) {
      const parts = cand?.content?.parts || cand?.parts || [];
      for (const part of Array.isArray(parts) ? parts : [parts]) {
        // inlineData / inline_data for video
        const inline = part?.inlineData || part?.inline_data;
        if (inline?.data) {
          const mime = inline.mimeType || inline.mime_type || '';
          if (mime.startsWith('video/') || mime === 'video/mp4') {
            return this.toExtractedMedia(inline.data, mime || 'video/mp4', true);
          }
        }

        // videoBytes / encodedVideo directly on part
        const directBytes = part?.videoBytes || part?.video_bytes || part?.encodedVideo || part?.video?.videoBytes || part?.video?.encodedVideo;
        if (directBytes && typeof directBytes === 'string' && directBytes.length > 50) {
          const mime = part?.mimeType || part?.mime_type || part?.video?.mimeType || 'video/mp4';
          return this.toExtractedMedia(directBytes, mime, true);
        }

        // fileData / file_data URI
        const fileUri = part?.fileData?.fileUri || part?.file_data?.file_uri || part?.fileData?.uri || part?.video?.uri;
        if (fileUri && typeof fileUri === 'string' && (fileUri.startsWith('http://') || fileUri.startsWith('https://') || fileUri.startsWith('gs://'))) {
          const mime = part?.fileData?.mimeType || part?.file_data?.mime_type || 'video/mp4';
          return this.toExtractedMedia(fileUri, mime);
        }

        // text containing data:video or video URL
        if (part?.text && typeof part.text === 'string') {
          const text = part.text.trim();
          const dataUriMatch = text.match(/data:video\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
          if (dataUriMatch) {
            const mime = dataUriMatch[0].split(';')[0].replace('data:', '') || 'video/mp4';
            return this.toExtractedMedia(dataUriMatch[0], mime);
          }
          const urlMatch = text.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov)(?:\?[^\s"'\\]*)?/i);
          if (urlMatch) {
            return this.toExtractedMedia(urlMatch[0], 'video/mp4');
          }
        }
      }
    }

    // 3. Google Flow format (operations[].operation.metadata.video, media[].video, results[].video, etc.)
    const flowVideoHolders = [
      response?.operations?.[0]?.operation?.metadata?.video,
      response?.operations?.[0]?.operation?.metadata,
      response?.operations?.[0]?.metadata?.video,
      response?.metadata?.video,
      response?.media?.[0]?.video?.generatedVideo,
      response?.media?.[0]?.video,
      response?.media?.[0],
      response?.results?.[0]?.video?.generatedVideo,
      response?.results?.[0]?.video,
      response?.results?.[0],
      response?.data?.operations?.[0]?.operation?.metadata?.video,
      response?.data?.media?.[0]?.video?.generatedVideo,
      response?.data?.media?.[0]?.video,
      response?.data?.results?.[0]?.video,
      response?.data?.video,
      response?.video,
    ].filter(Boolean);

    for (const vObj of flowVideoHolders) {
      const bytes = vObj.encodedVideo || vObj.videoBytes || vObj.video_bytes || vObj.bytesBase64Encoded;
      if (bytes && typeof bytes === 'string' && bytes.length > 50) {
        return this.toExtractedMedia(bytes, vObj.mimeType || 'video/mp4', true);
      }
      const uri = vObj.fifeUrl || vObj.uri || vObj.url || vObj.gcsUri;
      if (uri && typeof uri === 'string' && uri.length > 5) {
        return this.toExtractedMedia(uri, vObj.mimeType || 'video/mp4');
      }
    }

    // 4. Deep recursive scan for video
    const scanDeepVideo = (obj: any, depth = 0): ExtractedMedia | null => {
      if (!obj || typeof obj !== 'object' || depth > 6) return null;

      for (const key of ['videoBytes', 'video_bytes', 'encodedVideo', 'encoded_video']) {
        if (typeof obj[key] === 'string' && obj[key].length > 100) {
          const mime = obj.mimeType || obj.mime_type || 'video/mp4';
          return this.toExtractedMedia(obj[key], mime, true);
        }
      }

      if (obj.video && typeof obj.video === 'object') {
        const inner = scanDeepVideo(obj.video, depth + 1);
        if (inner) return inner;
      }

      for (const [, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          if (v.startsWith('data:video/')) {
            const mime = v.split(';')[0].replace('data:', '') || 'video/mp4';
            return this.toExtractedMedia(v, mime);
          }
          if (v.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov)(?:\?[^\s"'\\]*)?/i)) {
            return this.toExtractedMedia(v, 'video/mp4');
          }
        } else if (typeof v === 'object' && v !== null) {
          const res = scanDeepVideo(v, depth + 1);
          if (res) return res;
        }
      }
      return null;
    };

    return scanDeepVideo(response);
  }

  /**
   * Unified Media Extractor (Image or Video):
   * Auto-detects or prioritizes based on preferredType ('image' | 'video' | 'any')
   */
  static extractMediaFromResponse(response: any, preferredType: 'image' | 'video' | 'any' = 'any'): ExtractedMedia | null {
    if (!response) return null;

    if (preferredType === 'video') {
      return this.extractVideoFromResponse(response) || this.extractImageFromResponse(response);
    }
    if (preferredType === 'image') {
      return this.extractImageFromResponse(response) || this.extractVideoFromResponse(response);
    }

    // Auto-detect based on video signatures vs image signatures
    const rawStr = typeof response === 'string' ? response : JSON.stringify(response);
    const hasVideoClues = /(?:videoBytes|encodedVideo|generatedVideos|"video"|\.mp4|\.webm|data:video\/)/i.test(rawStr);

    if (hasVideoClues) {
      const vid = this.extractVideoFromResponse(response);
      if (vid) return vid;
    }

    const img = this.extractImageFromResponse(response);
    if (img) return img;

    return this.extractVideoFromResponse(response);
  }
  static extractDialogueText(raw: any): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (!item) return '';
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'object') {
            const speaker = item.character || '';
            const line = item.line || '';
            return speaker ? `${speaker}: ${line}` : line;
          }
          return String(item);
        })
        .filter(Boolean)
        .join('\n');
    }
    if (typeof raw === 'object') {
      return String(raw.line || '').trim();
    }
    return String(raw).trim();
  }

  static extractDialogueLines(raw: any, defaultSpeaker: string = 'Narrator'): DialogueLine[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') {
            const parts = item.split(/:\s*(.*)/s);
            if (parts.length > 1) {
              return {
                character: parts[0].trim(),
                line: parts[1].trim(),
              };
            }
            return { character: defaultSpeaker, line: item.trim() };
          }
          if (typeof item === 'object') {
            return {
              character: item.character || defaultSpeaker,
              line: item.line || '',
              emotion: item.emotion,
              speech_tone: item.speech_tone,
              speech_start_sec: item.speech_start_sec,
              speech_end_sec: item.speech_end_sec,
            };
          }
          return { character: defaultSpeaker, line: String(item) };
        })
        .filter((d): d is DialogueLine => Boolean(d && d.line));
    }
    return [];
  }

  static normalizeCharacter(raw: any): CharacterSeriesEntity | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;

    const wardrobeVariants: CharacterWardrobeVariant[] = Array.isArray(raw.wardrobe_variants)
      ? raw.wardrobe_variants.map((w: any, wIdx: number) => ({
          variant_id: w.variant_id || `wv_${wIdx + 1}`,
          name: w.name || `Variant ${wIdx + 1}`,
          clothing_and_accessories: w.clothing_and_accessories || '',
          image_url: w.image_url,
          prompt: w.prompt,
          versions: Array.isArray(w.versions) ? w.versions : (w.image_url ? [{ id: `v_${wIdx + 1}`, image_url: w.image_url, prompt: w.prompt, created_at: w.created_at || new Date().toISOString(), is_selected: true }] : []),
          associated_scenes: Array.isArray(w.associated_scenes) ? w.associated_scenes : [],
        }))
      : (raw.clothing_and_accessories ? [{
          variant_id: `wv_default`,
          name: raw.clothing_and_accessories.slice(0, 40),
          clothing_and_accessories: raw.clothing_and_accessories,
          prompt: raw.prompt,
          versions: [],
        }] : []);

    const charImageUrl = raw.avatar || null;
    const charVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (charImageUrl ? [{ id: `v_init`, image_url: charImageUrl, prompt: raw.prompt, created_at: raw.created_at || new Date().toISOString(), is_selected: true }] : []);

    const parsed = CharacterSeriesEntitySchema.safeParse({
      id: raw.id || `char_${nanoid(8)}`,
      series_id: raw.series_id || '',
      name,
      role: raw.role || 'protagonist',
      age: Number(raw.age) || 25,
      gender: raw.gender || 'neutral',
      nationality: raw.nationality || 'United States',
      voice_id: raw.voice_id || 'Fenrir',
      identity: raw.identity || '',
      traits: raw.traits || '',
      visual_traits: raw.visual_traits || '',
      physical_characteristics: raw.physical_characteristics || '',
      appearance: raw.appearance || '',
      clothing_and_accessories: raw.clothing_and_accessories || '',
      frame_description: raw.frame_description || '',
      wardrobe_variants: wardrobeVariants,
      speech_style: raw.speech_style || '',
      avatar: raw.avatar || '',
      prompt: raw.prompt,
      versions: charVersions,
      lora_model: raw.lora_model || '',
      description: raw.description || '',
      created_at: raw.created_at || new Date().toISOString(),
    });
    return parsed.success ? (parsed.data as CharacterSeriesEntity) : null;
  }

  static normalizeLocation(raw: any): LocationAsset | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;
    const locVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (raw.image_url ? [{ id: `v_init`, image_url: raw.image_url, prompt: raw.prompt, created_at: new Date().toISOString(), is_selected: true }] : []);

    const parsed = LocationAssetSchema.safeParse({
      id: raw.id || `loc_${nanoid(6)}`,
      series_id: raw.series_id,
      name,
      physical_characteristics: raw.physical_characteristics || '',
      time_of_day: raw.time_of_day || 'Day',
      image_url: raw.image_url,
      prompt: raw.prompt,
      versions: locVersions,
      frame_description: raw.frame_description || '',
    });
    return parsed.success ? (parsed.data as LocationAsset) : null;
  }

  static normalizeProp(raw: any): PropAsset | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;
    const propVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (raw.image_url ? [{ id: `v_init`, image_url: raw.image_url, prompt: raw.prompt, created_at: new Date().toISOString(), is_selected: true }] : []);

    const parsed = PropAssetSchema.safeParse({
      id: raw.id || `prop_${nanoid(6)}`,
      series_id: raw.series_id,
      name,
      owner: raw.owner || '',
      physical_characteristics: raw.physical_characteristics || '',
      image_url: raw.image_url,
      prompt: raw.prompt,
      versions: propVersions,
      frame_description: raw.frame_description || '',
    });
    return parsed.success ? (parsed.data as PropAsset) : null;
  }

  static normalizeScene(raw: any, index: number = 1): SceneEntity | null {
    if (!raw || typeof raw !== 'object') return null;
    const sceneIdx = Number(raw.index ?? raw.scene_number ?? index) || index;
    const sceneNum = Number(raw.scene_number ?? sceneIdx);
    const shotNum = Number(raw.shot_number ?? sceneIdx);

    const parsed = SceneEntitySchema.safeParse({
      id: raw.id || `scene_${nanoid(8)}`,
      index: sceneIdx,
      scene_number: sceneNum,
      shot_number: shotNum,
      title: raw.title || `Shot ${shotNum}`,
      heading: raw.heading || `SCENE ${sceneNum}`,
      location: raw.location || 'Scene Location',
      time_of_day: raw.time_of_day || 'Day',
      lighting_mood: raw.lighting_mood || 'Cinematic lighting',
      frame_description: raw.frame_description || '',
      description: raw.description || raw.frame_description || '',
      scene_context: raw.scene_context || '',
      camera_movement: raw.camera_movement || 'Static',
      action: raw.action || '',
      dialogue: Array.isArray(raw.dialogue) ? raw.dialogue : [],
      character_costumes: Array.isArray(raw.character_costumes) ? raw.character_costumes : [],
      prop_details: raw.prop_details || '',
      reference_assets: raw.reference_assets || { characters: [], locations: [], props: [] },
      visual_prompt: raw.visual_prompt || '',
      end_frame_prompt: raw.end_frame_prompt || '',
      transition_effect: raw.transition_effect || 'cut',
      effects: Array.isArray(raw.effects) ? raw.effects : [],
      video_effect: raw.video_effect || '',
      duration_seconds: Number(raw.duration_seconds) || 6,
      image_url: raw.image_url || raw.storyboard_frame_url || null,
      storyboard_frame_url: raw.storyboard_frame_url || raw.image_url || null,
      storyboard_end_frame_url: raw.storyboard_end_frame_url || null,
      video_url: raw.video_url || null,
      voiceover_url: raw.voiceover_url || null,
      bgm_url: raw.bgm_url || null,
      bgm_mood: raw.bgm_mood || '',
      sfx_cues: Array.isArray(raw.sfx_cues) ? raw.sfx_cues : [],
      voice_start_us: raw.voice_start_us ?? 0,
      voice_duration_us: raw.voice_duration_us ?? 0,
      captions_data: Array.isArray(raw.captions_data) ? raw.captions_data : [],
      words: Array.isArray(raw.words) ? raw.words : [],
      translations: raw.translations || {},
      status: raw.status || (raw.video_url ? 'video_ready' : (raw.image_url || raw.storyboard_frame_url ? 'image_ready' : 'draft')),
    });
    return parsed.success ? (parsed.data as unknown as SceneEntity) : null;
  }

  static normalizeEpisode(raw: any, index: number = 1): Partial<EpisodeEntity> {
    if (!raw) return {};
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
    const scenes = rawScenes.map((s: any, idx: number) => this.normalizeScene(s, idx + 1)).filter((s): s is SceneEntity => s !== null);
    const scenesTotalDuration = scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
    const resolvedDuration = scenesTotalDuration > 0
      ? scenesTotalDuration
      : (Number(raw.duration_seconds) || Number(raw.duration) || 60);

    return {
      id: raw.id || `ep_${index}`,
      series_id: raw.series_id || '',
      episode_number: Number(raw.episode_number) || index,
      title: raw.title || `Episode ${index}`,
      synopsis: raw.synopsis || '',
      scene_core: raw.scene_core || '',
      conflict_escalation: raw.conflict_escalation || '',
      cliffhanger_hook: raw.cliffhanger_hook || '',
      phase: raw.phase || '',
      duration: resolvedDuration,
      duration_seconds: resolvedDuration,
      reference_assets: raw.reference_assets || { character_ids: [], location_ids: [], prop_ids: [] },
      scenes,
      cover_image: raw.cover_image || '',
      video_url: raw.video_url || '',
      video_urls: raw.video_urls || {},
      dubbing_languages: Array.isArray(raw.dubbing_languages)
        ? raw.dubbing_languages.filter((l: any): l is string => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(l.trim()))
        : [],
      caption_languages: Array.isArray(raw.caption_languages)
        ? raw.caption_languages.filter((l: any): l is string => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(l.trim()))
        : [],
      status: raw.status || 'draft',
    };
  }
}
