Generate the complete high-level Master Story Plan Core for a {{totalEpisodes}}-episode vertical micro-drama series.

Project Parameters:
- Series Title: {{title}}
- Genre: {{genre}}
- Visual Art Style: {{visualStyle}} ({{visualStylePrompt}})
- Synopsis: {{synopsis}}
- Cultural Setting & Character Heritage: {{country}}
- Output Script Language: {{languageName}} ({{languageCode}})
- Aspect Ratio: {{ratio}}
- Total Episodes: {{totalEpisodes}}
- Duration per Episode: {{durationDisplay}} ({{totalDurationSeconds}} seconds)
- Viral Topic: {{viralTopic}}

LANGUAGE DIRECTIVE:
{{languageInstruction}}

Characters Directives:
- Generate a comprehensive and rich ensemble cast of characters (Protagonist, Antagonists, Allies, Love Interests, Rivals, Catalysts, Family, and Informants) as required by the series narrative.
- Assign authentic character names and personas belonging culturally to {{country}}.
- MANDATORY: Each character MUST include `wardrobe_variants` array with at least 1 default variant (containing unique `variant_id` such as `wv_1`, `name`, and detailed `clothing_and_accessories`).
- Select appropriate voice IDs from the catalog below:
{{voiceCatalog}}

Episode Directives:
- MANDATORY EPISODE 1 STRUCTURE (Prologue & World/Character Exposition):
  * Episode 1 MUST establish the narrative universe in 4 clear beats:
    1. World & Social Backdrop: Establishing the society, clan hierarchy, or premise with narrator voiceover.
    2. Protagonist Introduction: Introducing the protagonist, their identity, and their defining past trauma or loss.
    3. Antagonist Showcase: Revealing the opposing faction or primary villain and the core oppression/conflict.
    4. Inciting Incident: The decisive spark/betrayal that forces the protagonist to initiate their journey.
  * Subsequent episodes (Ep 2+) dive into high-stakes execution, escalation, and tactical battles.
{{episodeScopeInstruction}}

Execute this task strictly adhering to the dramaturgical rules, pacing formulas, and required JSON Output Schema defined in your System Skill.

