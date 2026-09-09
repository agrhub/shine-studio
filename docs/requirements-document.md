# Software Requirements Specification (SRS)
## Shine - AI Micro-Drama Video Studio

**Version:** 1.0
**Date:** August 9, 2026

---

## 1. Introduction

### 1.1 Purpose
This document specifies the software requirements for Shine, an enterprise-grade AI-powered platform for creating, producing, and distributing vertical short dramas (9:16 micro-drama / Chinese-style Wēi Duǎnjù). This document serves as the primary reference for the development team, QA, product managers, and stakeholders to understand the system's capabilities, constraints, and architecture.

### 1.2 Scope
Shine is a web-based Single Page Application (SPA) designed to revolutionize the production of vertical short dramas. The platform integrates advanced AI tools (Google Gemini, Veo, Vertex AI) to assist creators in every step of the workflow—from script generation and storyboard assembly to AI video generation, dubbing, auto-captioning, and multi-platform publishing. 

### 1.3 Definitions and Acronyms
* **Series**: A complete micro-drama project containing 20-50 episodes.
* **Episode**: A 1-3 minute vertical video within a series, containing multiple 4-8 second scenes.
* **Scene**: A 4-8 second clip, typically 15-45 scenes per episode on the VIDEO 1 track.
* **Wēi Duǎnjù**: Chinese-style micro-drama, typically characterized by 1-3 minute vertical (9:16) episodes with fast-paced storytelling and cliffhangers.
* **SPA**: Single Page Application.
* **TTS**: Text-to-Speech.
* **LoRA**: Low-Rank Adaptation (used for AI model fine-tuning and character consistency).
* **NLE**: Non-Linear Editing.
* **SFX**: Sound Effects.

### 1.4 References
* IEEE Std 830-1998, IEEE Recommended Practice for Software Requirements Specifications.
* Google Cloud Vertex AI & Veo API Documentation.
* TikTok, Meta Graph, and YouTube Shorts API Guidelines.

### 1.5 Overview
The rest of this document is organized into overall system description, specific functional requirements, non-functional requirements, external interface requirements, system constraints, data models, and API integrations.

---

## 2. Overall Description

### 2.1 Product Perspective
Shine operates as a cloud-hosted web application utilizing a Vue 3 + Vite frontend, a Node.js backend, and a robust microservices architecture for heavy media processing and AI generation. It interfaces with external LLMs and video generation models, cloud storage (S3-compatible), and major social media platforms.

### 2.2 Product Functions
* Complete end-to-end management of micro-drama projects.
* AI-driven script writing, scene breakdown, and storyboard generation.
* Multitrack NLE tailored for 9:16 aspect ratio.
* AI video generation and virtual environment rendering.
* Neural TTS dubbing, lip-syncing, and multi-language auto-captioning.
* Asset management including AI character continuity (LoRA).
* Direct publishing to TikTok, Instagram/Facebook Reels, and YouTube Shorts.
* Real-time collaboration and analytics tracking.

### 2.3 User Characteristics
* **Solo Creator**: Independent creators needing automated tools to produce high-quality content quickly.
* **Pro Creator**: Professional creators leveraging advanced AI, granular control, and analytics to maximize ROI and virality.
* **Team Member**: Editors, writers, or reviewers who collaborate on shared projects.
* **Admin**: Studio managers overseeing teams, billing, enterprise assets, and brand libraries.

### 2.4 Constraints
* High dependency on Google Vertex AI and Veo availability.
* Video rendering and processing require significant GPU and compute resources.
* Compliance with strict API rate limits for TikTok, Meta, and YouTube.
* Must support modern web browsers with WebGL/WebAudio capabilities.

### 2.5 Assumptions
* Users have a stable internet connection capable of handling high-resolution media uploads and streams.
* The target aspect ratio for primary output is strictly 9:16.

---

## 3. Functional Requirements

### 3.1 Series & Project Hub
* **FR-001**: **Dashboard Metrics Overview** - System shall display key performance indicators (views, retention, revenue) aggregated across all published drama series. (Must | All Roles)
* **FR-002**: **Series Grid View** - System shall list all active and archived series projects with thumbnail, status, and last modified date. (Must | All Roles)
* **FR-003**: **Series Creation** - System shall allow users to create a new drama series (20-50 episodes), defining global metadata (title, genre, target audience). (Must | Solo, Pro, Admin)
* **FR-004**: **Episode Management** - System shall allow users to view all episodes within a series, add new episodes, reorder, and manage individual 1-3 minute episodes. (Must | All Roles)
* **FR-005**: **Global Search & Filter** - System shall provide a global search bar to filter series by name, tags, status, or date. (Should | All Roles)

### 3.2 Drama Genre Onboarding Wizard
* **FR-006**: **Genre Selection** - System shall provide a wizard offering predefined micro-drama genres (e.g., Romance, Thriller, CEO, Revenge). (Must | Solo, Pro)
* **FR-007**: **AI Prompt Configuration** - System shall generate a base AI prompt tailored to the selected genre for subsequent script generation. (Must | Solo, Pro)
* **FR-008**: **Visual Style Selection** - System shall allow users to select an overall visual aesthetic (e.g., Cinematic, Anime, Realism). (Must | Solo, Pro)
* **FR-009**: **Template Generation** - System shall automatically create an initial project structure based on wizard inputs. (Should | Solo, Pro)
* **FR-074**: **Multi-Region Geo-Targeted Viral Trend & Competitor Script Hunting (Parallel MCP)** - System shall automatically scan social platforms (TikTok, Douyin, Kuaishou, YouTube Shorts, X) and App Store leaderboards to surface real-time viral drama topics, trending tropes, hashtag velocity, and competitor script hooks filtered by target region/country (`US` North America, `SEA_VN` Vietnam/Southeast Asia, `CN` China, `LATAM` Latin America, `JP_KR` East Asia, `EU` Europe). (Should | Pro, Admin)
* **FR-075**: **Cultural Compliance & Copyright Safety Engine (Parallel MCP / Gemini Guardrails)** - System shall perform multi-region content safety audits, age classification checks, and copyright/IP infringement scans on script, audio, and visual assets prior to publishing. (Must | All Roles)


### 3.3 Multi-Agent Script Pipeline & Scene Assembly
* **FR-010**: **AI Director Routing** - System shall utilize a Director Agent (Decision Layer) to route tasks to specialized sub-agents. (Must | All Roles)
* **FR-011**: **Story Skeleton Agent** - System shall generate the series-level narrative arc and episode breakdown using `generateContent()`. (Must | All Roles)
* **FR-012**: **Adaptation Strategy Agent** - System shall map synopsis chapters to episodes and establish the overall drama tone. (Must | All Roles)
* **FR-013**: **Script Agent** - System shall produce per-episode structured scripts containing multiple scenes in JSON format (`{ "scriptItem": { "episode": "EP XX", "scenes": [...] } }`) using `generateContent()` with `responseMimeType: 'application/json'`. (Must | All Roles)

* **FR-014**: **Supervision Agent** - System shall act as a quality gate, checking cross-episode consistency, hook strength, and dialogue pacing. (Must | All Roles)
* **FR-015**: **Scene Breakdown & Storyboard** - System shall parse per-episode scripts into 4-8 second scenes and generate static storyboard frames using `generateImage()` (Gemini native with responseModalities: IMAGE, or Imagen). (Must | Pro, Team)
* **FR-068**: **Script Editing Interface** - System shall provide a rich-text editor for manual adjustments to AI-generated scripts. (Must | All Roles)

### 3.4 Video Editor/Timeline
* **FR-016**: **Episode-Level Timeline** - System shall provide an episode-level non-linear multitrack timeline optimized for 9:16 aspect ratio, assembling 15-45 scene clips (4-8s each) on the VIDEO 1 track. (Must | All Roles)
* **FR-017**: **9:16 Canvas Preview** - System shall display a real-time preview of the video in a vertical mobile-device frame layout. (Must | All Roles)
* **FR-018**: **Media Bin Management** - System shall allow users to import, organize, and drag-and-drop media assets onto the timeline. (Must | All Roles)
* **FR-019**: **Basic Editing Tools** - System shall support cut, copy, paste, trim, split, and ripple delete operations on clips. (Must | All Roles)
* **FR-020**: **AI Video Generation** - System shall integrate with Veo via `generateVideo()` (veo-3.1-* at global location; supporting I2V, interpolation, and R2V) to generate 4-8s scene clips directly into the timeline. (Must | Pro, Admin)
* **FR-021**: **Timeline Snapping** - System shall snap clips to playhead, markers, and other clip boundaries. (Should | All Roles)
* **FR-071**: **Multi-User Timeline Change Tracking** - System shall record every timeline modification with user attribution (author, timestamp, version label e.g., `v1.2`, change summary). (Must | All Roles)
* **FR-072**: **Zero-Render Browser Preview** - System shall allow previewing any historical version snapshot directly in the browser by loading the timeline JSON state without initiating cloud MP4 rendering. (Must | All Roles)
* **FR-073**: **Timeline Version Restore** - System shall allow restoring the active episode timeline to any historical version snapshot while preserving full audit history. (Must | All Roles)
* **FR-084**: **OpenVideo Command-Driven Timeline API** - System shall implement OpenVideo's command-driven architecture (`Command` interface with `id`, `type`, `payload`, `meta`) for all timeline modifications (`clip.add`, `clip.update`, `clip.remove`, `clip.split`). (Must | All Roles)
* **FR-085**: **OpenVideo Real-Time Atomic Patch Sync for Collaboration** - System shall generate and broadcast lightweight OpenVideo atomic JSON patches (`Patch` interface with `op`, `path`, `value`, `oldValue`) over WebSockets during co-editing sessions. (Must | All Roles)
* **FR-086**: **Google Agent ADK Real-Time AI Director Assistant Chatbot** - System shall provide an in-editor AI Chatbot powered by **Google Agent ADK (Agent Development Kit)** and Google GenAI SDK (`@google/genai`) that binds natural language requests to registered ADK tools (`timelineCommandTool`, `scriptGenTool`, `facialAnchorTool`, `virtualSetTool`, `veoVideoGenTool`, `voiceDubbingTool`, `visualAudioQATool`) to execute `Command[]` sequences across all workspace modules and run 6 intelligent capabilities. (Must | All Roles)


* **FR-087**: **Automated Agent Pre-Commit Guard & Code Audit** - System shall enforce Git pre-commit hooks (`eslint-plugin-agent-guard`) to block commits containing unresolved stubs (`TODO`, `return null`, empty handlers). (Must | Admin)
* **FR-088**: **OpenVideo Dual-Rendering Frame-Accurate Parity Audit** - System shall perform automated frame-by-frame diff testing comparing Client WebGL Studio output vs Server Headless Node.js Compositor output prior to cloud batch rendering. (Must | All Roles)
* **FR-089**: **AI Resource & Vertex AI Cost Ceiling Guardrails** - System shall allow administrators to specify max compute budget caps per episode/series (e.g. $3.50 USD cap) and default to low-res proxy assets during editing. (Must | Admin)
* **FR-090**: **Viral A/B Hook & Multi-Ending Variant Generator** - System shall generate 3 hook/ending episode variations, track 24-hour social API retention metrics, and auto-select the winning narrative arc for future episodes. (Should | Pro, Admin)
* **FR-091**: **Interactive Branching Drama Engine** - System shall allow creating branching narrative story graphs with interactive choice overlays at episode climax points and auto-generating downstream branch episodes. (Could | Pro, Admin)
* **FR-092**: **AI In-Video Product Placement & Ad Insertion** - System shall composite sponsored 3D product assets onto scene background layers using OpenVideo Chroma Key and Layering APIs and render affiliate link overlays. (Should | Pro, Admin)
* **FR-093**: **Offline-First Hybrid Sync Engine & IndexedDB Caching** - System shall cache timeline states and OpenVideo command patches in IndexedDB during offline operation and automatically synchronize patches with the cloud upon reconnection. (Should | All Roles)
* **FR-094**: **End-to-End Conversational Chat-Driven Creative Pipeline** - System shall allow creators to initiate projects, generate 20-50 episode scripts, anchor character personas, build virtual sets, synthesize Veo video clips, render TTS voiceovers, and auto-generate styled captions exclusively through natural language chat prompts in the AI Director Chatbot. (Must | All Roles)
* **FR-095**: **Multimodal Chatbot Input & Context-Aware Dynamic Suggestion Chips** - System shall accept multimodal Chatbot inputs (Images, Videos, PDF/DOCX Documents, and Real-Time Voice via `connectLive()`) and dynamically render context-aware quick-action prompt chips based on the active workspace surface. (Must | All Roles)
* **FR-096**: **AI Chatbot Long-Term Vector Memory Bank & Series Knowledge Graph** - System shall implement a 4-tier memory architecture (Sliding Window Session Memory, Vertex AI Vector Search RAG, Series Knowledge Graph, and Context Token Compressor) to store and retrieve multi-episode scripts, character bibles, comments, and analytics curves in under 50ms without context window overflow. (Must | All Roles)
* **FR-097**: **Dynamic Kinetic Subtitle & Auto-Emoji Highlight Engine (Proposal 13)** - System shall render word-level karaoke highlight animations, bass-synced font bounce effects, and auto-generated emotion emojis based on dialogue sentiment. (Must | All Roles)
* **FR-098**: **Spatial Audio 3D Soundstage & AI Voice Acting Coach (Proposal 14)** - System shall render 3D spatial audio panning matched to video camera motion and dynamically analyze script emotion curves to auto-tune TTS pitch, pace, and reverb. (Should | Pro, Admin)
* **FR-099**: **AI Viral Cover Poster & A/B Hook Thumbnail Generator (Proposal 15)** - System shall scan episode frames for highest face aesthetic scores, generate 3 viral cover poster variants with hook title overlays, and support A/B testing via social APIs. (Should | Pro, Admin)
* **FR-100**: **Live Director Co-Pilot Mode (Proposal 16)** - System shall provide an interactive live co-pilot overlay on the video canvas offering real-time feedback on scene pacing, dialogue loudness, and visual continuity during playback. (Must | All Roles)
* **FR-101**: **Tiered Subscription Quotas & Watermark Enforcement** - System shall enforce feature tier limits (Free $0/mo, Creator Pro $29/mo, Studio Team $149/mo, Enterprise $499+/mo) and automatically composite a "Shine" visual watermark on Free tier exports. (Must | All Roles)
* **FR-102**: **Feature Gating Middleware & Credit Consumption Engine** - System shall validate user tier entitlements (checking resolution caps, episode counts, Persona anchor slots, AntV G6 access, product placement, and AI credits) prior to executing backend AI operations. (Must | All Roles)
* **FR-103**: **System Admin User Directory & Subscription Management Portal** - System shall provide an admin console (`/admin/users`) for System Admins to manage accounts, adjust subscription tiers, moderate custom LoRA assets, and track Stripe MRR billing metrics. (Must | Admin)
* **FR-104**: **FinOps Compute & Cloud Run Worker Controller** - System shall provide a FinOps dashboard (`/admin/render-cluster`) to monitor GCP Cloud Run render containers, track real-time Vertex AI token spend, and adjust automated cost ceiling caps. (Must | Admin)
* **FR-105**: **Customer Support User Impersonation & Project Rollback** - System shall provide a supporter portal (`/admin/impersonate`) allowing support staff (with user consent) to inspect user workspaces, khôi phục project snapshots, and retry failed render jobs without credit charges. (Must | Supporter, Admin)
* **FR-106**: **System Observability & OpenTelemetry Latency Portal** - System shall provide an observability console (`/admin/observability`) integrated with Grafana and OpenTelemetry to trace subagent reasoning latency, API error rates, and Pub/Sub queue depth. (Must | Admin)
* **FR-107**: **Public Marketing Landing Page** - System shall provide a high-converting public landing page (`/`) featuring an interactive studio demo, micro-drama showcase video grid, pricing cards, customer testimonials, and clear CTA buttons. (Must | All Roles)
* **FR-108**: **User Authentication & Social Single Sign-On (SSO)** - System shall provide secure authentication pages (`/auth/login`, `/auth/signup`) supporting Google and GitHub OAuth SSO, email/password JWT tokens, and Zod form validation. (Must | All Roles)
* **FR-109**: **Self-Service Password Reset Flow** - System shall provide a secure self-service password recovery flow (`/auth/forgot-password`, `/auth/reset-password`) with time-limited email verification tokens. (Must | All Roles)
* **FR-110**: **Legal & Compliance Pages** - System shall render accessible legal pages (`/terms`, `/privacy`) detailing Terms of Service, Cookie Policies, and GDPR/CCPA privacy compliance. (Must | All Roles)
* **FR-111**: **Contact Us & Support Ticket Form** - System shall provide a public contact page (`/contact`) allowing users to submit support inquiries, bug reports, and sales requests. (Must | All Roles)
* **FR-112**: **Interactive User Manual & Knowledge Base** - System shall provide an interactive documentation portal (`/manual`) containing step-by-step onboarding guides, AI Director prompt tips, keyboard shortcut cheatsheets, and video tutorials. (Must | All Roles)
* **FR-113**: **Multi-Language System UI & vue-i18n Localization Engine** - System shall provide seamless client-side UI localization using `vue-i18n` (supporting English `en`, Vietnamese `vi`, Chinese `zh`, Japanese `jp`, Spanish `es`, and French `fr`) with instant language switching and auto-detected Chatbot prompt localization. (Must | All Roles)
* **FR-114**: **AntV G6 Multi-Module Graph Visualization Suite** - System shall utilize `@antv/g6` graph visualization across 5 core workspace modules: Interactive Branching Narrative DAG Trees, Character Relationship & Lineage Graphs, Multi-Agent Workflow Execution Monitors, Spatial Audio 3D Soundstage Positioning, and Asset Dependency Lineage Graphs. (Must | Pro, Admin)
* **FR-115**: **1-Click Web Novel-to-Series Auto-Converter Engine (Proposal 17)** - System shall ingest long-form manuscripts (PDF/TXT/EPUB), auto-parse chapter arcs, extract character bibles, and produce a 50-episode structured JSON script in under 60 seconds using Gemini 3.5 Flash. (Must | Solo, Pro, Admin)
* **FR-116**: **Interactive TikTok/Douyin Live-Stream Drama Engine (Proposal 18)** - System shall ingest live-stream WebSocket comments, run real-time audience polling, and dynamically trigger AntV G6 scene branch switches and live AI video clip generation during live broadcasts. (Should | Pro, Admin)
* **FR-117**: **AI Virtual Actor Royalty & Character Marketplace (Proposal 19)** - System shall provide a marketplace (`/marketplace/actors`) for creators to publish 8-anchor Persona bibles and earn passive credit royalties whenever other studios feature their virtual actor in a drama series. (Should | Pro, Admin)
* **FR-118**: **Cultural Geo-Localization & Idiom Adaptation Engine (Proposal 20)** - System shall provide a cultural adaptation agent (`POST /ai/cultural-adapt`) that re-writes dialogue slang, adjusts visual wardrobe presets, translates background signs, and tunes regional TTS accents per target country. (Must | All Roles)
* **FR-119**: **Predictive Paywall Placement & Monetization Doctor (Proposal 21)** - System shall analyze viewer engagement curves to recommend the optimal episode paywall threshold (e.g. coin unlock at EP 6), coin pricing, and projected 30-day MRR. (Should | Pro, Admin)
* **FR-120**: **Cloud Pub/Sub Async Render Stream & Back-Pressure Engine (Proposal 22)** - System shall route high-volume 50-episode batch render jobs through GCP Cloud Pub/Sub and stream real-time progress events over Server-Sent Events (SSE) / WebSockets (`GET /api/render/stream`) to prevent HTTP gateway timeouts. (Must | All Roles)
* **FR-121**: **AI Royalty-Free Sound Check & Copyright Safety Engine (Proposal 23)** - System shall perform audio fingerprinting (`POST /audio/copyright-verify`) against global music databases and auto-replace copyrighted background tracks with safe Lyria 3 / Artlist AI soundtracks prior to publishing. (Must | All Roles)
* **FR-122**: **Virtual Canvas Viewport & Lazy Asset Streaming Engine (Proposal 24)** - System shall implement WebGL texture windowing and RAM garbage collection to only load the 5 video clips nearest to playhead, preventing browser memory crashes during 45-scene episode edits. (Must | All Roles)
* **FR-123**: **Responsive Touch-Optimized Gesture Studio (Proposal 25)** - System shall provide touch-optimized NLE controls (pinch-to-zoom timeline, swipe-to-trim, floating action wheel) for tablet and foldable mobile devices. (Should | All Roles)
* **FR-124**: **Smart Rights & Automated Revenue Split Engine (Proposal 26)** - System shall provide automated revenue sharing contracts (`/billing/revenue-splits`) distributing Stripe and social platform earnings automatically between writers, AI directors, and studio owners. (Should | Pro, Admin)
* **FR-125**: **C2PA AI Provenance & Invisible SynthID Watermarking Engine (Proposal 27)** - System shall embed C2PA cryptographic provenance metadata and Google SynthID invisible video/audio watermarks into all MP4 exports (`POST /export/c2pa-watermark`) to comply with EU AI Act & TikTok Content Credentials regulations. (Must | All Roles)
* **FR-126**: **Intra-Scene Emotional Curve & Vocal Affect Steering Engine (Proposal 28)** - System shall support mid-sentence SSML and prompt-based vocal affect steering (`POST /voices/steer-emotion`), allowing dynamic switches between whispering, crying, laughing, and explosive screaming. (Should | Pro, Admin)
* **FR-127**: **AI Multi-Platform Recutter & Algorithm Optimizer Engine (Proposal 29)** - System shall automatically re-edit 3-minute episode timelines into platform-optimized cuts (`POST /export/platform-recut`) - e.g., 59s fast cut for YouTube Shorts vs 90s narrative cut for TikTok Series vs 15s teaser for Instagram Reels. (Should | Pro, Admin)
* **FR-128**: **Shine Creator Template & Prompt Marketplace (Proposal 30)** - System shall provide a marketplace (`/marketplace/templates`) allowing creators to buy, sell, or share pre-built Drama Genre Presets, Virtual Sets, Color LUTs, and AntV G6 Story Trees for AI credit rewards. (Should | All Roles)
* **FR-129**: **Hybrid Dual-Engine AI Provider Router (Vertex AI + Google Flow Account Pool) (Proposal 31)** - System shall implement a hybrid provider router that dynamically falls back to an internal Google Flow Account Pool (`FlowAdapter`, `FlowSyncService`, `CaptchaService` reCAPTCHA solver) for free/draft image (Imagen 3.5, Narwhal) and 9:16 video generation (`veo_3_1_t2v_fast_portrait`, `veo_3_1_i2v_s_fast_portrait_fl`, `veo_3_1_r2v_fast_portrait`), reducing GPU operation costs by 70–90% while routing high-priority exports to paid Vertex AI. (Must | All Roles)
* **FR-130**: **Pluggable & Configurable Primary Database Engine (SQLite or MongoDB Choice)** - System shall implement a database abstraction layer (`IDatabaseProvider` repository pattern) allowing users/admins to choose either embedded SQLite (`better-sqlite3` at `./data/shine.db`) or MongoDB (`mongoose` / MongoDB Atlas) as their primary database via environment configuration (`DB_PROVIDER=sqlite` or `DB_PROVIDER=mongodb`), while maintaining 100% feature parity across both database drivers. (Must | All Roles)




















### 3.5 Auto-Captions & Styling
* **FR-022**: **AI Speech-to-Text** - System shall automatically transcribe timeline audio into text captions using AI. (Must | All Roles)
* **FR-023**: **Auto-Translation** - System shall translate captions into supported languages (en, vi, zh, jp, es, fr). (Must | Pro, Admin)
* **FR-024**: **Dynamic Styling Presets** - System shall offer viral styling presets for captions (e.g., word-by-word highlight, animated emojis). (Must | All Roles)
* **FR-025**: **Manual Subtitle Editor** - System shall provide an interface to manually correct transcribed text and adjust timing blocks. (Must | All Roles)

### 3.6 Export & Smart Publishing
* **FR-026**: **Cloud Rendering** - System shall offload project rendering to cloud workers, notifying the user upon completion. (Must | All Roles)
* **FR-079**: **OpenVideo WebGL Client-Side Rendering** - System shall utilize OpenVideo Pixi.js / WebGL `Studio` engine for real-time browser preview, interactive timeline editing, zero-render version preview (`studio.loadFromJSON()`), and client-side single-episode MP4/WebM export. (Must | All Roles)
* **FR-080**: **OpenVideo Headless Node.js Cloud Batch Rendering** - System shall support headless server-side rendering using OpenVideo `@openvideo/core` `Compositor` running in Node.js cloud workers to perform high-concurrency multi-episode rendering from serialized timeline JSON payloads (`studio.exportToJSON()`). (Must | All Roles)
* **FR-027**: **Multi-Platform OAuth Authorization** - System shall securely connect creator accounts for TikTok (Direct Post API), YouTube Shorts (Data API v3), Meta (Instagram Reels & Facebook Reels Graph API), and Douyin (ByteDance Open API). (Must | Pro, Admin)
* **FR-028**: **Multi-Platform Smart Publishing Workflow** - System shall push rendered vertical 9:16 videos directly to linked social platforms (TikTok, YouTube Shorts, Instagram Reels, Facebook Reels, Douyin) with 1-click single or multi-channel distribution. (Must | Pro, Admin)
* **FR-029**: **AI Cover Generation** - System shall generate engaging 9:16 video covers/thumbnails optimized for CTR. (Should | All Roles)
* **FR-030**: **Platform-Specific SEO & Hashtag Generator** - System shall generate platform-tailored post captions, hashtags (`#microdrama`, `#Shorts`, `#Reels`), timestamp chapter markers, and SEO metadata using AI. (Should | Pro, Admin)


### 3.7 Voice & Dubbing
* **FR-031**: **Neural TTS Engine** - System shall generate human-like voiceovers from text scripts using `generateAudio()` (single or multi-speaker TTS, PCM→WAV, 30 prebuilt voices, language auto-detected). (Must | All Roles)
* **FR-032**: **Emotion Control** - System shall allow users to specify emotional delivery parameters (e.g., angry, whisper, crying) for TTS. (Should | Pro, Admin)
* **FR-033**: **Voice Cloning/Custom Voices** - System shall support custom voice profiles (subject to legal/ethical constraints). (Could | Admin)
* **FR-034**: **Decoupled Audio/Video Lip-Sync Alignment** - System shall generate silent visual video clips on `VIDEO 1` via Veo 3.1 and separate TTS voiceover audio on `AUDIO 1` via Neural TTS, automatically adjusting video clip playback speed (0.8x-1.2x) or padding hold frames to match voiceover length. (Must | All Roles)
* **FR-083**: **Multi-Market Dubbing Auto-Timeline Re-alignment (Proposal 4)** - System shall support multi-language voice dubbing by swapping the Neural TTS audio file on `AUDIO 1` and automatically re-calculating target audio duration delta ($\Delta t_{\mu s}$) to re-align `VIDEO 1` scene clip bounds and OpenVideo `Caption` timing blocks without re-rendering visual video clips. (Must | Pro, Admin)


### 3.9 Analytics
* **FR-040**: **Audience Retention Graphs** - System shall retrieve and display minute-by-minute audience retention data from published platforms. (Must | Pro, Admin)
* **FR-041**: **Platform Revenue Tracking** - System shall aggregate estimated revenue data from monetized social channels. (Must | Pro, Admin)
* **FR-042**: **Virality Index Score** - System shall calculate a proprietary virality score based on initial engagement velocity. (Should | Pro, Admin)
* **FR-043**: **A/B Testing Analytics** - System shall track performance differences between episodes published with different hooks or covers. (Could | Pro, Admin)
* **FR-076**: **AI Comment Collection & Auto-Reply Agent** - System shall aggregate viewer comments from social platform APIs (TikTok, IG, YouTube) and generate context-aware, engagement-boosting replies using AI. (Should | Pro, Admin)
* **FR-077**: **AI Comment Moderation & Auto-Deletion** - System shall analyze viewer comments against community guidelines and automatically flag or delete toxic, spammy, or inappropriate comments via platform APIs. (Must | All Roles)
* **FR-078**: **Viewer Feedback Script Adaptation Loop** - System shall extract audience sentiment and crowd preferences from comment clusters and feed these metrics back into the AI Director pipeline to dynamically adjust storyline arcs for unreleased future episodes. (Should | Pro, Admin)


### 3.10 Audio Mixing
* **FR-044**: **Multi-track Audio Mixing** - System shall provide separate tracks for dialogue, SFX, and BGM with volume controls. (Must | All Roles)
* **FR-070**: **AI Music Generation** - System shall use `generateMusic()` (Lyria 3 via Vertex interactions.create() API) to produce contextual background music. (Should | Pro, Admin)
* **FR-045**: **AI Auto-Ducking** - System shall automatically lower BGM volume when dialogue is present. (Should | All Roles)
* **FR-046**: **Parametric EQ & Filters** - System shall provide basic EQ controls and voice enhancement filters (e.g., noise reduction, studio polish). (Should | Pro)
* **FR-047**: **Audio Keyframing** - System shall allow users to keyframe volume levels for precise audio mixing. (Must | Pro)

### 3.11 Viral Hook Analyzer & Dynamic Cliffhanger Engine
* **FR-048**: **First 3-Second Analysis** - System shall analyze the first 3 seconds of the video to predict viewer retention drop-off. (Should | Pro, Admin)
* **FR-049**: **Headline Variations** - System shall generate alternative text overlays for the opening hook. (Should | Pro)
* **FR-050**: **Visual Hook Overlays** - System shall provide template animations and visual effects optimized for immediate attention capture. (Must | All Roles)
* **FR-082**: **Dynamic Cliffhanger Hook Engine (Proposal 3)** - System shall automatically inject high-intensity OpenVideo GLSL transition clips (`glitch`, `flash`), keyframe zoom animations (`zoomIn`), 3s crescendo sound stingers on `SFX 1` track, and animated CTA captions at the 3-second mark before episode ends. (Must | All Roles)
* **FR-051**: **Hook Competitor Benchmark** - System shall compare the hook's pacing and visual density against a database of viral templates. (Could | Admin)

### 3.12 Virtual Set / AI Scene Environment
* **FR-052**: **Text-to-Environment** - System shall generate 3D/2.5D background environments based on text descriptions. (Must | Pro, Admin)
* **FR-053**: **Virtual Camera Engine** - System shall allow users to simulate camera movements (pan, zoom, tilt) within the AI-generated environment. (Should | Pro)
* **FR-054**: **AI Relighting** - System shall adjust lighting on foreground characters to match the generated virtual environment. (Should | Pro, Admin)
* **FR-055**: **Environment Preset Library** - System shall provide pre-generated environments common to micro-dramas (e.g., Luxury Office, Slums, Hospital). (Must | All Roles)

### 3.13 Collaboration Review
* **FR-056**: **Real-Time Co-Editing** - System shall allow multiple users to edit the same project timeline concurrently without data loss. (Must | Team, Admin)
* **FR-057**: **Frame-Accurate Comments** - System shall allow collaborators to leave notes and annotations on specific video frames. (Must | Team, Admin)
* **FR-058**: **Version History & Restore** - System shall maintain a history of project saves and allow restoration to previous states. (Must | All Roles)
* **FR-059**: **Approval Workflows** - System shall support assigning review tasks and marking episodes as "Approved for Publish". (Should | Admin)

### 3.14 Asset Library
* **FR-060**: **Centralized Asset Management** - System shall provide a shared library for organization-wide media, SFX, and branding. (Must | Team, Admin)
* **FR-061**: **AI LoRA Trainer UI** - System shall provide an interface for Pro/Admin users to upload image datasets and train custom LoRAs. (Should | Pro, Admin)
* **FR-062**: **Asset Tagging & Metadata** - System shall allow users to tag assets for easy discovery. (Must | All Roles)
* **FR-063**: **Environment Packs** - System shall support downloading and importing modular environment asset packs. (Should | Pro)

### 3.15 Transitions/SFX Library
* **FR-064**: **Video Transitions** - System shall provide a library of standard and AI-generated transitions (e.g., glitch, dissolve, zoom). (Must | All Roles)
* **FR-065**: **SFX Master Library** - System shall provide a categorized library of royalty-free sound effects common in micro-dramas (e.g., swish, dramatic boom). (Must | All Roles)
* **FR-066**: **Neural Soundstage** - System shall use AI to generate contextual ambient background noise based on the scene setting. (Could | Pro)
* **FR-067**: **Neural Overlays** - System shall apply AI-generated visual overlays (e.g., rain, dust motes, cinematic flares). (Should | Pro)
* **FR-071**: **Live Voice Input** - System shall support the `connectLive()` WebSocket multimodal live API for real-time voice interaction. (Should | Pro, Admin)

### 3.16 Bulk Social Publishing & Multi-Platform Distribution
* **FR-114**: **Bulk Social Publishing Center & 1-Click Multi-Channel Distribution** - System shall provide a dedicated 3-step publishing wizard (`PublishWizardModal.vue`) and background task manager allowing creators to select rendered versions, generate platform-tailored metadata/tags/descriptions via Gemini, pick target distribution channels (YouTube Shorts, TikTok, Instagram Reels, Facebook Reels, Douyin), and deploy instantly or schedule posts with real-time SSE progress streaming (`/api/publish/render/stream`) and live URL verification (e.g., live YouTube Shorts playback). (Must | Pro, Admin)

### 3.17 Sets, Locations & Narrative Props Engine
* **FR-115**: **Sets, Locations & Narrative Props Engine for Cross-Scene Continuity** - System shall support managing dedicated physical Sets (e.g., Luxury Penthouse, Neon Alley, Abandoned Warehouse) and key narrative Props (e.g., encrypted flash drive, antique pocket watch) linked to scene visual prompts and character wardrobe configurations, locking environment aesthetics and object consistency across multi-episode runs. (Must | All Roles)

### 3.18 Antigravity Google OAuth Account Pool & High-Throughput Token Manager
* **FR-116**: **Antigravity Google OAuth Account Pool & Rate-Limit Failover** - System shall support an enterprise account pool management system (`/api/antigravity-accounts`) allowing administrators to connect multiple Google OAuth accounts, track live health/quota metrics, automatically rotate active credentials when hitting rate limits, and ensure uninterrupted high-throughput script and video generation across the entire studio. (Must | Admin)

### 3.19 Grafana MCP Observability & Subagent Tracing
* **FR-117**: **Grafana MCP Two-Way Observability Portal & Subagent Latency Tracing** - System shall provide seamless integration with Grafana Cloud / OpenTelemetry to monitor real-time P95/P99 latency, token consumption per subagent (Director, StorySkeleton, ScriptAgent, SupervisionAgent), error rates, and render worker cluster health directly from the studio settings panel. (Must | Admin)

### 3.20 Dual-Mode Video Export & Interactive Review Player
* **FR-118**: **Dual-Mode Video Export & Interactive Review Player** - System shall provide an Export Modal supporting both client-side WebCodecs canvas rendering (zero cloud cost, instant export) and server-side headless Node.js batch rendering on Cloud Run, complemented by an instant Review Player modal allowing creators to inspect final rendered MP4s with playback scrubbing, resolution inspection, and 1-click launch into the Publishing Center. (Must | All Roles)

---

## 4. Non-Functional Requirements

* **NFR-001: Performance** - The web editor timeline must playback 1080p/4K proxy video smoothly at 30fps without dropping frames on standard hardware (Intel i5/M1 equivalent).
* **NFR-002: Performance** - Cloud rendering of a 3-minute 1080p episode must complete in under 5 minutes.
* **NFR-003: Scalability** - The backend must support automatic horizontal scaling to handle spikes in rendering jobs and simultaneous active WebSocket connections for collaboration.
* **NFR-004: Security** - All user media and generated assets must be stored in encrypted S3 buckets. API keys for external platforms must be stored using a secure vault service.
* **NFR-005: Reliability** - System must provide 99.9% uptime, with automated failover for AI inference fallbacks if a specific Vertex AI region goes down.
* **NFR-006: Usability** - The UI must strictly follow responsive design principles, though the editor is optimized for desktop (minimum 1920x1080 resolution).
* **NFR-007: Internationalization** - The application interface must fully support i18n for en, vi, zh, jp, es, fr out of the box.

---

## 5. External Interface Requirements

### 5.1 User Interfaces
* Modern, dark-themed Vue 3 SPA interface.
* Canvas-centric layout for the video editor with bottom-docked timeline and side panels for properties and asset management.

### 5.2 API Interfaces
* **Backend REST/GraphQL APIs**: Used by the frontend for CRUD operations on projects, scripts, and assets.
* **WebSocket API**: Used for real-time collaboration updates, rendering progress tracking, and chat.

### 5.3 AI Model Interfaces
* **Google Vertex AI**: Using Service Account JSON or ADC for text generation, modalities, and multi-agent systems.
* **Google Veo**: For high-fidelity video generation via `generateVideo()`.
* **Neural TTS API**: Google Cloud Text-to-Speech via `generateAudio()`.

### 5.4 Storage & Database Interfaces
* **Storage Provider Interfaces**: Google Cloud Storage (`gs://shine-studio-media`), Backblaze B2, S3-compatible endpoints, or local disk for uploading raw media, audio stems, and final rendered MP4s.
* **Database Provider Interfaces**: Google Cloud Firestore Native (`shine-db`), MongoDB, SQLite, and MapDB (in-memory Map + JSON disk).

---

## 6. System Constraints & Dependencies
* **Browser Compatibility**: Application officially supports modern evergreen browsers (Google Chrome 114+, Edge, Safari 16+, Firefox 113+).
* **Cloud Infrastructure**: Serverless microservices hosted on Google Cloud Run (`us-central1`), Cloud Pub/Sub, Cloud Scheduler, and Google Vertex AI.
* **Compliance**: Complies with GDPR, CCPA, and C2PA Content Credentials standards.

---

## 7. Data Requirements

### Core Data Models
* **User**: `id`, `email`, `role`, `tier`, `credits`, `created_at`
* **Series**: `id`, `title`, `genre`, `synopsis`, `target_episodes`, `status`, `characters[]`, `locations[]`, `props[]`
* **Episode**: `id`, `seriesId`, `number`, `title`, `synopsis`, `scenes[]`, `timeline`, `status`, `dubbing_settings`, `caption_settings`
* **Scene**: `id`, `heading`, `visual_prompt`, `camera_direction`, `duration_seconds`, `dialogue[]`, `storyboardFrameUrl`, `videoUrl`
* **Character**: `id`, `name`, `role`, `avatar_url`, `visual_dna`, `voice_id`
* **FlowAccount**: `id`, `email`, `sessionToken`, `accessToken`, `projectId`, `credits`, `status`, `updated_at`
* **CreditTransaction**: `id`, `userId`, `amount`, `action`, `timestamp`
* **Asset**: `id`, `name`, `type` (video/audio/image), `url`, `size`, `tags[]`, `metadata`

---

## 8. API Integration Requirements

* **Google Vertex AI / Gemini API**: Vertex AI exclusively using Service Account JSON or Application Default Credentials (ADC). Uses **Gemini 3.5 Flash** (`gemini-3.5-flash`) for LLM/scripting, **Google Veo 3.1** (`veo-3.1-generate-preview`) for primary 4–8s cinematic scene video rendering with R2V character anchors, and **Gemini Omni Flash** (`gemini-omni-flash-preview`) for instruction-based multimodal scene video editing, relighting, and visual modification via **Google GenAI SDK (`@google/genai`)** or **GenKit (`@genkit-ai/core`)**. Required env vars: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_APPLICATION_CREDENTIALS. Location routing: gemini-3.5-*, gemini-omni-* -> us-central1; veo-*, lyria-* -> global.
* **GCP Infrastructure Services**: Headless Node.js `@openvideo/core` Compositor batch render workers running on **GCP Cloud Run**, media assets hosted on **Google Cloud Storage (GCS)**, and async render jobs queued via **Cloud Pub/Sub**.



* **TikTok Open API**: OAuth 2.0 flow for account linking, Direct Post API for video publishing, Webhooks for analytics retrieval.
* **Meta Graph API**: Facebook/Instagram Reels publishing API, managing page access tokens and long-lived tokens.
* **YouTube Data API v3**: OAuth 2.0 flow, Video insert API (designating #Shorts), Analytics API.
* **Observability**: OpenTelemetry exporters configured to send traces and metrics to Grafana Cloud / Prometheus.


---
*End of Document*
