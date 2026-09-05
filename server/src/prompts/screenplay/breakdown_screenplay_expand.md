# Screenplay Breakdown Expansion & Detail Enrichment

You previously broke down the screenplay into {{currentShotsCount}} shots, which is below the required target duration of {{targetDuration}}s (target: {{minShots}} to {{maxShots}} shots total).

## PREVIOUS BREAKDOWN DRAFT:
{{previousDraftJson}}

## ORIGINAL SCREENPLAY CONTENT:
{{screenplay}}

## LINKED ASSETS (Link by exact name)
### Characters:
{{charactersList}}

### Locations:
{{locationsList}}

### Props:
{{propsList}}

{{#if languageInstruction}}
## LANGUAGE DIRECTIVE
{{languageInstruction}}
{{/if}}

## EXPANSION & DETAIL ENRICHMENT INSTRUCTIONS:
1. **Granular Multi-Shot Cinematography**: Break down each scene into more granular, cinematic shots (5s to 8s per shot) covering all dramatic actions, micro-expressions, reactions, and dialogue exchanges.
2. **Single Speaker per Shot Rule**: Each shot MUST contain at most ONE dialogue line from EXACTLY ONE character. Multi-character dialogue within the same shot is STRICTLY FORBIDDEN.
3. **High Dialogue Duration & Coverage (MANDATORY 80%–90% Spoken Time)**: Micro-drama audience retention relies on fast, continuous audio pacing without dead silence.
   - Cumulative spoken dialogue/VO must reach **at least 80% to 90% of {{targetDuration}}s**.
   - Each shot's dialogue line MUST have adequate length matching `duration_seconds` (~2.0–2.4 words/second). Avoid 1-word grunts!
   - Convert silent shots into substantive dialogue or internal monologue (VO). At least 85%–95% of shots MUST have dialogue. Purely silent shots must not exceed 1 shot across the entire episode.
4. **Mandatory Shot Count**: You MUST produce between {{minShots}} and {{maxShots}} total shots distributed across all scenes.
5. **Output Schema**: Return the complete updated JSON with `{"scenes": [...]}` matching the standard scene and shot schema.
