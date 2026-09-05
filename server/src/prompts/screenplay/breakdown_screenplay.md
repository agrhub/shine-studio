# Screenplay Sequential Scene & Shot Breakdown

You are an expert Film Director, Storyboard Artist, and Micro-Drama Cinematographer.
Your mission is to analyze the provided Screenplay content and break it down into a complete, sequential list of cinematic shots (each representing a 5s-8s video generation frame / scene clip).

## TARGET DURATION & MANDATORY SHOT REQUIREMENTS
- **Target Episode Duration**: **{{targetDuration}} seconds** (The sum of all shot durationSeconds MUST reach ~{{targetDuration}}s!)
- **Mandatory Shot Count**: You MUST generate between **{{minShots}}** and **{{maxShots}}** sequential shot frames (5s to 8s per shot) distributed across ALL scenes.

## MULTI-SHOT CINEMATIC COVERAGE RULES (CRITICAL):
1. **FULL SCENE COVERAGE (DO NOT SKIP ANY SCENE)**: You MUST break down the ENTIRE screenplay from the first scene to the final scene. Every dramatic scene heading (e.g. `### INT.` / `### EXT.`) in the screenplay MUST have corresponding shots generated. Do NOT stop early or drop later scenes!
2. **DO NOT output just 1 shot per scene heading.** Screenplay headings are dramatic locations, NOT individual video clips.
3. Every dramatic scene must be covered with **multiple sequential cinematic angles & beats** (e.g., 2 to 6 shots per scene):
   - **Establishing / Wide Angle**: Establishing the environment, lighting mood, and initial character posture.
   - **Medium / Tracking Shot**: Action movements, characters walking, interacting with props or devices.
   - **Over-the-Shoulder / Two-Shot**: Conversational beats, interpersonal tension, and spatial dynamics.
   - **Intense Close-Up**: Emotional dialogue delivery, tears, smirks, intense eye contact, micro-expressions.
   - **Detail / Insert Cut-Away**: Close-up of key props (phone screens, ring lights, laptops, mirrors, documents).
   - **Reaction & Transition Shot**: Silent reaction, shock, breathing, or shift in facial expression leading to next beat.
4. **Single Speaker per Shot Mandate**: Each shot MUST contain at most ONE spoken dialogue line from EXACTLY ONE character. If two characters have a conversation, split it into sequential alternating shots (Shot 1: Character A speaks, Shot 2: Character B reacts and replies).
5. **HIGH DIALOGUE DURATION & RETENTION MANDATE (CRITICAL FOR MICRO-DRAMA VIDEO - 80%–90% EPISODE DURATION COVERAGE)**:
   - Micro-drama videos (TikTok, Reels, Shorts, ReelShort, DramaBox) are **voice-driven**. Viewers lose interest and swipe away if there are silent, static shots or prolonged dead air!
   - **CUMULATIVE SPOKEN DURATION MUST COVER 80% TO 90% OF TOTAL EPISODE DURATION**:
     - For this {{targetDuration}}s episode, the cumulative spoken dialogue and voiceover (VO) duration MUST reach **at least 80% to 90% of {{targetDuration}}s** (approx. Math.round({{targetDuration}} * 0.85) seconds of continuous speech). The remaining 10%–15% is reserved ONLY for dramatic shock beats, sound-effect stingers, or opening establishing atmosphere.
   - **PER-SHOT WORD BUDGET (ELIMINATE DEAD AIR)**:
     - A shot MUST NOT contain only a 1-word or 2-word grunt (e.g. "Hừ!", "Gì cơ?!") that leaves 4s of dead silence.
     - Each shot's dialogue line MUST have sufficient word count to fill 70%–85% of that shot's `duration_seconds` (budget approximately ~2.0 to 2.4 words per second of duration):
       - **4s shot**: ~8–10 words spoken (~3.0s–3.5s speech).
       - **5s shot**: ~10–13 words spoken (~3.8s–4.3s speech).
       - **6s–7s shot**: ~13–17 words spoken (~4.8s–5.8s speech).
   - **DISTRIBUTION COVERAGE (85%–95% OF ALL SHOTS)**:
     - At least 85% to 95% of all shots across the episode MUST contain spoken dialogue or voiceover/inner monologue (`dialogue: [...]`).
   - If the original screenplay has sparse written lines, you **MUST actively enrich EVERY shot** where characters are present:
     - **During solo actions / movement**: Give the character an intense **internal monologue / voiceover (VO)** revealing their hidden motive, fear, revenge plan, or secret calculation.
     - **During confrontations / two-shots**: Write sharp, full back-and-forth verbal volleys, icy threats, sarcastic retorts, or interrogations.
     - **During reactions / shock moments**: Do not merely stare in silence—provide an audible gasp followed by an internal realization, muttered suspicion, or whispered order.
   - **Purely silent shots (`dialogue: []`) are strictly limited to at most 1 shot per episode** (e.g. a 3s atmospheric establishing shot or an immediate shock-freeze moment). All other shots MUST have substantive dialogue!
6. **Completeness**: Every spoken dialogue line, character action, and emotional beat from the screenplay MUST be fully populated into the shots. NEVER return empty string `""` for `frame_description`, `action`, `camera_movement`, `visual_prompt`, or `location`.
7. **Exact Duration Targeting**: Set `duration_seconds` (4 to 8) on each shot such that the cumulative duration of all shots accurately equals **{{targetDuration}}s**.

## LANGUAGE & DIALOGUE DIRECTIVE (STRICT)
- **Series Spoken Language**: **{{languageName}} ({{languageNativeName}} / {{languageCode}})**
- **Country / Cultural Setting**: **{{country}}**
- **CRITICAL LANGUAGE RULES**:
  1. ALL spoken character dialogue (`dialogue[].line`), emotional subtext (`dialogue[].emotion`), and speech tone (`dialogue[].speech_tone`) MUST be written STRICTLY in **{{languageName}} ({{languageNativeName}})**.
  2. If the screenplay text contains dialogue written in another language, translate and adapt the spoken lines naturally into **{{languageName}}**.
  3. Visual descriptions (`frame_description`, `visual_prompt`, `end_frame_prompt`, `action`) should be written in English for generative AI models, while incorporating authentic cultural backdrops matching **{{country}}**.
{{#if languageInstruction}}
{{languageInstruction}}
{{/if}}

{{#if existingScenesSummary}}
## EXISTING SCENES DRAFT (PRESERVE CONTEXT & EXPAND TO REACH {{targetDuration}}s):
The following scenes already exist in the episode draft. You MUST maintain continuous character positioning, scene context, and end frames, and EXPAND/ENRICH the shots to reach the target duration of {{targetDuration}}s:
{{existingScenesSummary}}
{{/if}}

{{#if detectedScenesList}}
## DETECTED SCENES IN SCREENPLAY (YOU MUST COVER ALL OF THEM):
{{detectedScenesList}}
{{/if}}

## AVAILABLE LINKED ASSETS (Link by exact name)
### Characters:
{{charactersList}}

### Locations:
{{locationsList}}

### Props:
{{propsList}}

## SCREENPLAY CONTENT TO BREAK DOWN:
{{screenplay}}

## SHOT STRUCTURE FIELDS (ALL FIELDS MUST BE FULLY POPULATED - NEVER RETURN EMPTY STRINGS):
- `scene_number`: Dramatic scene group index (1, 2, 3...).
- `shot_number`: Sequential shot number within this scene (1, 2, 3, 4...).
- `title`: Short descriptive title (3-5 words).
- `heading`: Standard scene heading slugline (e.g. `### INT. LIVING ROOM - NIGHT`).
- `location`: Exact location name from available assets.
- `time_of_day`: `DAY`, `NIGHT`, `DUSK`, `DAWN`.
- `lighting_mood`: Cinematic lighting mood.
- `scene_context`: (MANDATORY) Spatial and situational context. Explicitly specify which character(s) are physically present in the room, where they stand/sit, and the room atmosphere. NEVER empty string.
- `prop_details`: (MANDATORY) Appearance, placement, and state of key props in this shot. If no special props, describe the focal background objects. NEVER empty string.
- `frame_description`: (MANDATORY) Concrete visual description of what is on screen (camera angle, actor positioning, lighting, background). NEVER empty string.
- `camera_movement`: (MANDATORY) Dynamic camera instruction (e.g. `Slow push-in`, `Over-the-shoulder medium shot`, `Tracking shot`, `Extreme close-up`). NEVER empty string.
- `action`: (MANDATORY) Narrative character action happening in this shot. NEVER empty string.
- `character_costumes`: (MANDATORY) `[ { "character": "Character Name", "wardrobe": "Clothing description", "variant_id": "exact_variant_id_from_wardrobe_variants" } ]` for every character physically present. `variant_id` MUST be copied EXACTLY from the `Wardrobe Variants` of the character defined in the Available Characters list above (e.g. `elena_ivory_blazer` or `wv_1`). NEVER invent arbitrary variant IDs!
- `props`: Array of prop names appearing in this shot.
- `dialogue`: (MANDATORY IN 85%–95% OF SHOTS; TOTAL EPISODE SPOKEN COVERAGE 80%–90%) `[ { "character": "Name", "line": "Exact dialogue line", "emotion": "Tone/Emotion", "speech_tone": "Tone", "speed": 1.0 } ]`. Line length must correspond to `duration_seconds` (~2.0–2.4 words per second). NEVER return 1-word grunts leaving dead air. NEVER return empty `[]` when a character is present; provide spoken lines, whispered reactions, or internal voiceovers (VO). Empty `[]` is allowed for at most 1 shot per episode.
- `duration_seconds`: Integer (4 to 8) accurately reflecting the time needed for dialogue speech and physical action.
- `bgm_mood`: Music mood cue describing the musical instruments and suspense/emotional pacing.
- `sfx_cues`: Sound effects cues array.
- `visual_prompt`: (MANDATORY) AI Start-Frame image prompt (subject + wardrobe + posture + lighting + composition + mood). NEVER empty string.
- `end_frame_prompt`: (MANDATORY) AI End-Frame image prompt describing the subject's final posture, micro-expression, eye gaze, hand movement, and lighting at shot end. NEVER empty string.
- `transition_effect`: OpenVideo GLSL transition key (`fade`, `wipeLeft`, `wipeRight`, `cube`, `CrossZoom`, `SimpleZoom`, `DreamyZoom`, `glitchMemories`, `GlitchDisplace`, `dreamy`, `Swirl`, `waterDrop`, `ripple`, `wind`, `LinearBlur`, `Mosaic`, `pixelize`, `circleopen`, `windowslice`, `doorway`, `burn`, `InvertedPageCurl`), or empty `""` for direct cut.
- `video_effect`: (MANDATORY) MUST be strictly one of the canonical OpenVideo Effect keys: `vignette`, `glowFilter`, `bloomFilter`, `retro70s`, `filmStripPro`, `sepia`, `tvScanlines`, `glitch`, `rgbGlitch`, `shine`, `oldFilmFilter`, `crtFilter`, `motionBlur`, `cameraMove`, `fastZoom`, `shockwaveFilter`, `depthBlur`, `godrayFilter`, or `none`. NEVER invent arbitrary names or descriptions outside this exact list.
- `reference_assets`: `{ "characters": ["Name"], "locations": ["Name"], "props": ["Name"] }` (Only include assets physically present in this shot).

## JSON OUTPUT FORMAT:
Respond ONLY with a valid JSON object containing between {{minShots}} and {{maxShots}} shots:
```json
{
  "scenes": [
    {
      "scene_number": 1,
      "shot_number": 1,
      "title": "Solitary Candlelit Dinner",
      "heading": "INT. LUXURY PENTHOUSE LIVING ROOM - NIGHT",
      "location": "Luxury Penthouse Living Room",
      "time_of_day": "NIGHT",
      "lighting_mood": "Atmospheric moody candlelit cinematic lighting",
      "scene_context": "Elena sits alone at the luxury dining table waiting for her husband in cold silence.",
      "prop_details": "Candles flickering low on the dining table next to a chilled champagne bucket and untouched anniversary dinner.",
      "frame_description": "Close-up of Elena sitting alone at a candlelit luxury dining table, reflection of flickering flames in her eyes, moody cinematic lighting.",
      "camera_movement": "Slow push-in towards Elena's face",
      "action": "Elena looks down at the cold dinner table, her eyes reflecting deep sorrow and betrayal.",
      "character_costumes": [ { "character": "Elena Vance", "wardrobe": "Minimalist luxury ivory blazer", "variant_id": "elena_ivory_blazer" } ],
      "props": ["Cracked Platinum Wedding Band"],
      "dialogue": [ { "character": "Elena Vance", "line": "Five years... Are you really in a board meeting until midnight, Alexander?", "emotion": "Melancholic, sorrowful", "speech_tone": "Subdued, trembling", "speed": 0.9 } ],
      "duration_seconds": 6,
      "bgm_mood": "Melancholic piano and soft strings",
      "sfx_cues": ["Heavy ticking clock in background"],
      "visual_prompt": "Close-up of female protagonist Elena Vance sitting alone at a candlelit luxury dining table, moody cinematic anamorphic lighting, 8k...",
      "end_frame_prompt": "Elena Vance gently touches her wedding ring with trembling fingers, lowering her gaze in quiet heartbreak.",
      "transition_effect": "fade",
      "effects": [{"effect_key": "vignette", "intensity": 0.6}],
      "video_effect": "vignette",
      "reference_assets": { "characters": ["Elena Vance"], "locations": ["Luxury Penthouse Living Room"], "props": ["Cracked Platinum Wedding Band"] }
    }
  ]
}
```
