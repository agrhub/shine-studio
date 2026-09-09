# Shine - AI Micro-Drama Video Studio

## Product Feature Document

**Product Name:** Shine
**Document Version:** 1.0
**Date:** August 2026

---

## 1. Executive Summary

**Shine** is an enterprise-grade AI-powered platform tailored specifically for creating, producing, and distributing vertical short dramas (9:16 micro-dramas, popularized by Chinese-style Wēi Duǎnjù). Leveraging cutting-edge AI technologies (Google Vertex AI, Gemini, Google Veo), Shine streamlines the entire production pipeline from script generation and visual synthesis to audio mixing, auto-captioning, and cross-platform distribution. It is designed to empower modern creators and studios to produce high-retention, cinematic vertical video content at an unprecedented pace.

## 2. Product Vision & Target Users

### Product Vision
To be the ultimate AI Director and Production Studio for vertical micro-dramas, drastically reducing production time and costs while maintaining cinematic quality and character consistency. Shine aims to turn a single creator into a full production studio.

### Target Users
- **Independent Creators & Writers:** Looking to bring their scripts to life without massive budgets or equipment.
- **Digital Studios & Media Agencies:** Producing bulk vertical video content (TikTok, IG Reels, YouTube Shorts) and optimizing for virality and monetization.
- **Enterprise Brands:** Exploring new engaging ways to tell brand stories in short, serialized formats.
- **Localization Teams:** Adapting existing content to new markets using AI dubbing and translation.

## 3. Feature Matrix

| Feature Module | Description | Priority | Phase | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Project Hub & Series Studio** | Dashboard for all drama series, episode management, and creation wizards. | P0 | V1 | Active |
| **AI Series Wizard (4 Steps)** | Launch mode (Viral vs Manual), 6 archetypes, 32+ visual styles, AI master plan & 95% safety scan. | P0 | V1 | Active |
| **Script & Scene Assembly** | AI screenplay breakdown, dialog cue generator, and storyboard panel creation. | P0 | V1 | Active |
| **OpenVideo WebGL Timeline** | Vertical 9:16 canvas preview, multi-track timeline, clip trimming/splitting. | P0 | V1 | Active |
| **Sets & Key Props Engine** | Persistent virtual environments & key narrative props management for visual consistency. | P1 | V1 | Active |
| **Auto-Captions & Translation** | Word-level kinetic subtitles, karaoke timing, translation, and SRT export. | P0 | V1 | Active |
| **Dual-Mode Video Export** | Client WebCodecs render & Cloud Run headless Playwright WebCodecs worker. | P0 | V1 | Active |
| **Bulk Social Publishing (B9)** | AI viral metadata, cover generator, 1-click multi-deploy to YouTube Shorts, TikTok, Reels. | P0 | V1 | Active |
| **Pipeline Task Manager** | Background job execution tracking, produced assets repository (22+ items), and live logs. | P0 | V1 | Active |
| **Voice Casting & Dubbing** | Multi-speaker neural TTS, granular emotion/pitch control, multi-lang tracks. | P0 | V1 | Active |
| **AI Audio Stem Separation** | Meta Demucs v4 on Cloud Run for vocal isolation and clean BGM extraction. | P0 | V1 | Active |
| **AI Director Copilot (Chatbot)** | Interactive sidebar agent executing natural language timeline operations. | P0 | V1 | Active |
| **Persona & Cast Studio** | Character visual consistency reference sheets and avatar generators with LoRA anchors. | P0 | V1 | Active |
| **Asset Library (GCS / B2 / S3)**| Media management with Pexels stock video/photo & Freesound SFX search. | P0 | V1 | Active |
| **Analytics & Retention Engine** | Granular KPI tracking, episode retention curves, and platform export stats. | P1 | V1 | Active |
| **Antigravity AI Accounts Pool**| Google OAuth session rotation pool for resilient high-throughput Gemini & Veo generation. | P0 | V1 | Active |
| **Grafana Observability Portal** | Real-time Prometheus metrics, P99 API latency (142ms), subagent execution tracing, and cluster telemetry. | P1 | V1 | Active |
| **User Management & RBAC** | Multi-tenant user directory, 2FA security, role-based access control, and credit allocations. | P1 | V1 | Active |
| **Multi-DB Architecture** | Firestore Native (`shine-db`), MongoDB, SQLite, MapDB abstraction. | P0 | V1 | Active |
| **Cloud Run Infrastructure** | Serverless scale-to-zero microservices in `us-central1` with Cloud Scheduler. | P0 | V1 | Active |

## 4. Detailed Feature Descriptions

### 1. Project Hub / Dashboard 📊
The central command center for all productions. Provides a high-level overview of active series, produced episodes, average retention, and total revenue.
*   **Key Capabilities:** Project cards with genre tags and progress bars, 'New Series' creation CTA, Grid/List views, and sidebar navigation (My Projects, Team Shared, Asset Library).

### 2. AI Series Creation Wizard (4-Step Pipeline) 🧙‍♂️
An end-to-end 4-step wizard architected to transform high-level concepts or market trends into production-ready drama series:
*   **Step 1: Launch Mode & Target Market:**
    - **Viral Trend Mode:** Real-time trend scraper detecting trending tropes across global markets (US, Vietnam, China, Japan, South Korea, Thailand, etc.) with auto-filled title, genre, and audience hooks.
    - **Manual Mode:** Full creative freedom to define custom premise, original characters, and bespoke narrative constraints.
*   **Step 2: Series Configuration & Visual Styles:**
    - **6 Psychological Story Archetypes:** Revenge/Drama, Romance/Contract, Suspense/Mystery, Satire/Comedy, Fantasy/Rebirth, Sci-Fi/Cyberpunk.
    - **32+ AI Video Visual Rendering Styles:** Realistic, Illustration, Anime, Cinematic, 2-Tone Minimalist, 3D Kawaii Chibi, Cute Minimalism, Chaotic Red Ink, B&W Film Noir, 90s Comic Book, Surrealism, etc.
    - **Format & Pacing Parameters:** 9:16 vertical (TikTok/Shorts/Reels) or 16:9 cinematic, target episode duration (30s–10m), and total series episode count (10–100 episodes).
*   **Step 3: AI Master Plan & Script Consultant:**
    - **Story Core & Franchise Attraction:** Series synopsis, logline, key leverage & rule boundary, and psychological catharsis design.
    - **Consistent Cast Persona DNA:** Protagonist, antagonist, and supporting roles with personality traits, dialogue styles, signature wardrobe, and LoRA visual continuity anchors.
    - **Three-Act Structure:** Thematic core questions, rising tension, and act-level climaxes.
    - **24-Episode Production Blueprint:** Granular scene core, conflict escalation, and high-retention cliffhanger hooks.
    - **Interactive AI Script Consultant:** In-wizard conversational assistant for real-time adjustments, plot twist additions, and pacing audits.
*   **Step 4: AI Safety, Commercial Compliance & Regulatory Grounding:**
    - **Multi-Dimensional Pre-Production Scan:** Evaluates Violence/Gore (98%), Adult Content (96%), Cultural Sensitivity (94%), and Copyright/IP (92%) resulting in a verified 95% SAFE commercial readiness score.
    - **Parallel MCP Grounding & Web Citations:** Real-time web search grounding for competitor script similarity, regional platform censorship redlines, and verified citations.
    - **AI Transparency & Watermarking:** Automated cryptographic metadata and Google SynthID watermarking toggle.


### 3. Script & Scene Assembly 📝
The creative core where scripts meet visual storyboarding.
*   **Key Capabilities:** Left panel manages characters and drama tone. Center provides a Script Editor with history and AI optimization. Right panel features a Scene Assembly storyboard grid with timecodes, synthesizing states, and 'Generate Scenes' capability powered by the AI Director Agent.

### 4. Video Editor / Timeline 🎬

> **Note:** Shine's content model is **Series → Episodes → Scenes**. The Video Editor is the **Episode-level editor** — each episode runs 1–3 minutes and is composed of multiple short scenes (4–8 seconds each). This editor operates on one episode at a time within the context of its parent series.

A specialized non-linear editor (NLE) optimized for vertical 9:16 content at the **episode level**.

#### Episode Editor — UI Breakdown

| UI Zone | Component | Purpose |
|---|---|---|
| **Left Panel** | Media Assets | Browse & import raw clips, AI-generated images/videos for the current episode |
| **Left Panel** | AI Tools | Quick access to Image Gen, Video Gen, Voice Gen (all scoped to current episode) |
| **Center** | 9:16 Preview Canvas | Vertical phone mockup showing the assembled episode at the current playhead position |
| **Center** | Playback Controls | Play / Skip-to-start / Skip-to-end controls with timecode display |
| **Center** | Timeline | Multi-track horizontal timeline: **VIDEO 1** (scene clips), **AUDIO 1** (music/ambience), **SUBS** (caption cues) |
| **Center** | Timeline Toolbar | Zoom in/out, Snap toggle, Auto-Cut (AI-assisted cut point detection) |
| **Right Panel** | Scene Inspector | AI Scene Prompt textarea + "Synthesize Scene" to regenerate the selected clip |
| **Right Panel** | Production Balance | Donut chart showing composition ratio: AI Generated (65%) / Raw Material (25%) / SFX/Audio (10%) |
| **Right Panel** | Resolution Settings | Output resolution selector (4K Vertical 2160×3840, 1080p, etc.) |
| **Right Panel** | Frame Rate Settings | Frame rate selector (24 FPS Cinematic, 30 FPS, 60 FPS) |

#### Scene Clip Model
Each clip on the VIDEO 1 track represents **one scene**, typically 4–8 seconds. The timeline for a standard episode (1–3 min) will contain:
- **15–45 scene clips** on the video track
- Corresponding audio segments on AUDIO 1
- Matching caption cues on the SUBS track

#### Key Capabilities
- Media assets panel with Recent Generations and AI tools (Image Gen, Video Gen, Voice Gen)
- 9:16 vertical preview canvas with phone-frame UI
- Multi-track timeline (VIDEO 1 / AUDIO 1 / SUBS) with clip-level Snap and Auto-Cut
- Scene Inspector: per-clip AI prompt and re-synthesis button
- Production Balance visualization (AI-generated 65%, raw material 25%, SFX/audio 10% ratio)
- Resolution & frame rate configuration (4K Vertical 2160×3840 @ 24 FPS Cinematic)
- **Multi-User Timeline History & Change Tracking:** Log every timeline edit with user attribution (author, timestamp, version label e.g., `v1.2`, change summary).
- **Multi-User Real-Time Collaboration via OpenVideo Patches (Proposal/OpenVideo Integration):**
  - Uses OpenVideo atomic **Patch System** (`interface Patch { op: "add" | "update" | "remove", path: string, value?: any, oldValue?: any }`) operating on JSON Pointer paths (e.g. `/clips/clip_123/transform/x`).
  - Broadcasts lightweight delta patches over WebSockets during co-editing sessions so multiple team members see live timeline moves, trims, and caption updates without re-sending full JSON state blobs.
  - Supports deterministic inverse-patch undo/redo (`core.applyPatches(patches)`).
- **OpenVideo Command-Driven Architecture:**
  - Every timeline mutation is executed as a structured, serializable JSON command (`interface Command { id, type, payload, meta }`).
  - Native command catalog: `clip.add`, `clip.update`, `clip.remove`, `clip.split`, `track.add`, `track.reorder`.
- **Real-Time AI Director Chatbot Integration (OpenVideo AI Integration):**
  - Integrated natural language AI Assistant/Director chatbot in the timeline editor panel.
  - Translates user chat prompts (e.g. *"Trim all scenes by 1 second and apply dynamic pop-up captions"*) into structured JSON `Command[]` arrays and executes them via `core.executeMany(commands)` for live, non-destructive timeline editing.
- **Zero-Render Browser Preview:** Load historical JSON snapshots directly into the browser timeline state (`studio.loadFromJSON()`) for instantaneous 9:16 canvas playback without initiating cloud MP4 rendering.
- **Dual Rendering Engine Architecture (OpenVideo Integration):**
  - **Client-Side Web-Based Rendering (Browser Studio):** Powered by OpenVideo (`Studio` / Pixi.js / WebGL / Web Audio API), handling real-time timeline editing, zero-render instant previews, and fast single-episode local exports.
  - **Server-Side Headless Node.js Batch Rendering (Cloud Compositor):** Powered by OpenVideo Headless Node.js (`@openvideo/core` `Compositor`), receiving serialized JSON payloads (`studio.exportToJSON()`) to perform high-concurrency, parallel multi-episode cloud rendering (e.g. rendering 20–50 episodes simultaneously on GCP Cloud Run workers).




#### Web-Based Video Editor Timeline JSON Schema (Ref: `apps/shine/tmp/data.ts`)

The web-based timeline video editor and rendering engine operate on a standardized JSON state schema (`data.ts`):

```json
{
  "settings": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "backgroundColor": "#111111",
    "format": "mp4",
    "videoCodec": "avc1.640033",
    "bitrate": 12000000,
    "audio": true,
    "audioCodec": "opus",
    "audioSampleRate": 48000,
    "prioritizeSpeed": true
  },
  "tracks": [
    {
      "id": "track_captions_01",
      "name": "Captions",
      "type": "caption",
      "clipIds": ["clip_cap_01", "clip_cap_02"]
    },
    {
      "id": "track_video_01",
      "name": "Video Track",
      "type": "video",
      "clipIds": ["clip_vid_01", "clip_vid_02"]
    }
  ],
  "clips": {
    "clip_vid_01": {
      "type": "Video",
      "id": "clip_vid_01",
      "name": "scene_01.mp4",
      "src": "https://cdn.shine.ai/assets/scene_01.mp4",
      "timing": {
        "display": { "from": 0, "to": 6833333 },
        "trim": { "from": 0, "to": 6833333 },
        "duration": 6833333,
        "playbackRate": 1
      },
      "transform": {
        "x": 0, "y": 0, "width": 1080, "height": 1920,
        "angle": 0, "opacity": 1, "zIndex": 10,
        "flip": { "x": false, "y": false }
      },
      "style": {},
      "chromaKey": { "enabled": false, "color": "#00FF00", "similarity": 0.1, "spill": 0 },
      "colorAdjustment": { "enabled": false, "type": "basic", "basic": {}, "hsl": {}, "curves": {} },
      "audio": true,
      "volume": 1,
      "metadata": { "previewUrl": "https://cdn.shine.ai/assets/thumb_scene_01.webp" }
    },
    "clip_cap_01": {
      "type": "Caption",
      "id": "clip_cap_01",
      "name": "Caption",
      "src": "",
      "timing": {
        "display": { "from": 240000, "to": 1360000 },
        "trim": { "from": 0, "to": 0 },
        "duration": 1120000,
        "playbackRate": 1
      },
      "transform": { "x": 245, "y": 1470, "width": 590, "height": 105, "angle": 0, "opacity": 1, "zIndex": 20, "flip": { "x": false, "y": false } },
      "style": {
        "fontSize": 80,
        "fontFamily": "Bangers-Regular",
        "fontWeight": "700",
        "color": "#ffffff",
        "align": "center",
        "stroke": { "color": "#000000", "width": 4 },
        "shadow": { "color": "#000000", "alpha": 0.5, "blur": 4, "offsetX": 2, "offsetY": 2 }
      },
      "text": "Where are you, Kael?",
      "caption": {
        "words": [
          { "text": "Where", "from": 0, "to": 300, "isKeyWord": false },
          { "text": "are", "from": 300, "to": 500, "isKeyWord": false },
          { "text": "you,", "from": 500, "to": 700, "isKeyWord": false },
          { "text": "Kael?", "from": 700, "to": 1120, "isKeyWord": true }
        ],
        "colors": {
          "active": { "color": "#ffffff", "background": "#FF5700" },
          "future": { "color": "#ffffff" },
          "keyword": { "color": "#ffffff", "preserveAfterSpoken": true }
        }
      },
      "metadata": { "sourceClipId": "clip_vid_01" }
    }
  }
}
```


### 5. Auto-Captions & Subtitle Styling 💬
Essential for sound-off viewing and international reach.
*   **Key Capabilities:** Live caption overlay on the 9:16 preview. Transcription tab with speaker/emotion tags. Dynamic styles (Pop-up, Minimal, Comic Action) and Auto-Translation to multiple languages (e.g., Spanish LatAm).

### 6. Dual-Mode Video Export & Review Player 🚀
High-performance rendering architecture supporting both local instant generation and scalable cloud jobs.
*   **Key Capabilities:**
    - **Dual-Mode Rendering Engine:**
        - **Local In-Browser Render:** Zero-server-cost client rendering powered by WebCodecs (`mediabunny` / `ExportModal`) with live frame-by-frame progress, resolution selector (720p, 1080p, 1440p 2K, 2160p 4K Ultra HD), and ETA countdown.
        - **Cloud Serverless Queue:** Asynchronous headless rendering via `@openvideo/video-renderer` Playwright WebCodecs workers on Google Cloud Run + Pub/Sub, featuring a managed `VideoRendererPool` (1–100 instances) with Out of Memory (OOM) protection.
    - **Post-Render Review Player:** Integrated in-app video preview player rendering burned-in kinetic subtitles, audio tracks, instant local MP4 download, direct Cloud Storage upload, and Cloud Render escalation triggers.

### 6.1 Bulk Export & Social Publishing Center (B9) 🌐
End-to-end automated 3-step publishing pipeline delivering content directly to short-form video platforms:
*   **Step 1: Available Rendered Versions:** Selection of multi-language rendered master video versions (e.g. `en-US` audio with burned-in subtitles, 1080×1920 9:16 Vertical HD) or local video file uploads.
*   **Step 2: AI Social Optimizer & Poster Cover:**
    - **Keyframe & AI Cover Generator:** 1-click extraction of high-impact keyframes from scene clips or custom AI-synthesized promotional posters.
    - **Viral Hook Title Generator:** Generates click-worthy, algorithm-optimized titles with expressive emojis and auto-filled trending hashtags.
*   **Step 3: Platform Channels & 1-Click Multi-Deploy:**
    - Direct OAuth channel dispatching to **YouTube Shorts**, **TikTok for Creators**, and **Meta Reels**.
    - Flexible scheduling modes: **Deploy Now** for immediate distribution or **Schedule Later** for release calendar alignment.
    - Live deployment confirmation with direct viewing links and Pipeline Task Manager stream upload activity logs (live-tested and verified on YouTube Shorts).

### 7. Voice & Dubbing 🎙️
Advanced neural voice synthesis and performance control.
*   **Key Capabilities:** Character Voice Profiles (e.g., Mara - Husky/Emotional). Dialogue text display with Emotion Tags (Sarcastic, Whispering). Lip-Sync Engine (frame sync tracking). Performance Engine for pitch shifting, intensity control, and Pro Mastering (Sibilance AI).

### 8. Character Consistency (Persona Studio) 🎭
Solves the hardest problem in AI video: keeping characters looking identical across scenes.
*   **Key Capabilities:** Persona management with Facial Consistency Anchors. Outfit Continuity locking. Continuity Check mesh matching (e.g., Face Match 98.4%). Generation modes (Hi-Fi, Proxy) and Character Strength weighting.

### 9. Analytics & Audience Engagement (Shine Insights) 📈
Actionable data to drive narrative decisions, monetization, and automated audience engagement.
*   **Key Capabilities:** 
    - KPIs (Total Views, Completion Rate, Revenue Est., Virality Index). Viewer Retention Analysis charts. Platform Revenue breakdown. Top Performing Episodes tracking.
    - **AI Audience Engagement & Comment Moderation Agent:** Aggregates viewer comments across TikTok, Instagram Reels, and YouTube Shorts. Auto-generates engaging, context-aware replies to boost platform interaction algorithms, while automatically flagging or removing toxic/non-compliant comments according to community guidelines.
    - **Viewer Feedback Loop & Script Adaptation Engine:** Performs sentiment and preference analysis on comment clusters (e.g. viewer demand for character pairings or plot twists), feeding real-time audience signals back into the AI Director pipeline to dynamically adjust script direction and scene pacing for unreleased future episodes.


### 10. Audio Mixing 🎧
Professional-grade audio post-production simplified by AI.
*   **Key Capabilities:** Master Mixer with AI Auto-Ducking (ducking music during dialogue). Multi-track timeline (Dialogue, Ambience, SFX). Effect Chains with Parametric EQ and AI Compressors.

### 11. Viral Hook Analyzer 🪝
Predictive AI to maximize the crucial first 3 seconds of a video.
*   **Key Capabilities:** Retention Prediction scoring. AI Headline Variations. Visual/Emotional Trigger analysis. Apply Hook Elements directly to the timeline.
*   **Dynamic Cliffhanger Hook Engine (Proposal 3):**
  - **OpenVideo GLSL Transition Injection:** Automatically inserts high-intensity transition clips (`transitionKey: "glitchMemories"`, `transitionKey: "fade"`, `transitionKey: "circleopen"`) at the 3-second mark before episode ends.
  - **OpenVideo Animation Keyframe Shake & Zoom:** Applies stackable property animations (`zoomIn` scale 1.0 → 1.4 over 400ms) and mask reveals (`rectExpand`) on freeze frames at shock reveal moments.
  - **Cliffhanger Sound Stinger & Dialogue Cut-Off:** Injects crescendo sound stingers on `SFX 1` audio track and cuts dialogue abruptly on a climax line.
  - **Animated Hook Captions:** Overlays bold, animated CTA text (*"EPISODE 2 UNLOCKED IN 3S"* / *"WILL KAEL SURVIVE?"*) using OpenVideo `Caption` clips with word-level highlight animation.

### 12. Virtual Set / AI Scene Environment Studio 🏙️
Generative backgrounds and sets.
*   **Key Capabilities:** Text-to-environment generation. Categories (Sci-Fi, Urban, Domestic) and Mood Presets (Cinematic Teal, Neo-Noir). Camera Engine for focal length control and AI Relighting.

### 13. Collaboration Review 👥
Enterprise features for team workflows.
*   **Key Capabilities:** Frame-accurate commenting on the 9:16 preview. Real-time collaboration presence. Version history and approval workflows.

### 14. Asset Library 📁
Central repository for AI models and resources.
*   **Key Capabilities:** Collections for AI Characters, LoRA Models, and Environments. LoRA Trainer widget for custom model tuning. Filter by Series.

### 15. Transitions/SFX Library 💥
Dynamic assets to elevate production value.
*   **Key Capabilities:** AI-enhanced transitions (Neural Flow, Neon Zoom). Mastering SFX list. Neural Designer for prompt-based custom sound generation with 3D spatial positioning.

## 5. AI Capabilities Summary

Shine is powered by the **`GeminiClient`** — a unified, multi-modal client that wraps the `@google/genai` SDK, connecting exclusively to **Google Vertex AI**.


### 5.1 Vertex AI Authentication

Shine connects to Google Vertex AI using one of two credential methods:

| Method | Description |
|---|---|
| **Service Account JSON** | A GCP service account key file (`GOOGLE_APPLICATION_CREDENTIALS`) for server-side authentication |
| **Application Default Credentials (ADC)** | Auto-detected from the environment (local `gcloud` login, Cloud Run, GKE workload identity, etc.) |

Vertex AI **location is dynamically resolved per model**:
- `gemini-2.5-*` models → regional location (e.g., `us-central1`)
- `gemini-3.x`, `veo-*`, `lyria-*`, `narwhal` models → `global` location

**Required environment variables:**
```env
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```


### 5.2 AI Modality Methods

| Method | Modality | Default Model | Notes |
|---|---|---|---|
| `generateContent()` | **TEXT / Multimodal** | `gemini-*-flash` | Supports system prompt, grounding, tools, thinking config, inline images |
| `generateImage()` | **IMAGE** | `gemini-*-image` / `imagen-*` | Gemini native: `responseModalities: ['IMAGE']`; Imagen: `generateImages()` API |
| `generateVideo()` | **VIDEO** | `veo-3.1-*` | Google Veo API; supports I2V (image start), interpolation (start+end frame), R2V (character references), async polling |
| `generateAudio()` | **AUDIO / TTS** | `gemini-2.5-flash` | Single-speaker or multi-speaker TTS; PCM→WAV conversion; speed/pitch steering via prompt |
| `generateMusic()` | **MUSIC** | `lyria-*` | Vertex AI Interactions API (Lyria 3); falls back to `generateContent` with `responseModalities: ['AUDIO']` |
| `connectLive()` | **VOICE (Live)** | `gemini-live-*` | WebSocket multimodal live API; supports session resumption, affective dialog, context window compression |

### 5.3 AI Director Agent — Multi-Episode Script Pipeline

Inspired by reference implementations (BigBanana AI Director's **Script-to-Asset-to-Keyframe** workflow and Toonflow's multi-agent script pipeline), Shine's AI Director operates as a **hierarchical multi-agent system**:

```
[Director Agent — Decision Layer]
      │
      ├── [Story Skeleton Agent]        → Generates series-level narrative arc, episode breakdown
      ├── [Adaptation Strategy Agent]   → Maps novel/synopsis chapters → episodes, sets drama tone
      ├── [Script Agent]                → Produces per-episode structured script with scene JSON
      └── [Supervision Agent]           → Quality gate: checks consistency, hooks, dialogue pacing
```

**Per-episode script output format** (JSON-structured for downstream pipeline):
```json
{
  "scriptItem": {
    "episode": "EP 04 - The Rooftop Confrontation",
    "scenes": [
      {
        "index": 1,
        "heading": "INT. NEON ALLEY - NIGHT",
        "action": "MARA stands under a flickering sign...",
        "dialogue": [
          { "character": "MARA", "line": "Where are you, Kael? You're never late.", "direction": "beat" }
        ],
        "durationSeconds": 7
      },
      {
        "index": 2,
        "heading": "EXT. ROOFTOP - CONTINUOUS",
        "action": "KAEL watches from above...",
        "dialogue": [
          { "character": "KAEL", "modifier": "V.O.", "line": "Too late, Mara. They're already here.", "direction": "CUT TO" }
        ],
        "durationSeconds": 6
      }
    ]
  }
}
```

**Character consistency across episodes** is maintained via:
- **LoRA model anchoring** — each character has a trained LoRA model (e.g., `Mara v4.2 — 1.4 GB`) injected as `referenceImages` in every Veo API call
- **Outfit continuity lock** — `CURRENT: "THE NIGHTSTALKER TRENCH"` texture/silhouette is enforced across all generated scenes
- **Facial consistency anchors** — up to 8 anchor slots per character, used for face mesh matching (98.4% target)
- **Multi-speaker TTS** — per-character voice profiles persisted across episodes (Mara: Emotional/Husky, Kael: Gravelly/Calm) with emotion tag control

### 5.4 Video Generation — Character Reference Pipeline (Veo)

When generating scene clips for an episode, `GeminiClient.generateVideo()` follows this flow:

```
1. Resolve reference images upfront
   ├── imageStart (first frame) → HTTP URL or S3 key → base64
   ├── imageEnd   (last frame for interpolation) → base64  
   └── characterImages[] (LoRA anchors) → base64 array

2. Build Veo API payload
   ├── model: 'veo-3.1-generate-preview' (location: 'global')
   ├── prompt: scene description from Script Agent
   ├── config.referenceImages: character anchors (R2V mode)
   ├── config.durationSeconds: 4–8s per scene
   ├── config.aspectRatio: '9:16'
   └── config.personGeneration: 'allow_adult'

3. Async polling (max 60 polls × 10s = 10 min timeout)
4. Return video bytes / GCS URI → upload to S3
```

### 5.5 Voice & Dubbing — Neural TTS Pipeline

Per scene dialogue line:
- **Single speaker**: `prebuiltVoiceConfig.voiceName` + optional speed/pitch prompt steering
- **Multi-speaker**: `multiSpeakerVoiceConfig` with per-character `voiceName` mapping; text pre-processed with `Speaker N: <line>` format
- **Output**: PCM L16 @ 24kHz → auto-converted to WAV with proper RIFF headers
- **30 available voices** (Zephyr, Puck, Charon, Kore, Fenrir, Aoede, etc.) — language auto-detected from input text

### 5.6 Music Generation — Lyria 3

Background music for scenes generated via `generateMusic()`:
- **Vertex path** (recommended): `interactions.create()` API with Lyria model at `global` location
- **Fallback path**: `generateContent()` with `responseModalities: ['AUDIO']`
- Output: base64 audio/mp3 → S3 storage → assigned to AUDIO 1 track in episode timeline

## 6. Integration Points

*   **Cloud Infrastructure:** S3-compatible object storage for massive video assets; MongoDB/SQLite for relational and document data.
*   **Social Platforms APIs:** Direct publishing and metadata syncing via TikTok Open API, Meta Graph API (Instagram Reels), and YouTube Data API v3.
*   **AI Cloud — Google Vertex AI via `GeminiClient`:**
    - Auth: Service Account JSON / ADC / API Key pool with automatic fallback
    - **Text/LLM**: `gemini-2.5-flash`, `gemini-3.x` via `generateContent()`
    - **Image**: Gemini native image models (`responseModalities: ['IMAGE']`) or Imagen (`generateImages()` API) via `generateImage()`
    - **Video**: Google Veo (`veo-3.1-*` at `global` location) via `generateVideo()` — supports Image-to-Video (I2V), start+end frame interpolation, and character reference images (R2V)
    - **Audio/TTS**: Gemini TTS (`responseModalities: ['AUDIO']`) — single/multi-speaker, PCM→WAV auto-conversion, 30 prebuilt voices via `generateAudio()`
    - **Music**: Lyria 3 via Vertex Interactions API (`interactions.create()`) via `generateMusic()`
    - **Live**: Gemini Live multimodal WebSocket (`connectLive()`) for real-time voice dubbing sessions
    - **File API**: `uploadFile()` / `waitForFileActive()` for large media upload to Gemini File API
    - See implementation: [`GeminiClient.ts`](../../../../../ams/AntStudio/server/src/integrations/ai/GeminiClient.ts)
*   **Multi-Episode Script Pipeline** (reference: BigBanana AI Director, LocalMiniDrama, Toonflow):
    - **Content hierarchy**: Series → Episodes → Scenes (4–8s clips) — same model as BigBanana's "项目 → 季 → 集" and LocalMiniDrama's 8-step pipeline
    - **Script-to-Asset-to-Keyframe** workflow: Story Skeleton Agent → Adaptation Strategy Agent → Script Agent → Supervision Agent → Visual Asset generation → Scene video clips → Episode assembly
    - **Character consistency** across all episodes via LoRA model injection in every Veo call (`referenceImages`), outfit continuity locking, and facial anchor mesh matching
    - **Canvas workflow** (inspired by LocalMiniDrama's LibTV-style canvas mode): each scene is a node in a visual pipeline — text → start frame → end frame → video clip → episode timeline
    - Reference apps: [`BigBanana-AI-Director`](../tmp/BigBanana-AI-Director-main), [`LocalMiniDrama`](../tmp/LocalMiniDrama-main), [`Toonflow`](../tmp/Toonflow-app-master)
*   **Observability:** Grafana + OpenTelemetry for system health, render queue monitoring, and AI inference latency tracking per credential type.

## 7. User Journey Flows

**Flow 1: Multi-Episode Series — From Concept to Cross-Platform Publish**

> Shine is built for **serialized drama** — not single episodes. A series typically contains 20–50 episodes, each 1–3 minutes long, with each episode composed of multiple short scenes (4–8 seconds each).

**Phase A — Series Setup (done once per series)**
1. Creator enters the *Onboarding Wizard*, selects genre (e.g., "Suspense"), configures drama tone and visual style (Cinematic Neon, Steady Handheld).
2. In *Persona Studio*, creator locks in AI character models (e.g., Mara v4.2 — Cyberpunk Spy; Kael v1.0 — Espionage), setting facial consistency anchors and outfit continuity rules.
3. In *Asset Library*, creator imports or trains LoRA models and uploads environment packs.

**Phase B — Episode Creation (repeated per episode)**
4. Creator opens a new episode (e.g., "EP 04 / 12") from the *Project Hub*.
5. In *Script & Scene Assembly*, creator inputs episode synopsis. The AI Director Agent expands it into a structured script with scene headers, action lines, and dialogue (Scene 1 — INT. NEON ALLEY - NIGHT, Scene 2 — EXT. ROOFTOP - CONTINUOUS, etc.).
6. Scene Assembly panel synthesizes 4–8s visual shots for each scene. Creator reviews the storyboard grid (with timecodes like 00:00–00:04, 00:04–00:08) and clicks **"Add All to Timeline"**.
7. In the *Episode Editor / Video Editor*, creator sees 15–45 scene clips assembled on the VIDEO 1 track spanning 1–3 minutes. Creator fine-tunes cuts, applies Snap and Auto-Cut, and uses the Scene Inspector to re-synthesize any clips.
8. In *Voice & Dubbing*, creator generates voiceover for each dialogue line per character, controlling emotion (Angry/Betrayed, Whispering) and performance (Intensity 82%, Pitch Shifter 1.2x). Lip-Sync Engine aligns generated audio to character face frames.
9. In *Auto-Captions*, creator auto-generates best captions, applies a style preset (Dynamic Pop-up), and enables Auto-Translation (e.g., Spanish LatAm) for international reach.
10. In *Audio Mixing*, creator adds Ambience track (TOKYO_NIGHT_RAIN_LOOP.WAV), SFX hits, enables AI Auto-Ducking so music drops during dialogue.
11. In *Viral Hook Analyzer*, creator checks the first 3 seconds — Retention Prediction Score 88/100 — selects the recommended "Betrayal Hook" headline (96% match).

**Phase C — Publishing**
12. Creator opens *Export & Smart Publishing*. Smart Cover Generator proposes 3 AI cover options. Creator confirms AI Viral Caption with hashtags (#NeonBetrayal #CyberDrama).
13. Creator selects platform targets (TikTok — Direct API, Instagram Reels — Auto-sync captions) and clicks **"Begin Cloud Render"** (est. 2.5 min for 4K output).
14. After render, creator hits **"Publish Now"**. Episode is live across all selected platforms.

**Phase D — Series Analytics**
15. Back in *Analytics (Shine Insights)*, creator monitors cross-episode performance: Viewer Retention (Day 1–30), Platform Revenue breakdown (TikTok 52%, IG 30%, YT 18%), Virality Index. Top performing episodes inform next episode's script direction.

**Flow 2: Team Collaboration on Revisions**
1. Editor A assembles a rough cut and requests review.
2. Producer B uses *Collaboration Review* to pin a comment at 00:04:12 ("Fix Mara's lip-sync here").
3. Editor A receives the notification, adjusts the *Voice & Dubbing* timing, and resolves the comment.
4. Editor A initiates Cloud Render.

## 16. Advanced Quality, Cost & Virality Infrastructure

### 16.1 Automated Agent Pre-Commit Guard (`eslint-plugin-agent-guard`)
- **Automated Code Integrity Enforcement:** Integrates Husky pre-commit hooks and custom ESLint rules to scan codebase edits for unresolved stubs (`TODO`, `FIXME`, `return null`, empty implementations).
- **Commit Rejection:** Automatically blocks commits or PRs containing unfinished mockups without formal tracking flags, ensuring production code safety.

### 16.2 OpenVideo WebGL vs Headless Dual-Rendering Parity Audit Engine
- **Frame-Accurate Parity Assurance:** Automated test engine (`Parity Audit Suite`) comparing frame-by-frame visual and audio output generated by the Client WebGL Studio (`Pixi.js`) against the Server Headless Node.js Compositor (`@openvideo/core`).
- **Discrepancy Alerts:** Flags any microsecond timing offset ($\mu s$) or GLSL shader mismatch prior to dispatching multi-episode cloud render jobs.

### 16.3 AI Resource & Vertex AI Cost Guardrails Controller
- **Budget Ceiling Enforcement:** Allows administrators to set hard cost caps per episode (e.g., max $3.50 USD compute ceiling) or series.
- **Proxy Preview Workflow:** Automatically defaults to low-resolution proxy assets during editing, invoking Vertex AI Veo 3.1 4K high-res generation only upon final export approval.

### 16.4 Viral A/B Hook & Multi-Ending Variant Generator (Growth Innovation)
- **Multi-Ending Generation:** AI Director generates 3 distinct hook stings and climax variations (Mystery, Action, Romance) for Episode 1.
- **Automated Performance Promotion:** Publishes variants across TikTok, Instagram Reels, and YouTube Shorts. After 24 hours of tracking viewer retention API metrics, the system automatically selects the highest-performing variant to drive the narrative arc for remaining episodes in the series.

---

## 17. Interactive, Monetization & Offline Hybrid Innovations

### 17.1 Interactive Branching Drama Engine (Proposal 9)
- **Branching Choice Overlays:** Allows creators to publish interactive micro-dramas (e.g. Bandersnatch-style mini-apps) with interactive choice overlays at episode climax points (*"Forgive Kael"* vs *"Expose Kael"*).
- **Dynamic AntV G6 Branch Graph:** Powered by **AntV G6 (`@antv/g6`)**, rendering an interactive Directed Acyclic Graph (DAG) narrative tree where nodes represent episodes and edges represent audience choice percentages. Supports node collapse/expand, custom SVG story thumbnails, real-time zoom/pan, and path analytics visualization.


### 17.2 AI In-Video Product Placement & Ad Insertion Engine (Proposal 10)
- **Contextual Sponsored Compositing:** Automatically identifies physical surfaces in scene environments (tables, desks, background displays) and seamlessly composites 3D sponsored products (e.g., brand beverage cans, cosmetics) onto visual layers using OpenVideo Chroma Key & Layering APIs.
- **Interactive Affiliate Overlays:** Embeds dynamic affiliate purchase links and discount codes synchronized with product appearances.

### 17.3 Offline-First Hybrid Sync Engine (Proposal 12)
- **IndexedDB PWA Local Caching:** Enables offline timeline editing and zero-render WebGL canvas previews using browser IndexedDB storage when network connectivity is disrupted.
- **Auto-Reconnection Delta Sync:** Queues OpenVideo atomic command patches (`Patch[]`) locally and automatically synchronizes them with cloud databases upon network restoration.

### 17.4 End-to-End Conversational Chat-Driven Creative Pipeline
- **Conversational Studio Control:** Empowers creators to build an entire 20-50 episode vertical drama series from scratch exclusively through natural language chat prompts in the AI Director Chatbot (Project creation -> Multi-agent script -> Persona anchoring -> Virtual sets -> Veo video synthesis -> Neural TTS -> Auto-captions).

### 17.5 Multimodal Chatbot Inputs & Context-Aware Action Chips
- **Multimodal Ingestion:** Ingests Images (actor portraits, reference costumes), Videos (sample camera motion), PDF/DOCX Manuscripts (novel-to-script adaptation), and Real-Time Voice streams (`connectLive()` WebSocket API).
- **Surface-Aware Dynamic Prompt Chips:** Renders dynamic action suggestion chips tailored to the active workspace panel (Script, Persona, Timeline, Captions, Export).

### 17.6 AI Chatbot Long-Term Memory Bank & Vector RAG Architecture
- **4-Tier Memory Engine:** Combines Sliding Window Session Memory, Vertex AI Vector Search RAG (`text-embedding-004`), Series Knowledge Graph entity lineage, and Context Token Compression to query 50-episode scripts, character bibles, comments, and analytics curves in under 50ms without context window overflow.

### 17.7 Dynamic Kinetic Subtitle & Auto-Emoji Highlight Engine (Proposal 13)
- **Kinetic Karaoke Highlights:** Renders word-level yellow karaoke pop-up text, bass-synced font bounce effects, and auto-generates dialogue sentiment emojis (`🔥`, `😱`, `💔`).

### 17.8 Spatial Audio 3D Soundstage & AI Voice Acting Coach (Proposal 14)
- **3D Spatial Panning:** Automates 3D audio spatial positioning matched to camera movements; analyzes script emotion curves to auto-tune TTS pitch, pace, and room reverb.

### 17.9 AI Viral Cover Poster & A/B Hook Thumbnail Generator (Proposal 15)
- **Smart Aesthetic Scanning:** Scans video frames for highest face aesthetic match, applies viral hook title overlays, and generates 3 cover poster options for social A/B testing.

### 17.10 Live Director Co-Pilot Mode (Proposal 16)
- **Real-Time Canvas Overlays:** Displays interactive co-pilot feedback bubbles directly on the video canvas during playback, highlighting pacing issues, audio loudness spikes, and scene continuity.

### 17.11 Subscription Tiers & Tiered Feature Gating System
- **Freemium SaaS Tiers:** Enforces feature access across 4 subscription tiers: Free ($0/mo, 100 AI credits, 720p watermarked), Creator Pro ($29/mo, 1,500 credits, 1080p HD, 3 dubbing languages), Studio Team ($149/mo, 10,000 credits, 4K export, AntV G6 story trees, 3D product placement, 5-editor co-editing), and Enterprise ($499+/mo, custom LoRAs, dedicated Cloud Run render clusters).

---

## 18. Admin & Operations Back-Office Suite (`/admin`)

1. **System Administrator Console (`/admin/users`):** User directory management, role-based access control (RBAC), subscription tier upgrades/downgrades, global LoRA asset moderation, and Stripe MRR revenue tracking.
2. **FinOps & Compute Manager Dashboard (`/admin/render-cluster`):** GCP Cloud Run render container cluster status monitoring, real-time Vertex AI token cost ceiling controllers ($3.50/ep cap), and Cloud Pub/Sub queue depth gauges.
3. **Customer Supporter Portal (`/admin/impersonate`):** Consent-based user session impersonation, 1-click project timeline snapshot rollback, ticket management, and free render retry triggers.
4. **Agent Observability Suite (`/admin/observability`):** OpenTelemetry latency tracing per subagent (Director, Script, Veo, TTS), API error rate heatmaps, and Grafana dashboard integration.

---

## 19. Public Surfaces, Authentication Suite & User Manual

1. **Public Landing Page (`/`):** High-converting marketing hero section, interactive WebGL studio playground demo, micro-drama video showcase grid, pricing cards, customer testimonials, and clear call-to-action (CTA) buttons.
2. **Authentication & SSO Suite (`/auth/login`, `/auth/signup`):** Email/password login with JWT access & refresh tokens, Google & GitHub OAuth 2.0 Single Sign-On (SSO), Zod form validation, and reactive password strength meters.
3. **Password Recovery Flow (`/auth/forgot-password`, `/auth/reset-password`):** Self-service email recovery link dispatching, secure time-limited token validation, and password reset form.
4. **Legal & Compliance Pages (`/terms`, `/privacy`):** Responsive legal documents detailing Terms of Service, Cookie Preferences, and GDPR/CCPA privacy rights.
5. **Contact Us & Support Ticket Portal (`/contact`):** Public inquiry form for customer support, bug reporting, and enterprise sales contact.
6. **Interactive User Manual & Knowledge Base (`/manual`):** Step-by-step onboarding guide, AI Director Chatbot prompt engineering cheat sheet, keyboard shortcut reference table, and embedded video walkthrough tutorials.
7. **Multi-Language System UI & Chatbot Localization (`vue-i18n`):** Full 6-language system UI localization (English `en`, Tiếng Việt `vi`, 简体中文 `zh`, 日本語 `jp`, Español `es`, Français `fr`) with instant Navbar switcher and auto-localized AI Chatbot responses.









### 20. Strategic Market & Growth Features (Proposals 17–21)

1. **1-Click Web Novel-to-Series Converter:** Auto-parses PDF/TXT/EPUB manuscripts, extracts character bibles, and generates a 50-episode structured JSON script in 60s using Gemini 3.5 Flash.
2. **TikTok/Douyin Live-Stream Drama Engine:** Real-time WebSocket comment ingestion & audience polling triggering AntV G6 scene branch switches and live AI video clip generation.
3. **AI Virtual Actor Royalty Marketplace (`/marketplace/actors`):** Creator hub for publishing 8-anchor Persona bibles and earning passive credit royalties when featured in third-party dramas.
4. **Cultural Geo-Localization Agent (`POST /ai/cultural-adapt`):** Re-writes dialogue slang, adapts visual wardrobe presets, translates background signs, and tunes regional TTS accents for 6 global markets.
5. **Predictive Paywall Placement & Monetization Doctor:** ML engagement curve analyzer recommending optimal paywall episode thresholds, coin pricing, and 30-day MRR projections.


### 21. Technical Infrastructure & UX Improvements (Proposals 22–26)

1. **Async Render Stream & Cloud Pub/Sub Queue (`GET /api/render/stream`):** Real-time SSE / WebSocket render progress streaming preventing 504 Gateway Timeouts during 50-episode batch jobs.
2. **AI Copyright Safety & Audio Fingerprinting (`POST /audio/copyright-verify`):** Pre-publishing audio scan auto-swapping copyrighted tracks with safe Lyria 3 / Artlist AI soundtracks.
3. **Virtual Canvas Viewport & Lazy Asset Memory Manager:** WebGL texture windowing loading only 5 scene clips nearest to playhead to prevent browser RAM Out-Of-Memory crashes.
4. **Touch-Optimized Tablet & Foldable Gesture Studio:** Pinch-to-zoom timeline scaling, drag-to-trim gesture handles, and floating AI action wheels for iPad and foldable devices.
5. **Automated Revenue Split & Smart Rights Manager (`/billing/revenue-splits`):** Automated income distribution between writers, AI directors, and studio owners.


### 22. AI Compliance, Vocal Control & Ecosystem Features (Proposals 27–30)

1. **C2PA AI Provenance & SynthID Watermarking (`POST /export/c2pa-watermark`):** Cryptographic C2PA metadata embedding and Google SynthID invisible video/audio watermarking on MP4 exports for EU AI Act compliance.
2. **Vocal Affect Steering & Intra-Scene Emotion Control (`POST /voices/steer-emotion`):** Micro-second SSML emotion switches (whispering, crying, laughing, screaming) matched to timeline keyframes.
3. **AI Platform Recutter & Algorithm Optimizer (`POST /export/platform-recut`):** Automatic re-editing into platform cuts (59s YouTube Shorts vs 90s TikTok vs 15s IG Reels teaser).
4. **Shine Creator Template & Prompt Marketplace (`/marketplace/templates`):** Creator Hub to buy, sell, or share pre-built Drama Presets, Virtual Sets, Color LUTs, and AntV G6 Story Trees for AI credit rewards.


### 23. Hybrid AI Generation Providers & Google Flow Pool Router (Proposal 31)

1. **Hybrid Provider Router:** Intelligently routes image and video generation requests between official paid GCP Vertex AI and internal Google Flow Account Pool (`FlowAdapter`, `FlowSyncService`, `CaptchaService`).
2. **Google Flow Account Pool Manager (`/admin/flow-accounts`):** Admin portal interface for managing `google-flow` session tokens (`flowST`), tracking account credits, monitoring automated token refresh cycles, and configuring reCAPTCHA solver settings (`yescaptcha`, `capsolver`, `capmonster`, or local browser solver).
3. **Zero-Cost Draft & Prototype Rendering:** Enables Free & Creator Pro tier users to generate draft storyboards and 9:16 Veo 3.1 video clips (`veo_3_1_t2v_fast_portrait`, `veo_3_1_i2v_s_fast_portrait_fl`, `veo_3_1_r2v_fast_portrait`) with 70–90% lower operational GPU cost.

---





## 8. Non-Functional Requirements



*   **Performance:** UI interactions must remain fluid (60fps) even with complex timelines. Video synthesis queuing must support parallel processing.
*   **Scalability:** The backend (Node.js) and rendering engines must auto-scale based on user generation demands, especially during peak viral publishing hours.
*   **Reliability:** Auto-save functionality every 10 seconds. Redundant cloud storage for all raw and generated assets.
*   **Localization:** UI fully translated into English, Vietnamese, Chinese (Simplified/Traditional), Japanese, Spanish, and French.
*   **Security:** Role-based access control (RBAC) for team shared projects. OAuth2 for social platform connections.
*   **UI Component Framework Alignment (`@fantastic-admin/example`):** Built on Vue 3 + Vite + TypeScript, utilizing `@fantastic-admin/components`, `reka-ui` accessible primitives, `splitpanes` resizable NLE layout panels, `vxe-table` high-performance grids, `@visactor/vchart` / `echarts` visualization, and `class-variance-authority` (CVA) styling matching the Fantastic Admin design system.

