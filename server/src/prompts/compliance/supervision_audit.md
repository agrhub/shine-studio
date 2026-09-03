Perform a strict Supervision & Compliance Audit for the following micro-drama Master Plan in target market "{{country}}" ({{ratio}} aspect ratio).

IMPORTANT LANGUAGE REQUIREMENT:
- Output language: {{languageName}} (ISO: {{lang}}).
- All explanations, category "notes", "market_research" summaries, and "recommendations" MUST be written fluently and naturally in {{languageName}}. Do NOT write in English if {{languageName}} is Vietnamese, Chinese, Japanese, etc.

Master Plan to Audit:
- Series Title: {{title}}
- Genre: {{genre}}
- Story Core: {{synopsis}}
- Target Country: {{country}}
- Characters: {{charactersList}}
- Sample Episodes: {{sampleEpisodesJson}}

Live Market Research Data & Search Intelligence:
- Copyright & Competitor Search Data: {{copyrightResearch}}
- Country Regulatory & Censorship Search Data: {{regulatoryResearch}}
- Cultural Norms & Taboos Search Data: {{culturalResearch}}

Audit Directives:
1. Synthesize the raw search data above into clear, human-readable, professional summaries for short-drama creators in {{languageName}}.
   - "copyright_findings": Explain clearly in {{languageName}} whether there are duplicate titles or plot overlaps on platforms like ReelShort, DramaBox, ShortMax, etc., and confirm IP safety.
   - "regulatory_findings": Explain clearly in {{languageName}} the platform streaming redlines, local media censorship rules, or content ratings in {{country}}.
   - "cultural_findings": Explain clearly in {{languageName}} local sensitivities, religious taboos, or cultural nuances in {{country}} relevant to this story.
2. Check against micro-drama Redlines (Violence/Gore, Adult Content, Cultural Sensitivity, Copyright/IP).
3. Return category notes in natural, polite {{languageName}}.

Return ONLY a valid JSON object matching this schema:
{
  "overall_score": number (0-100),
  "is_compliant": boolean,
  "market_research": {
    "country": "{{country}}",
    "copyright_findings": "Clear, informative analysis of copyright and market originality in {{languageName}}",
    "regulatory_findings": "Clear, informative analysis of broadcasting regulations and censorship in {{country}} in {{languageName}}",
    "cultural_findings": "Clear, informative analysis of cultural sensitivities in {{country}} in {{languageName}}"
  },
  "categories": {
    "violence": {
      "label": "Violence / Gore",
      "score": number (0-100),
      "status": "Passed" | "Warning" | "Failed",
      "safe": boolean,
      "notes": "Clear explanation referencing story details and market standards"
    },
    "adult_content": {
      "label": "Adult Content",
      "score": number (0-100),
      "status": "Passed" | "Warning" | "Failed",
      "safe": boolean,
      "notes": "Clear explanation referencing story details and distribution guidelines"
    },
    "cultural_sensitivity": {
      "label": "Cultural Sensitivity",
      "score": number (0-100),
      "status": "Passed" | "Warning" | "Failed",
      "safe": boolean,
      "notes": "Clear explanation referencing specific local norms and sensitivities in {{country}}"
    },
    "copyright_ip": {
      "label": "Copyright / IP",
      "score": number (0-100),
      "status": "Passed" | "Warning" | "Failed",
      "safe": boolean,
      "notes": "Clear explanation referencing originality of tropes, title uniqueness, and character concepts"
    }
  },
  "copyright_checks": [
    { "label": "Script Origin & Plagiarism", "status": "Passed" | "Warning" | "Failed", "safe": boolean },
    { "label": "Generated Visual Assets", "status": "Passed" | "Warning" | "Failed", "safe": boolean },
    { "label": "Audio & Foley Library", "status": "Passed" | "Warning" | "Failed", "safe": boolean }
  ],
  "identified_issues": string[],
  "recommendations": string[]
}
