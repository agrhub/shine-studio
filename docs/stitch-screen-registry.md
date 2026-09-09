# GOOGLE STITCH 19-SCREEN MANDATORY CODE CONVERSION REGISTRY & ARCHITECTURE

## ⚠️ ABSOLUTE DIRECTIVE FOR ALL DEVELOPERS & AI AGENTS

**DO NOT GUESS OR INVENT ANY UI PAGE LAYOUTS, TEXT, OR STYLING.**
For EVERY page implemented or refactored, the 3-step Google Stitch HTML Conversion Workflow is enforced:

1. **Step 1 (Locate Screen Folder):** Find the screen folder in `docs/stitch_shine_app_design/<screen_folder_name>`.
2. **Step 2 (Read Local HTML/Design):** Open and read the `code.html` template or `screen.png` image directly from that folder.
3. **Step 3 (Refactor Vue Page):** Translate downloaded HTML 100% into Vue 3 + **Element Plus (`element-plus`)** components.

---

## 1. Component Shell & Modal Architecture (User Design Mandate)

- **New Series Wizard (`SeriesWizardModal.vue`)**:
  - Encapsulates Step 1 (Core DNA), Step 2 (Trend Hunt), Step 3 (Compliance) into a single 3-step wizard inside an `<el-dialog>`.
  - Launched from Dashboard (`/dashboard`) and My Projects (`/projects`) CTA buttons.

- **Unified Project Workspace (`ProjectWorkspacePage.vue`)**:
  - Single detail view at route `/projects/:id`.
  - Integrates 5 top tabs using `<el-tabs>`:
    1. **Overview**: `ProjectOverview.vue`
    2. **Episodes**: `ProjectEpisodes.vue`
    3. **Analysis & Retention**: `ProjectAnalysis.vue`
    4. **Distribution**: `DistributionPage.vue`
    5. **Revenue**: `ProjectRevenue.vue`

- **Episode Studio Workspace (`StudioWorkspaceModal.vue`)**:
  - Fullscreen `<el-dialog>` workspace with a left sidebar `<el-tabs>` to switch between production surfaces:
    1. `script`: `ScriptStudio.vue` (Script & Scene Assembly)
    2. `editor`: `EditPage.vue` (9:16 Timeline Video Editor)
    3. `voice`: `VoiceDubbingPage.vue` (Neural Voice & Affect Steering)
    4. `captions`: `CaptionsPage.vue` (Subtitles Studio & Caption Designer)
    5. `export`: `PublishPage.vue` (Smart Cover Generator & Export Config)

- **Modals**:
  - **`MasterScriptModal.vue`**: Master Plan Script breakdown dialog triggered from Episode actions or Project header.
  - **`CharacterPersonaModal.vue`**: Persona Studio & Facial Consistency Anchors dialog triggered when selecting character avatars.

- **Synchronized Auth Suite (`AuthLayout.vue`)**:
  - Standardized Light Mint Brand Hero panel matching Stitch Signup design (Image 2) across `Signup`, `Login`, `ForgotPassword`, and `ResetPassword`.

---

## 2. Complete 19-Screen Mapping Table

| # | Target Vue File Path | Route / Component Container | Stitch Screen Title | Stitch Screen ID (`projects/11466822328114768539/screens/...`) |
| :- | :--- | :--- | :--- | :--- |
| 1 | `src/pages/Home.vue` | `/` | `Shine - AI Micro-Drama Studio Landing Page` | `175840307a274a24b5bcfa395116e4d0` |
| 2 | `src/pages/auth/Login.vue` | `/auth/login` | `Login - Shine AI Studio` | `53e4d5f590634e1b87d5e267b6d67bbe` |
| 3 | `src/pages/auth/Signup.vue` | `/auth/signup` | `Signup - Shine AI Studio` | `c906b8d12b3d4d73a929067dcc0df309` |
| 4 | `src/pages/dashboard/index.vue` | `/dashboard` | `Project Hub Dashboard - Light Mode` | `12881573168441930751` |
| 5 | `src/pages/projects/ProjectOverview.vue` | Tab 1 in `ProjectWorkspacePage` | `Shine Project Overview - Light Mode` | `13620879570122709638` |
| 6 | `src/pages/projects/ProjectEpisodes.vue` | Tab 2 in `ProjectWorkspacePage` | `Shine Project Episodes - Aligned Light Mode` | `8104298670513728376` |
| 7 | `src/pages/projects/ProjectAnalysis.vue` | Tab 3 in `ProjectWorkspacePage` | `Shine Project Analysis - Aligned Light Mode` | `17195845267597029307` |
| 8 | `src/views/workspace/DistributionPage.vue` | Tab 4 in `ProjectWorkspacePage` | `Distribution - The Neon Betrayal` | `75dfd782f6f040d497a8e470ffa34f59` |
| 9 | `src/pages/projects/ProjectRevenue.vue` | Tab 5 in `ProjectWorkspacePage` | `Shine Project Revenue Dashboard - Aligned Light Mode` | `16184137747845329538` |
| 10 | `src/views/analytics/AnalyticsPage.vue` | `/analytics` | `Shine AI Analytics - Light Mode` | `12953174379253973739` |
| 11 | `src/views/team/TeamSharedPage.vue` | `/team` | `Shine Team Shared Workspace` | `95d9a1c795a444bc94638feefb505576` |
| 12 | `src/components/wizard/SeriesWizardModal.vue` | Modal (Step 1) | `Shine New Series Wizard: Core DNA (Step 1)` | `11140778263560975410` |
| 13 | `src/components/wizard/SeriesWizardModal.vue` | Modal (Step 2) | `Shine Wizard: Trend Hunt (Step 2)` | `17533407975003517667` |
| 14 | `src/components/wizard/SeriesWizardModal.vue` | Modal (Step 3) | `Shine Wizard: Compliance (Step 3)` | `16081193168861025981` |
| 15 | `src/pages/script/ScriptStudio.vue` | Tab 1 in `StudioWorkspaceModal` | `Script & Assembly - Shadows in the Code` | `9c1b87572ad3455b9c4c21922c815eba` |
| 16 | `src/views/workspace/EditPage.vue` | Tab 2 in `StudioWorkspaceModal` | `Episode Editor - Shadows in the Code` | `051bfc4eb3984724932723e6c1d70b73` |
| 17 | `src/views/workspace/VoiceDubbingPage.vue` | Tab 3 in `StudioWorkspaceModal` | `Voice & Music - Shadows in the Code` | `25df126fad9b4e709ae3037c88d44744` |
| 18 | `src/views/workspace/CaptionsPage.vue` | Tab 4 in `StudioWorkspaceModal` | `Caption Management - Shadows in the Code` | `b3a499baa5ff44d686ca59ab589b61d8` |
| 19 | `src/views/workspace/PublishPage.vue` | Tab 5 in `StudioWorkspaceModal` | `Export & Publish - Shadows in the Code` | `169c2eb110124f1c91ffbe9ceeb372ad` |

---

## 3. Production 44-Screen Visual Verification Registry (Live Assets)

The studio has evolved beyond initial Stitch prototypes into 44 production-verified application screens, archived under `docs/assets/screenshots/`:

| # | Screenshot Filename | Studio Module & Feature | Corresponding Frontend Component | Verification Evidence |
| :- | :--- | :--- | :--- | :--- |
| 01 | `01_landing_page.png` | Landing & Hero Section | `src/pages/Home.vue` | Marketing hero, CTA, feature highlights |
| 02 | `02_auth_signin.png` | Studio Authentication | `src/pages/auth/Login.vue` | Email/Pass & Google OAuth login form |
| 03 | `03_studio_dashboard.png` | Series Hub Dashboard | `src/pages/dashboard/index.vue` | Active series list, quick actions, stats |
| 04 | `04_viral_trends.png` | Viral Trends Radar | `src/views/trends/ViralTrendsPage.vue` | Real-time trending tropes & hashtag velocity |
| 05 | `05_asset_library.png` | Global Asset Library | `src/views/assets/AssetLibraryPage.vue` | Media assets, SFX, LoRA models, tags |
| 06 | `06_analytics_retention.png` | Analytics Audience Retention | `src/views/analytics/AnalyticsPage.vue` | 3-second dropoff graphs & retention curves |
| 07 | `07_analytics_heatmap_directives.png` | Engagement Heatmap & Screenplay Directives | `src/views/analytics/AnalyticsPage.vue` | Second-by-second viewer engagement heatmap & AI rewrite directives |
| 08 | `08_analytics_character_feedback.png` | Character Sentiment Feedback & Paywall Placement | `src/views/analytics/AnalyticsPage.vue` | Audience feedback clusters on characters & cliffhanger monetization |
| 09 | `09_settings_profile_channels.png` | User Profile & Connected Channels | `src/pages/settings/SettingsPage.vue` | Profile details, credentials, social distribution accounts |
| 10 | `10_settings_billing_plans.png` | Subscription Billing & Plans | `src/pages/settings/SettingsPage.vue` | Tier pricing (Free, Creator, Studio) |
| 11 | `11_settings_ai_models.png` | AI Model Pool & Antigravity Accounts | `src/pages/settings/SettingsPage.vue` | Gemini 3.5, Veo, Antigravity OAuth pool |
| 12 | `12_settings_credits_stock.png` | AI Credits & Stock Providers | `src/pages/settings/SettingsPage.vue` | Credit balances, Pexels/Pixabay API keys |
| 13 | `13_settings_platform_integrations.png` | Social Platform OAuth Accounts | `src/pages/settings/SettingsPage.vue` | YouTube, TikTok, Instagram OAuth connections |
| 14 | `14_settings_render_cluster.png` | Cloud Run Render Cluster FinOps | `src/pages/settings/SettingsPage.vue` | Autoscaling workers, vCPU/RAM utilization |
| 15 | `15_settings_grafana_observability.png` | Grafana Observability Dashboard | `src/pages/settings/SettingsPage.vue` | P95/P99 latency traces, token meters |
| 16 | `16_settings_user_management.png` | Enterprise RBAC User Management | `src/pages/settings/SettingsPage.vue` | Team member roles, permissions, audit log |
| 17 | `17_wizard_step1_launch_mode.png` | Series Wizard Step 1: Launch Mode & Trend Tropes | `src/components/wizard/SeriesWizardModal.vue` | Launch mode, trend selection, target market |
| 18 | `18_wizard_step2_genre_styles.png` | Series Wizard Step 2: Genre & 32+ Visual Styles | `src/components/wizard/SeriesWizardModal.vue` | 6 psychological story archetypes & visual styles |
| 19 | `19_wizard_step2_series_config.png` | Series Wizard Step 2: Series Parameter Config | `src/components/wizard/SeriesWizardModal.vue` | Aspect ratio, episode count, duration pacing |
| 20 | `20_wizard_step3_ai_master_plan.png` | Series Wizard Step 3: Master Blueprint | `src/components/wizard/SeriesWizardModal.vue` | Series narrative arc breakdown |
| 21 | `21_wizard_step3_characters.png` | Wizard Cast Persona Configuration | `src/components/wizard/SeriesWizardModal.vue` | Character roster, visual traits, voice bindings |
| 22 | `22_wizard_step3_three_act_structure.png` | Wizard 3-Act Structure Plan | `src/components/wizard/SeriesWizardModal.vue` | Act-by-act pacing & cliffhanger milestones |
| 23 | `23_wizard_step3_episodes_blueprint.png` | 24-Episode Production Blueprint | `src/components/wizard/SeriesWizardModal.vue` | Granular episode breakdown with cliffhangers |
| 24 | `24_wizard_step4_compliance_safety.png` | 95% Safety Compliance Check | `src/components/wizard/SeriesWizardModal.vue` | Safety verification score & green checkmark |
| 25 | `25_wizard_step4_grounding_citations.png` | Grounding & Search Citations | `src/components/wizard/SeriesWizardModal.vue` | Grounding search citations & provenance |
| 26 | `26_editor_agent_pipeline.png` | Episode NLE Timeline & Pipeline Status | `src/views/workspace/EditPage.vue` | Multitrack timeline with 9:16 preview |
| 27 | `27_editor_viral_trends_pipeline.png` | Live Viral Trends & Auto-Gen Sequence | `src/views/workspace/EditPage.vue` | Trend tracking & batch auto-generation pipeline |
| 28 | `28_editor_character_persona_modal.png` | Character Persona & LoRA Configuration | `src/components/modals/CharacterPersonaModal.vue` | Real-time avatar re-rendering & prompt anchors |
| 29 | `29_editor_screenplay_tab.png` | Screenplay Script Tab | `src/pages/script/ScriptStudio.vue` | Structured screenplay blocks, dialogues |
| 30 | `30_editor_cast_wardrobe_panel.png` | Cast & Wardrobe Consistency Panel | `src/views/workspace/EditPage.vue` | Character wardrobe locking & LoRA anchors |
| 31 | `31_editor_sets_props.png` | Sets & Narrative Props Engine | `src/views/workspace/EditPage.vue` | Physical location sets and story props |
| 32 | `32_editor_storyboard_scenes.png` | Visual Storyboard Frame Gallery | `src/views/workspace/EditPage.vue` | Keyframe image gallery per scene |
| 33 | `33_editor_neural_voices_dubbing.png` | Voice Dubbing & Speech Affect | `src/views/workspace/VoiceDubbingPage.vue` | Multi-speaker TTS & pitch/speed tuning |
| 34 | `34_editor_kinetic_subtitles.png` | Dynamic Kinetic Captions Studio | `src/views/workspace/CaptionsPage.vue` | Subtitle styling presets & karaoke bounce |
| 35 | `35_editor_pipeline_task_manager.png` | Pipeline Background Task Manager | `src/views/workspace/EditPage.vue` | Real-time generation job status & logs |
| 36 | `36_export_modal_presets.png` | Dual-Mode Video Export Modal | `src/components/export/ExportModal.vue` | WebCodecs vs Headless presets & resolutions |
| 37 | `37_export_in_progress_webcodecs.png` | Client WebCodecs In-Progress Rendering | `src/components/export/ExportModal.vue` | Canvas frame-by-frame encoding progress |
| 38 | `38_review_rendered_video.png` | Video Review Player Modal | `src/components/export/ReviewVideoModal.vue` | High-res MP4 inspection with scrub controls |
| 39 | `39_publish_wizard_step1_versions.png` | Publish Wizard Step 1: Version Picker | `src/components/publish/PublishWizardModal.vue` | Rendered MP4 version selection |
| 40 | `40_publish_wizard_step2_metadata_cover.png` | Publish Wizard Step 2: AI SEO Metadata & Cover | `src/components/publish/PublishWizardModal.vue` | Platform-tailored title, cover art, tags |
| 41 | `41_publish_wizard_step3_deploy.png` | Publish Wizard Step 3: Target Channels & Deploy | `src/components/publish/PublishWizardModal.vue` | YouTube Shorts, TikTok, Instagram Reels |
| 42 | `42_publish_wizard_success.png` | Live Deployment Confirmation | `src/components/publish/PublishWizardModal.vue` | Instant deployment verification with live links |
| 43 | `43_publish_task_manager_logs.png` | Publishing Background Dispatch Logs | `src/components/publish/PublishWizardModal.vue` | Streaming task execution & API dispatch logs |
| 44 | `44_live_youtube_shorts_published.png` | Live Verified YouTube Shorts Deployment | External YouTube Production Channel | Verified live playback on YouTube Shorts (`@TanDo-o9u`) |

