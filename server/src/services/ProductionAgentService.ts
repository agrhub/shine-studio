import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { loadSkill } from '@/utils/SkillLoader.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';

import { StoryboardPanel } from '@/types.js';

export class ProductionAgentService {
  async generateStoryboardPanels(scenes: any[]): Promise<StoryboardPanel[]> {
    const frameSkill = loadSkill('production_frame_prompt');
    const prompt = PromptLoader.render('storyboard/storyboard_panel_generate', {
      scenesJson: JSON.stringify(scenes, null, 2),
    });

    let panels: StoryboardPanel[] = [];
    try {
      panels = await aiProviderRouter.generateJSON<StoryboardPanel[]>(prompt, undefined, {
        systemInstruction: frameSkill || 'You are an expert AI storyboard director for vertical micro-dramas.',
      });
    } catch (err: any) {
      Logger.warn(`[ProductionAgentService] AI JSON parse fallback: ${err.message}`);
    }

    if (!Array.isArray(panels) || panels.length === 0) {
      panels = scenes.map((sc, idx) => ({
        id: `sb-${Date.now()}-${idx + 1}`,
        scene_index: sc.scene_index || idx + 1,
        shot_number: idx + 1,
        prompt: sc.prompt || `Cinematic 9:16 vertical video frame of micro drama scene ${idx + 1}, dramatic lighting, 8k render`,
        camera_movement: sc.camera_movement || 'Push In',
        lighting_style: 'Cinematic Rim Light & High Contrast',
        character_anchors: sc.character_anchors || ['character_anchor'],
        duration_seconds: sc.duration_seconds || 5,
      }));
    }

    // Generate real visual image for the initial panels
    for (let i = 0; i < Math.min(panels.length, 3); i++) {
      try {
        const p = panels[i];
        const imgResult = await aiProviderRouter.generateImage(p.prompt, {
          aspectRatio: '9:16',
          systemPrompt: frameSkill,
        });

        if (imgResult?.url) {
          const s3Res = await StorageFactory.uploadMedia(imgResult.url, 'images', 'png', imgResult.mimeType || 'image/png');
          p.image_url = `/api/assets/file/${s3Res.key}`;
        }
      } catch (imgErr: any) {
        Logger.warn(`[ProductionAgentService] Frame image generation error for panel ${i + 1}: ${imgErr.message}`);
      }
    }

    return panels;
  }
}

export const productionAgentService = new ProductionAgentService();

