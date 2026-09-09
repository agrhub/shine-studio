# Shine API Reference

## 1. Overview

**Shine** is a comprehensive AI Micro-Drama Video Studio platform. This RESTful API allows developers to programmatically access Shine's video generation, AI scripting, character consistency, dubbing, and publishing features.

### Base URL
All API requests should be prefixed with the following base URL:
```text
https://api.shine.ai/v1
```

### Content-Type
All requests must use `Content-Type: application/json` unless otherwise specified (e.g., `multipart/form-data` for file uploads). Responses are returned as JSON.

### Authentication
**Server-side AI calls use Google Vertex AI with Service Account or ADC. The REST API itself uses JWT Bearer for client→server auth, but all backend AI calls go exclusively through Vertex AI.**

- **Client → API Server:** Bearer JWT token
- **API Server → Google Vertex AI:** Service Account JSON (`GOOGLE_APPLICATION_CREDENTIALS`) or ADC
- **Required server env:** `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`

Pass the client token in the `Authorization` header:
```http
Authorization: Bearer <your_jwt_token>
```

### Rate Limiting
- **Standard Tier**: 100 requests per minute.
- **Pro Tier**: 500 requests per minute.
Rate limit status is returned in the response headers:
- `X-RateLimit-Limit`: Maximum requests allowed per window.
- `X-RateLimit-Remaining`: Remaining requests in the current window.
- `X-RateLimit-Reset`: Unix timestamp when the limit resets.

### Standardized Response Data Format (`ApiResponse<T>`)
ALL API endpoints return JSON payloads wrapped in the unified `ApiResponse<T>` envelope:

```json
{
  "code": 200,
  "data": { ... },
  "message": "Operation completed successfully",
  "error": null
}
```

- **`code` (number)**: Business status code (`200` / `0` for success, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `500` Internal Error).
- **`data` (object | array | null)**: Payload data result returned when `code === 200`.
- **`message` (string)**: Human-readable response summary or localized notification string.
- **`error` (object | string | null)**: Error details string or object when `code !== 200` (returns `null` on success).

### Pagination
List endpoints support pagination via query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Paginated responses include a `meta` object inside `data`:
```json
{
  "code": 200,
  "data": {
    "items": [ ... ],
    "meta": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8
    }
  },
  "message": "Success",
  "error": null
}
```
```

### Context & External Integrations
All AI generation endpoints accept an optional `project_id` and `episode_id` context to maintain continuity.
The API seamlessly integrates with:
1. **Google Vertex AI / Gemini API**: Script generation, storyboards, character bibles.
2. **Google Veo API**: High-quality video generation from text/image prompts.
3. **Neural TTS Engine (v4.2)**: Voice synthesis with emotion control.
4. **Parallel Web Search MCP**: Viral trend discovery.
5. **S3-compatible Storage API**: Secure asset management.
6. **Social Platforms**: TikTok Open API, Meta Graph API, YouTube Data API v3 for direct publishing.

---

## 2. Authentication Guide

### `POST /auth/login`
Authenticate and retrieve a JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "def502...",
  "expires_in": 3600,
  "user": {
    "id": "usr_123",
    "name": "Creator Alpha",
    "email": "user@example.com",
    "tier": "creator_pro",
    "aiCreditsRemaining": 1450
  }
}
```

#### `GET /billing/subscription`
Retrieve current user subscription tier, active limits, and feature flags.
- **Response (200 OK):**
  ```json
  {
    "tier": "studio_team",
    "status": "active",
    "aiCreditsRemaining": 9400,
    "features": {
      "exportResolution": "4K",
      "watermarkEnabled": false,
      "maxEpisodes": 80,
      "personaAnchorSlots": 8,
      "antvBranchingUnlocked": true,
      "productPlacementUnlocked": true,
      "maxCoEditors": 5
    }
  }
  ```

#### `POST /billing/checkout-session`
Create a Stripe/Stripe Checkout session for subscribing or purchasing AI credit top-ups.
- **Request Body:** `{ "tier": "creator_pro" | "studio_team" | "enterprise", "topUpCredits"?: 500 }`
- **Response (200 OK):** `{ "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..." }`

#### `POST /auth/signup`
Register a new user account with email, password, and full name.
- **Request Body:** `{ "name": "Jane Creator", "email": "jane@example.com", "password": "Password123!" }`
- **Response (200 OK):** `{ "access_token": "eyJhb...", "user": { "id": "usr_99", "tier": "free", "aiCreditsRemaining": 100 } }`

#### `POST /auth/forgot-password`
Dispatch self-service password recovery link with time-limited email token.
- **Request Body:** `{ "email": "user@example.com" }`
- **Response (200 OK):** `{ "message": "Password reset link sent to your email address." }`

#### `POST /auth/reset-password`
Reset password using verification token from email link.
- **Request Body:** `{ "token": "rst_token_123", "newPassword": "NewSecurePassword123!" }`
- **Response (200 OK):** `{ "message": "Password successfully reset. You may now login." }`

#### `POST /contact`
Submit public customer support ticket, bug report, or enterprise sales inquiry.
- **Request Body:** `{ "name": "Alex Smith", "email": "alex@company.com", "category": "sales" | "support" | "bug", "message": "We need custom enterprise LoRA training." }`
- **Response (200 OK):** `{ "ticketId": "tkt_402", "message": "Thank you! Our team will respond within 24 hours." }`


```

### `POST /auth/refresh`
Refresh an expired access token.

**Request:**
```json
{
  "refresh_token": "def502..."
}
```
**Response (200 OK):** Returns a new token payload similar to login.

### `POST /auth/logout`
Invalidate the current token.
**Response (204 No Content)**

### `GET /auth/me`
Retrieve the authenticated user's profile.
**Response (200 OK):** Returns the user object.

---

## 3. Endpoints

### Projects

#### `GET /projects`
Retrieve a paginated list of projects.
- **Query Params:** `page`, `limit`, `status` (active, archived)

#### `POST /projects`
Create a new drama series project.
- **Request:**
  ```json
  {
    "name": "Billionaire's Secret",
    "genre": "Romance Drama",
    "description": "A hidden heiress reclaims her throne."
  }
  ```
- **Response (201 Created):** Returns the Project object.

#### `GET /projects/:projectId`
Retrieve a specific project by ID.

#### `PATCH /projects/:projectId`
Update project details.

#### `DELETE /projects/:projectId`
Delete a project.

#### `GET /projects/:projectId/stats`
Retrieve stats: Active series, episodes produced, avg retention, total revenue.

---

### Series Management

```text
GET    /series                     — List all series for authenticated user
POST   /series                     — Create a new drama series (name, genre, tone, visualStyle)
GET    /series/:id                 — Get series details + episode list
PUT    /series/:id                 — Update series metadata
DELETE /series/:id                 — Delete series and all episodes
GET    /series/:id/episodes        — List all episodes in a series (with status, duration, sceneCount)
POST   /series/:id/episodes        — Create a new episode within a series
```

**Series Schema:**
```json
{
  "id": "string",
  "name": "The Neon Betrayal",
  "genre": "suspense | romance | action | satire",
  "tone": "string",
  "visualStyle": { "lighting": "string", "cameraMovement": "string" },
  "episodeCount": 12,
  "status": "active | completed | archived",
  "createdAt": "ISO8601"
}
```

---

### Episodes

#### `GET /projects/:projectId/episodes`
List episodes for a project.

#### `POST /projects/:projectId/episodes`
Create a new episode in a project.

#### `GET /episodes/:episodeId`
Retrieve episode details.

#### `PATCH /episodes/:episodeId`
Update episode metadata.

#### `DELETE /episodes/:episodeId`
Delete an episode.

#### `GET /episodes/:episodeId/timeline`
Retrieve the full episode timeline state used by the web-based video editor and rendering engine.

- **Response (200 OK):**
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
      { "id": "track_captions_01", "name": "Captions", "type": "caption", "clipIds": ["clip_cap_01"] },
      { "id": "track_video_01", "name": "Video Track", "type": "video", "clipIds": ["clip_vid_01"] }
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
        "transform": { "x": 0, "y": 0, "width": 1080, "height": 1920, "angle": 0, "opacity": 1, "zIndex": 10, "flip": { "x": false, "y": false } },
        "chromaKey": { "enabled": false },
        "colorAdjustment": { "enabled": false },
        "audio": true,
        "volume": 1,
        "metadata": { "previewUrl": "https://cdn.shine.ai/assets/thumb_scene_01.webp" }
      },
      "clip_cap_01": {
        "type": "Caption",
        "id": "clip_cap_01",
        "name": "Caption",
        "src": "",
        "timing": { "display": { "from": 240000, "to": 1360000 }, "trim": { "from": 0, "to": 0 }, "duration": 1120000, "playbackRate": 1 },
        "transform": { "x": 245, "y": 1470, "width": 590, "height": 105, "angle": 0, "opacity": 1, "zIndex": 20, "flip": { "x": false, "y": false } },
        "style": { "fontSize": 80, "fontFamily": "Bangers-Regular", "color": "#ffffff", "align": "center" },
        "text": "Where are you, Kael?",
        "caption": {
          "words": [
            { "text": "Where", "from": 0, "to": 300, "isKeyWord": false },
            { "text": "Kael?", "from": 700, "to": 1120, "isKeyWord": true }
          ],
          "colors": { "active": { "color": "#ffffff", "background": "#FF5700" }, "future": { "color": "#ffffff" } }
        },
        "metadata": { "sourceClipId": "clip_vid_01" }
      }
    }
  }
  ```

#### `PUT /episodes/:episodeId/timeline`
Overwrite the full timeline arrangement (tracks, clip timings, transforms, styles, animations, captions). Automatically creates a new history change checkpoint tagged with the authenticated user's ID.
- **Request Body:** `{ settings, tracks, clips, changeSummary?: "string" }`
- **Response (200 OK):** `{ "success": true, "versionId": "ver_9f8a7b6c", "versionNumber": 3, "updatedAt": "2026-08-09T18:37:00Z" }`

#### `GET /episodes/:episodeId/timeline/history`
Retrieve the complete change history list of timeline revisions for an episode, tracking all modifications made by team members.
- **Query Params:** `limit` (default 20), `offset` (default 0)
- **Response (200 OK):**
  ```json
  {
    "total": 3,
    "history": [
      {
        "versionId": "ver_9f8a7b6c",
        "versionNumber": 3,
        "label": "v1.2 - Adjusted captions and audio mix",
        "author": {
          "userId": "usr_4412",
          "name": "Sarah Chen",
          "avatar": "https://cdn.shine.ai/avatars/sarah.jpg"
        },
        "changeSummary": "Trimmed Scene 2 by 500ms, updated caption style to Dynamic Pop-up",
        "createdAt": "2026-08-09T18:30:00Z"
      },
      {
        "versionId": "ver_1a2b3c4d",
        "versionNumber": 2,
        "label": "v1.1 - Added background rain audio track",
        "author": {
          "userId": "usr_1082",
          "name": "Markus Weber",
          "avatar": "https://cdn.shine.ai/avatars/markus.jpg"
        },
        "changeSummary": "Added TOKYO_NIGHT_RAIN_LOOP.WAV on AUDIO 1 track",
        "createdAt": "2026-08-09T17:15:00Z"
      }
    ]
  }
  ```

#### `GET /episodes/:episodeId/timeline/history/:versionId`
Retrieve a specific historical timeline version snapshot for **zero-render browser preview**.
- **Preview Mechanism:** Loading this JSON payload directly into the browser's web-based timeline state allows real-time playback in the 9:16 canvas without initiating cloud video rendering.
- **Response (200 OK):**
  ```json
  {
    "versionId": "ver_1a2b3c4d",
    "versionNumber": 2,
    "author": { "userId": "usr_1082", "name": "Markus Weber" },
    "changeSummary": "Added TOKYO_NIGHT_RAIN_LOOP.WAV on AUDIO 1 track",
    "createdAt": "2026-08-09T17:15:00Z",
    "timelineData": {
      "settings": { "width": 1080, "height": 1920, "fps": 30 },
      "tracks": [ ... ],
      "clips": { ... }
    }
  }
  ```

#### `POST /episodes/:episodeId/timeline/restore`
Restore the active episode timeline to a specified historical version snapshot.
- **Request Body:**
  ```json
  {
    "versionId": "ver_1a2b3c4d",
    "reason": "Reverting to Markus's clean audio mix prior to caption restyle"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "restoredFromVersionId": "ver_1a2b3c4d",
    "newVersionId": "ver_fe8d9c0a",
    "newVersionNumber": 4,
    "activeTimeline": {
      "settings": { "width": 1080, "height": 1920, "fps": 30 },
      "tracks": [ ... ],
      "clips": { ... }
    },
    "createdAt": "2026-08-09T18:44:00Z"
  }
  ```



---

### AI Script & Scene Generation

#### `POST /ai/series/:id/generate-outline`
Runs Story Skeleton Agent: generates series-level narrative arc + episode breakdown list
- **Body:** `{ synopsis: "string", episodeCount: 12, genre: "string" }`
- **Response:** `{ episodes: [{episodeNumber: 1, title: "string", summary: "string"}] }`

#### `POST /ai/series/:id/episodes/:epId/generate-script`
Runs Adaptation + Script Agent: generates full per-episode script with scenes
- **Body:** `{ synopsis: "string", tone: "string", characterIds: ["string"] }`
- **Response:** `{ script: "string", scenes: [{index: 1, heading: "string", action: "string", dialogue: "string"}] }`

#### `POST /ai/series/:id/episodes/:epId/supervise-script`
Runs Supervision Agent: quality check on generated script
- **Response:** `{ score: 95, issues: ["string"], suggestions: ["string"] }`

#### `POST /ai/add-scene-hook`
Inject a viral hook into an existing scene.

#### `POST /ai/cliffhanger/generate`
Dynamic Cliffhanger Hook Engine (Proposal 3): Automatically generates and injects an intense 3-second cliffhanger sequence into an episode timeline using OpenVideo GLSL shader transitions (`glitch`, `flash`), keyframe zoom animations (`zoomIn` scale 1.0 → 1.4), 3s crescendo audio stinger on `SFX 1`, and animated CTA caption overlays.
- **Request Body:**
  ```json
  {
    "episodeId": "ep_01",
    "climaxSceneId": "scene_15",
    "transitionKey": "glitchMemories",
    "stingerType": "cinematic_impact_riser",
    "ctaText": "EPISODE 2 UNLOCKED IN 3S",
    "freezeFrameMs": 800
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "episodeId": "ep_01",
    "cliffhangerInjected": true,
    "insertedClips": {
      "transitionClipId": "clip_trans_glitch_01",
      "animationId": "anim_zoom_freeze_01",
      "sfxClipId": "clip_sfx_stinger_01",
      "captionClipId": "clip_cap_cta_01"
    }
  }
  ```

#### `GET /ai/script-history/:episodeId`

Retrieve the history of AI script revisions.

#### `GET /ai/trends/viral-topics`
Parallel MCP real-time scan of TikTok, Douyin, Kuaishou, YouTube Shorts, X, and App Store top charts for viral drama topics, high-retention tropes, hashtag velocity, and competitor script hooks.
- **Query Params:** `genre` (optional), `region` (enum: `US`, `SEA_VN`, `CN`, `LATAM`, `JP_KR`, `EU`, default: `US`)
- **Response (200 OK):** 
  ```json
  {
    "region": "SEA_VN",
    "lastScannedAt": "2026-08-10T09:50:00Z",
    "trendingTropes": [
      {
        "tropeId": "mother_in_law_revenge",
        "title": "Mẹ Chồng Nàng Dâu - Cuộc Chiến Gia Tộc",
        "viralScore": 98.4,
        "hashtagVelocity": "+142%/24h",
        "hookPattern": "Tập 1: Bị sỉ nhục tại tiệc gia tộc ➔ Tập 3: Tiết lộ thân phận Tống Giám đốc",
        "recommendedAudience": "Nữ 18-35"
      }
    ]
  }
  ```

#### `POST /ai/compliance/check`
Parallel MCP / Gemini Guardrails content safety, age classification, and copyright/IP infringement audit across script, audio, and visual assets.
- **Request:** `{ "seriesId": "string", "episodeId"?: "string", "targetRegions": ["US", "VN", "CN"] }`
- **Response (200 OK):** `{ "passed": true, "safetyRating": "PG-13", "violations": [], "copyrightRisk": "low" }`


---

### AI Image & Video Generation

#### `POST /ai/image-gen`
Generate images (storyboards, reference shots).
- **Request:**
  ```json
  {
    "prompt": "Cyberpunk city alleyway, neon lights, rainy",
    "style": "cinematic",
    "aspect_ratio": "9:16",
    "negative_prompt": "blurry, low quality, deformed",
    "project_id": "proj_123"
  }
  ```

#### `POST /ai/scenes/:id/generate-video`
Generate a purely visual (silent MP4) video clip using Google Veo 3.1 (`veo-3.1-generate-preview`) for primary 4-8s scene clips or Gemini Omni Flash (`gemini-omni-flash-preview`) for instruction-based video editing. Output MP4 is placed on `VIDEO 1` track without baked-in audio, allowing separate Neural TTS audio generation on `AUDIO 1` for multi-market dubbing.
- **Body:**
  ```json
  {
    "prompt": "Character walking dramatically towards camera in slow motion",
    "model": "veo-3.1-generate-preview",
    "durationSeconds": 4,
    "aspectRatio": "9:16",
    "imageStart": "string | null",
    "imageEnd": "string | null",
    "characterImages": ["string"],
    "async": true
  }
  ```
- **Response (sync):** `{ "url": "string", "mimeType": "video/mp4", "sceneId": "string", "isSilentVisual": true }`

- **Response (async):** `{ "jobId": "string", "status": "pending" }`

#### `GET /ai/scenes/:id/video-status/:jobId`
Poll async Veo job status.
- **Response:** `{ "status": "pending|done|error", "url": "string" }`

#### `GET /ai/recent-generations/:episodeId`
Retrieve recently generated assets for an episode.

---

### Characters & Consistency

#### `GET /characters`
List AI personas (supports `series_id` filter).

#### `POST /characters`
Create a new AI character persona.

#### `GET /characters/:characterId`
#### `PATCH /characters/:characterId`
#### `DELETE /characters/:characterId`

#### `POST /characters/:characterId/facial-anchors`
Extract facial anchors to maintain consistency across scenes.

#### `POST /characters/:characterId/wardrobe`
AI Character Wardrobe & Prop Swap Registry (Proposal 1): Select or register outfit/prop presets for a character (e.g. *Mara: Cyberpunk Spy Trenchcoat*) and swap them across scenes while maintaining 98.4% face mesh match.
- **Request Body:**
  ```json
  {
    "wardrobePresetId": "wardrobe_mara_trenchcoat_v1",
    "propIds": ["prop_blaster_01"],
    "targetSceneIds": ["scene_04", "scene_05"],
    "lockMaterial": true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "characterId": "char_mara_v4",
    "activePreset": "wardrobe_mara_trenchcoat_v1",
    "faceMeshMatch": 0.984,
    "updatedReferenceImages": [
      "https://cdn.shine.ai/characters/mara/trench_front.jpg",
      "https://cdn.shine.ai/characters/mara/trench_side.jpg"
    ]
  }
  ```

#### `GET /characters/:characterId/consistency-check`
Analyze face mesh and outfit continuity across generated episode shots.

#### `POST /characters/:characterId/sync-all-shots`
Apply visual corrections to sync character appearance across shots.

#### `GET /characters/:characterId/storyboard`
#### `POST /characters/export-persona/:characterId`


---

### Voice & Dubbing

#### `GET /voices`
List available neural voice profiles.

#### `POST /voices`
Create a custom voice profile (voice cloning).

#### `GET /voices/:voiceId`
#### `PATCH /voices/:voiceId`

#### `POST /ai/episodes/:id/generate-audio`
Synthesize multi-speaker speech from text.
- **Body:**
  ```json
  {
    "text": "How dare you betray me!",
    "voiceId": "Kore",
    "multiSpeaker": {
      "enabled": true,
      "speakers": [
        { "voiceId": "Kore", "characterId": "char_1" }
      ]
    },
    "speed": 1.0,
    "pitch": 0
  }
  ```
- **Response:** `{ "url": "data:audio/wav;base64,...", "mimeType": "audio/wav", "durationMs": 1500 }`

#### `GET /ai/voices`
List all 30 available Gemini TTS voices.
- **Response:** `[{ "id": "string", "name": "string", "gender": "string", "description": "string", "audioSampleUrl": "string" }]`

#### `GET /voices/generation-status/:jobId`
Poll TTS generation status.

#### `POST /voices/save-preset`
Save current voice parameters as a reusable preset.

---

### Captions

#### `POST /captions/auto-generate`
Auto-generate subtitles using speech-to-text.
- **Request:** `{ "episode_id": "epi_1", "language": "en-US" }`

#### `GET /captions/:episodeId`
#### `PUT /captions/:episodeId`
#### `PATCH /captions/:episodeId/cues/:cueId`

#### `POST /captions/translate`
Translate captions to another language.

#### `GET /captions/presets`
List subtitle styling presets (Dynamic, Classic, Comic).

#### `POST /captions/apply-style`
Apply a visual style preset to episode captions.

---

### Audio Mixing

#### `GET /audio/tracks/:episodeId`
#### `POST /audio/tracks/:episodeId`
#### `PATCH /audio/tracks/:episodeId/:trackId`
#### `DELETE /audio/tracks/:episodeId/:trackId`

#### `POST /audio/auto-duck`
Automatically lower BGM volume when voiceover is playing.

#### `POST /voices/dubbing/re-align`
Multi-Market AI Dubbing & Lip-Sync Auto-Timeline Re-alignment (Proposal 4): Synthesizes translated audio for target markets and automatically re-aligns `VIDEO 1` track clip durations (`display.from`, `display.to`, microsecond timing) and OpenVideo `Caption` timing blocks to match translated speech duration.
- **Request Body:**
  ```json
  {
    "episodeId": "ep_01",
    "targetLanguage": "es-LATAM",
    "autoAdjustVisualClips": true,
    "lipSyncEngine": true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "episodeId": "ep_01",
    "targetLanguage": "es-LATAM",
    "originalDurationUs": 120000000,
    "translatedDurationUs": 145000000,
    "reAlignedClipsCount": 18,
    "updatedCaptionsCount": 24,
    "timelineReAligned": true
  }
  ```

#### `POST /audio/render`
Render a finalized audio mixdown.

#### `GET /audio/render-status/:jobId`

---

### Music Generation

#### `POST /ai/music/generate`
Generate music using Lyria 3.
- **Body:** `{ "prompt": "string", "model": "lyria-002" }`
- **Response:** `{ "url": "data:audio/mp3;base64,...", "mimeType": "audio/mp3" }`

---

### Virtual Set / Scene Environment

#### `POST /environments/generate`
Generate 3D/2D virtual environments.
- **Request:** `{ "prompt": "Luxury penthouse office", "category": "interior", "mood_preset": "dusk", "count": 2 }`

#### `GET /environments`
#### `POST /environments/:environmentId/add-to-project`
#### `POST /environments/snap-to-scene`

---

### Viral Hook Analyzer

#### `POST /viral/analyze-hook`
Analyze the first N seconds of a scene for viral potential via MCP Web Search.
- **Request:** `{ "episode_id": "epi_1", "scene_id": "scn_1", "duration_seconds": 3 }`

#### `GET /viral/headline-variations/:analysisId`
Retrieve AI-suggested hook headlines based on current trends.

#### `POST /viral/apply-hook`
Apply a selected hook and headline to the scene.

---

### Export & Publishing

#### `POST /export/render`
Render the final video.
- **Request:**
  ```json
  {
    "episode_id": "epi_1",
    "resolution": "1080x1920",
    "frame_rate": 30,
    "format": "mp4"
  }
  ```

#### `GET /export/render-status/:jobId`
#### `POST /export/generate-cover`
#### `POST /export/ai-caption`

#### `POST /publish/tiktok`
Publish directly to TikTok.
- **Request:** `{ "episode_id": "epi_1", "cover_id": "cov_1", "caption": "Wait for the end! 😱", "hashtags": ["drama", "viral"] }`

#### `POST /publish/instagram`
#### `POST /publish/youtube`
#### `GET /publish/status/:publishJobId`

---

### Analytics

#### `GET /analytics/overview`
#### `GET /analytics/retention`
#### `GET /analytics/platform-revenue`
#### `GET /analytics/top-episodes`
#### `GET /analytics/virality-index`
#### `POST /analytics/export-report` (format: pdf|csv)

#### `GET /analytics/comments/:episodeId`
Aggregate viewer comments collected via social platform APIs (TikTok, Instagram, YouTube).
- **Response (200 OK):** `{ "total": 1250, "comments": [{ "commentId": "c1", "platform": "tiktok", "author": "user123", "text": "Kael can't die in ep 5!", "sentiment": "positive", "flagged": false }] }`

#### `POST /analytics/comments/:commentId/reply`
AI Audience Engagement Agent auto-generates a contextual, engagement-boosting reply to a viewer comment.
- **Request:** `{ "customInstruction"?: "Tease episode 5 cliffhanger" }`
- **Response (200 OK):** `{ "replyText": "Stay tuned for EP 05... Kael has one last trick up his sleeve! 🤫", "posted": true }`

#### `DELETE /analytics/comments/:commentId`
AI Comment Moderation Agent flags or deletes toxic, spammy, or community guideline-violating comments via platform APIs.
- **Request Body:** `{ "reason": "toxicity | spam | copyright_violation", "action": "delete | hide | block_user" }`
- **Response (200 OK):** `{ "success": true, "actionTaken": "delete" }`

#### `POST /ai/script/adapt-from-feedback`
Viewer Feedback Loop Engine: extracts sentiment and crowd preferences from comment clusters and feeds metrics into the AI Director pipeline to dynamically adjust storyline arcs for unreleased future episodes.
- **Request:** `{ "seriesId": "s1", "targetEpisodeNumber": 6, "commentClusterFocus": "Increase romantic tension between Mara and Kael" }`
- **Response (200 OK):** `{ "adaptationSummary": "Adjusted EP 06 Scene 4 to include rooftop rain confrontation", "revisedScript": { ... } }`


---

### Asset Library

#### `GET /assets`
#### `POST /assets/upload`
Upload an asset.
- **Request:** `multipart/form-data` with a file payload.

#### `DELETE /assets/:assetId`
#### `GET /assets/lora-models`
#### `POST /assets/train-lora`
Train a custom LoRA model on character images.
#### `GET /assets/train-status/:jobId`

---

### Collaboration

#### `GET /collaboration/:episodeId/comments`
#### `POST /collaboration/:episodeId/comments`
#### `PATCH /collaboration/:episodeId/comments/:commentId` (resolve)
#### `DELETE /collaboration/:episodeId/comments/:commentId`
#### `GET /collaboration/:episodeId/version-history`
#### `POST /collaboration/:episodeId/approve-version`
#### `GET /collaboration/:episodeId/active-editors`

---

## 4. Data Models

### Project Schema
```json
{
  "id": "proj_123",
  "name": "Billionaire's Secret",
  "genre": "Romance Drama",
  "created_at": "2026-08-01T10:00:00Z",
  "status": "active"
}
```

#### `POST /ai/ab-variants/generate`
Generate 3 distinct hook stings and climax variations (Mystery, Action, Romance) for Episode 1 (Proposal 8).
- **Request Body:** `{ "seriesId": "ser_01", "episodeId": "ep_01" }`
- **Response (200 OK):** `{ "variants": [{ "variantKey": "A_Mystery", "hookText": "Who sent the file?" }, { "variantKey": "B_Action", "hookText": "Run before they find you!" }, { "variantKey": "C_Romance", "hookText": "Was it all a lie?" }] }`

#### `GET /ai/ab-variants/:seriesId/performance`
Retrieve social retention analytics for A/B variants and auto-select winning narrative arc (Proposal 8).

#### `GET /admin/cost-guardrails` & `PUT /admin/cost-guardrails`
Manage Vertex AI compute budget ceilings per episode/series (Proposal 7).
- **Request Body:** `{ "seriesId": "ser_01", "maxBudgetUsdPerEpisode": 3.50, "proxyWorkflowEnabled": true }`

#### `POST /export/parity-check`
Dispatch Dual-Rendering Parity Audit job comparing Client WebGL output vs Server Headless Node.js output (Proposal 6).
- **Request Body:** `{ "episodeId": "ep_01" }`
- **Response (200 OK):** `{ "parityPass": true, "ssimScore": 0.9998, "audioCorrelation": 0.9999 }`

#### `POST /series/:id/branches`
Create interactive branching story choices at episode climax points (Proposal 9).
- **Request Body:** `{ "parentEpisodeId": "ep_01", "choices": [{ "label": "Forgive Kael", "targetEpisodeId": "ep_02a" }, { "label": "Expose Kael", "targetEpisodeId": "ep_02b" }] }`

#### `POST /environments/product-placement`
Composite 3D sponsored product asset onto scene background layer (Proposal 10).
- **Request Body:** `{ "episodeId": "ep_01", "sceneId": "sc_03", "productAssetUrl": "s3://assets/drink_can.png", "boundingBox": [100, 400, 250, 600] }`

#### `POST /collaboration/sync-offline-patches`
Reconcile and apply bulk OpenVideo command patches queued during offline editing (Proposal 12).
- **Request Body:** `{ "episodeId": "ep_01", "offlinePatches": [ ... ] }`
#### `POST /jobs/start-pipeline`
Starts or attaches to a background multi-agent production pipeline job for an episode.
- **Request Body:**
  ```json
  {
    "series_id": "ser_01",
    "episode_id": "ep_01",
    "type": "full_pipeline",
    "force_regenerate": false
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "code": 200,
    "data": { "job": { "id": "job_123", "status": "running", "progress": 10, "current_step": "Generating Storyboards..." }, "is_new": true },
    "message": "Pipeline background job started"
  }
  ```

#### `POST /jobs/retry-step`
Retries a failed pipeline step in the background.
- **Request Body:** `{ "series_id": "ser_01", "episode_id": "ep_01", "step": "render" }`

#### `POST /jobs/retry-asset`
Smart retry for a single specific asset (character, location, prop, storyboard, video, voice, subtitle, bgm, or master render). Automatically transitions pipeline job state to `running` with real-time WebSocket broadcast. Master render tasks are dispatched non-blockingly to the Cloud Run `VideoRendererPool`.
- **Request Body:**
  ```json
  {
    "series_id": "ser_01",
    "episode_id": "ep_01",
    "asset_type": "render",
    "asset_id": "asset_master_video",
    "scene_index": 1,
    "name": "Episode #1 Final Video"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "code": 200,
    "data": { "job": { "id": "job_123", "status": "running" }, "status": "running", "type": "render" },
    "message": "Render job launched in background. Monitoring progress via worker..."
  }
  ```

#### `POST /publish/multi-platform`
Publish rendered video to multiple social platforms (TikTok, YouTube Shorts, Instagram Reels, Facebook Reels, Douyin) with platform-specific captions, hashtags, and thumbnails.
- **Request Body:**
  ```json
  {
    "episodeId": "ep_01",
    "targets": ["tiktok", "youtube_shorts", "instagram_reels", "facebook_reels", "douyin"],
    "caption": "Will Mara survive the night? Watch Episode 1 now! #microdrama #Shorts #Reels",
    "coverUrl": "s3://covers/cover_01.jpg",
    "schedulePublishAt": "2026-08-10T18:00:00Z"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "publishJobId": "pub_job_99",
    "results": [
      { "platform": "tiktok", "status": "published", "postId": "tt_741920" },
      { "platform": "youtube_shorts", "status": "published", "postId": "yt_v881" },
      { "platform": "instagram_reels", "status": "published", "postId": "ig_9012" },
      { "platform": "facebook_reels", "status": "published", "postId": "fb_3311" },
      { "platform": "douyin", "status": "published", "postId": "dy_8820" }
    ]
  }
  ```

### Episode Schema



```json
{
  "id": "epi_1",
  "seriesId": "string",
  "episodeNumber": 4,
  "title": "Episode 1: The Betrayal",
  "duration": 65,
  "sceneCount": 15,
  "status": "draft",
  "scenes": []
}
```

### Scene Schema
```json
{
  "id": "string",
  "episodeId": "string",
  "index": 0,
  "prompt": "INT. NEON ALLEY - NIGHT...",
  "durationSeconds": 6,
  "startFrameUrl": "string | null",
  "endFrameUrl": "string | null",
  "videoUrl": "string | null",
  "voiceLines": [{"characterId": "string", "text": "string", "emotion": "string", "audioUrl": "string"}],
  "status": "pending | generating | done | error"
}
```

### Caption Cue Schema
```json
{
  "id": "cue_1",
  "start_time": 0.5,
  "end_time": 2.1,
  "text": "How could you?",
  "style_overrides": {}
}
```
### Strategic & Market Innovation Endpoints (Proposals 17–21)
- `POST /ai/convert-novel`: Ingest manuscript (PDF/TXT/EPUB) and auto-generate 50-episode JSON script in 60s.
- `POST /live/polling`: Process live stream comment votes and trigger AntV G6 scene branch switches.
- `GET /marketplace/actors`: Search and license 8-anchor virtual actor Personas with royalty distribution.
- `POST /ai/cultural-adapt`: Perform cultural geo-localization of dialogue, wardrobe, signs, and TTS accents.
- `GET /analytics/paywall-recommendation`: Analyze retention curves to recommend optimal episode paywall coin unlock thresholds.

### Technical & Infrastructure Endpoints (Proposals 22–26)
- `GET /api/render/stream`: SSE / WebSocket stream for real-time batch render queue progress.
- `POST /audio/copyright-verify`: Audio fingerprinting scan auto-swapping unsafe background audio tracks.
- `POST /billing/revenue-splits`: Define and process automated revenue sharing contracts among team members.

### AI Compliance, Vocal Control & Ecosystem Endpoints (Proposals 27–30)
- `POST /export/c2pa-watermark`: Embed C2PA cryptographic provenance metadata & Google SynthID invisible watermarks.
- `POST /voices/steer-emotion`: Apply intra-scene SSML emotion affect steering (whisper, cry, laugh, shout).
- `POST /export/platform-recut`: Auto-generate platform-specific edit cuts (59s YouTube Shorts vs 90s TikTok Series vs 15s IG Reels).
- `GET /marketplace/templates`: Search, buy, or publish drama genre presets, virtual sets, and story trees.

### Google Flow Account Pool & Hybrid Provider Endpoints (Proposal 31)
- `GET /admin/flow-accounts`: List all active `google-flow` accounts in pool, session token status, and credit balances.
- `POST /admin/flow-accounts`: Add new `google-flow` session token (`flowST`) to pool.
- `POST /admin/flow-accounts/sync`: Trigger manual background token refresh & credit sync for Flow accounts.
- `GET /admin/flow-accounts/status`: Check current Flow pool availability, active accounts, and reCAPTCHA solver health.

---




## 5. WebSocket Events

Connect to `wss://api.shine.ai/v1/realtime?token=<jwt>` for real-time bi-directional events.

**Events Received:**
- `generation.progress`: Progress updates for AI video/audio generation.
- `render.progress`: Progress updates for episode exports.
- `collaboration.cursor`: Real-time cursor coordinates from other editors.
- `collaboration.comment_added`: Notification when a peer comments on the timeline.
- **`patch:broadcast` (OpenVideo Collaboration):** Client dispatches array of OpenVideo atomic delta patches (`interface Patch { op, path, value, oldValue }`). Server validates and broadcasts to all active co-editors of the episode for real-time live canvas update.
- **`patch:receive` (OpenVideo Collaboration):** Received delta patches executed locally via `core.applyPatches(patches)` to update state seamlessly without full page refresh.

#### `POST /ai/assistant/command-edit`
Real-Time AI Director Assistant Chatbot Command Loop (OpenVideo AI Integration): Translates user natural language chat prompt into structured OpenVideo `Command[]` sequences across all workspace modules (Timeline, Script, Personas, Captions, Transitions, Render, Publish) and executes 6 intelligent capabilities: Visual/Audio QA, Beat-Synced Captions, Retention Doctoring, Voice Acting Coaching, Cost Budget Optimization, and AntV G6 Story Tree Generation. Supports Multimodal Inputs (Images, Videos, PDF/DOCX Documents, Voice Streams via `connectLive()`) and returns surface-tailored dynamic prompt chips.
- **Request Body:**
  ```json
  {
    "episodeId": "ep_01",
    "userPrompt": "Trim all scenes in VIDEO 1 track by 500ms and set subtitle preset to Dynamic Pop-up",
    "timelineState": { "settings": { ... }, "tracks": [ ... ], "clips": { ... } },
    "inspectionMode": "standard",
    "attachments": {
      "imageUrls": ["s3://assets/actor_portrait.png"],
      "videoUrls": ["s3://assets/camera_sample.mp4"],
      "documentUrls": ["s3://assets/manuscript.pdf"],
      "audioStream": "data:audio/wav;base64,..."
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "episodeId": "ep_01",
    "explanation": "Applied 500ms trim across 15 visual clips, parsed character anchors from actor portrait, and set subtitle preset to Dynamic Pop-up.",
    "commands": [
      { "id": "cmd_01", "type": "clip.update", "payload": { "clipId": "clip_v1", "patch": { "timing.display.to": 4500000 } } },
      { "id": "cmd_02", "type": "clip.update", "payload": { "clipId": "clip_v2", "patch": { "timing.display.to": 9000000 } } }
    ],
    "clarificationOptions": [],
    "promptChips": [
      { "label": "Suggest Suspense Twist", "actionPrompt": "Suggest a suspense twist for Scene 3", "surface": "script" },
      { "label": "Sync Captions to Beat", "actionPrompt": "Sync caption pop-ups to the background music beat", "surface": "timeline" }
    ]
  }
  ```

#### `GET /ai/assistant/memory/search`
Query the 4-tier Vector Memory Bank (Vertex AI Vector Search) for multi-episode script chunks, character bibles, comments, or retention curves.
- **Query Params:** `seriesId`, `queryText`, `topK` (default 5), `memoryType` (`script` | `persona` | `comment` | `analytics`)
- **Response (200 OK):** `{ "results": [{ "chunkId": "ch_01", "score": 0.94, "content": "...", "metadata": { "episodeId": "ep_03", "sceneId": "sc_02" } }] }`

#### `POST /ai/assistant/memory/reindex`
Re-index and vectorize series scripts, character bibles, and analytics drop-off events into Vertex AI Vector Search.
- **Request Body:** `{ "seriesId": "ser_01" }`
- **Response (200 OK):** `{ "indexedChunks": 450, "durationMs": 1200 }`

#### `POST /captions/kinetic-style`
Apply word-level karaoke highlight animations, bass-synced font bounce effects, and sentiment emojis.
- **Request Body:** `{ "episodeId": "ep_01", "preset": "kinetic_pop", "highlightColor": "#FFD700", "enableEmoji": true }`
- **Response (200 OK):** `{ "success": true, "updatedCues": 42 }`

#### `POST /audio/spatial-mix`
Apply 3D spatial panning to audio tracks matched to video camera motion keyframes.
- **Request Body:** `{ "episodeId": "ep_01", "spatialMode": "3d_binaural" }`
- **Response (200 OK):** `{ "success": true, "spatialKeyframes": 18 }`

#### `POST /export/viral-covers`
Scan episode frames for aesthetic face scores and generate 3 viral cover poster variants with hook title overlays.
- **Request Body:** `{ "episodeId": "ep_01", "count": 3 }`
- **Response (200 OK):** `{ "covers": [{ "url": "s3://covers/c1.jpg", "aestheticScore": 0.96, "hookTitle": "HER SECRET EXPOSED" }] }`

#### `POST /ai/copilot/analyze`
Execute real-time co-pilot analysis of active timeline playback state and return video canvas feedback alert bubbles.
- **Request Body:** `{ "episodeId": "ep_01", "timelineState": { ... } }`
- **Response (200 OK):** `{ "feedbackBubbles": [{ "timeUs": 14000000, "type": "pacing", "message": "Scene 3 pacing slow, recommend 400ms trim" }] }`

#### `POST /admin/impersonate`
Issue temporary scoped JWT token allowing Customer Supporters to inspect user workspace sessions in read-only or edit mode.
- **Request Body:** `{ "targetUserId": "usr_99", "reason": "Ticket #401 render issue" }`
- **Response (200 OK):** `{ "impersonationToken": "eyJhb...", "expiresIn": 1800 }`

#### `GET /admin/users`
Retrieve user directory with tier status, AI credit balances, and active role scopes.
- **Query Params:** `page`, `limit`, `tier`, `search`
- **Response (200 OK):** `{ "users": [{ "id": "usr_01", "email": "creator@studio.com", "tier": "studio_team", "aiCreditsRemaining": 8900 }] }`

#### `GET /admin/render-cluster`
Retrieve GCP Cloud Run render container cluster status, Pub/Sub queue depth, and active render jobs.
- **Response (200 OK):** `{ "activeContainers": 8, "queuedJobs": 3, "avgRenderDurationSec": 42 }`

#### `GET /admin/observability`
Retrieve OpenTelemetry latency metrics per subagent (Director, Script, Veo, TTS) and error rates.
- **Response (200 OK):** `{ "subagentLatencyMs": { "director": 120, "script": 850, "veo": 42000, "tts": 1400 } }`





---

## 6. Error Reference

Standard HTTP status codes are returned alongside a structured JSON error body.

- `400 Bad Request`: Invalid parameters.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: Insufficient permissions to access the resource.
- `404 Not Found`: The requested resource does not exist.
- `422 Unprocessable Entity`: Validation errors.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Server failure or external AI provider failure.

**Error Response Example:**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The aspect_ratio must be 9:16 or 16:9.",
    "details": ["aspect_ratio"]
  }
}
```

---

## 7. SDK Usage Example (TypeScript / JavaScript)

Shine provides a Node.js SDK for seamless integration.

```typescript
import { ShineClient } from '@shine/node-sdk';

const client = new ShineClient({
  apiKey: process.env.SHINE_API_KEY
});

async function runDramaGeneration() {
  try {
    // 1. Create a Project
    const project = await client.projects.create({
      name: "Hidden Heiress",
      genre: "Drama"
    });

    // 2. Generate a Script
    const script = await client.ai.generateScript({
      project_id: project.id,
      prompt: "A misunderstood genius is secretly a billionaire.",
      target_duration: 60
    });

    // 3. Generate a Video Scene using Google Veo
    const videoJob = await client.ai.generateVideo({
      episode_id: script.episode_id,
      prompt: "Cinematic shot of young woman stepping out of luxury car",
      duration: 3,
      style: "photorealistic"
    });
    
    console.log(`Video generation started. Job ID: ${videoJob.job_id}`);
    
    // Wait for the job to complete
    const videoAsset = await client.ai.waitForJob(videoJob.job_id);
    console.log("Video generated successfully:", videoAsset.url);

  } catch (error) {
    console.error("Shine API Error:", error);
  }
}

runDramaGeneration();
```

---

## 8. Microservices & Worker Integration

### 8.1 Service Health Probing
`GET /api/health`

Returns health status of the Shine API server and connected database provider.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "Shine API Server",
  "version": "0.1.0-alpha",
  "db_provider": "firestore",
  "timestamp": "2026-08-25T00:00:00.000Z"
}
```

---

### 8.2 Asynchronous Video Render Queue
`POST /api/export` or `POST /api/jobs/retry-asset`

Submits an OpenVideo timeline project payload to the headless Playwright WebCodecs compositor worker on Google Cloud Run via Pub/Sub event queue.

**Request Payload:**
```json
{
  "projectData": {
    "settings": { "width": 1080, "height": 1920, "fps": 30, "duration": 15000000 },
    "tracks": [...],
    "clips": { ... }
  },
  "options": {
    "resolution": "1080p",
    "fps": 30,
    "quality": "high"
  }
}
```

**Response (202 Accepted):**
```json
{
  "code": 200,
  "data": {
    "jobId": "render_job_x89a1bc2",
    "status": "queued",
    "estimatedTimeSeconds": 45
  },
  "message": "Render task queued successfully",
  "error": null
}
```

`GET /api/jobs/:jobId`

Queries real-time rendering progress (0–100%) and retrieves the final downloadable video URL.

**Response (200 OK):**
```json
{
  "code": 200,
  "data": {
    "jobId": "render_job_x89a1bc2",
    "status": "completed",
    "progress": 100,
    "downloadUrl": "https://storage.googleapis.com/shine-studio-media/exports/ep1_1080p.mp4",
    "renderTimeMs": 14250
  },
  "message": "Render completed",
  "error": null
}
```

---

### 8.3 Audio Stem Separation (Meta Demucs v4 AI)
`POST /api/audio/separate`

Isolates vocal dialogue from background music and sound effects using Meta Demucs v4.

**Request Payload:**
```json
{
  "audioUrl": "https://storage.googleapis.com/shine-studio-media/audio/raw_scene_1.mp3",
  "twoStems": "vocals",
  "model": "htdemucs"
}
```

**Response (200 OK):**
```json
{
  "code": 200,
  "data": {
    "status": "success",
    "stems": {
      "vocals": "https://storage.googleapis.com/shine-studio-media/audio/separated/scene_1_vocals.wav",
      "no_vocals": "https://storage.googleapis.com/shine-studio-media/audio/separated/scene_1_bgm.wav"
    }
  },
  "message": "Stem separation completed",
  "error": null
}
```

---

### 8.4 Admin Flow Token Pool Sync & Scheduler Heartbeat
`POST /api/admin/flow-accounts/sync`

Invoked periodically by Google Cloud Scheduler (`shine-flow-token-sync`, `*/5 * * * *`) to wake the serverless app, refresh expiring Google Flow OAuth tokens, and synchronize quotas in Firestore Native `shine-db`.

**Response (200 OK):**
```json
{
  "code": 200,
  "data": {
    "syncedAccounts": 5,
    "activeAccounts": 5,
    "refreshedTokens": 2,
    "totalCredits": 1450
  },
  "message": "Flow token pool synced successfully",
  "error": null
}
```

---

### 8.5 Admin Render Cluster & Worker Nodes Telemetry
`GET /api/admin/render-cluster`
`GET /api/admin/workers`
`POST /api/admin/workers/heartbeat`
`POST /api/admin/workers/job-event`
`GET /api/admin/render-jobs`

Provides live cluster telemetry, worker health monitoring, and render job queue tracking across all Cloud Run worker instances.

**Render Cluster Response (`GET /api/admin/render-cluster`):**
```json
{
  "code": 200,
  "data": {
    "activeInstances": 2,
    "gpuLoadPct": 28,
    "activeJobsCount": 1,
    "queuedJobsCount": 0,
    "completedJobsCount": 14,
    "failedJobsCount": 0,
    "monthlyCostUsd": 0.00,
    "monthlyBudgetCap": 50.00,
    "serviceName": "shine-render-worker",
    "region": "us-central1",
    "status": "ONLINE",
    "workers": [
      {
        "workerId": "worker-playwright-01",
        "workerName": "Playwright WebCodecs Node",
        "serviceName": "shine-render-worker",
        "region": "us-central1",
        "status": "ONLINE",
        "cpuUsagePct": 22,
        "memoryUsageMb": 384,
        "activeJobsCount": 0,
        "lastHeartbeat": "2026-08-25T04:30:00.000Z"
      }
    ]
  },
  "message": "Render cluster telemetry retrieved successfully",
  "error": null
}
```

---

### 8.6 Admin Grafana MCP Observability & Log Streaming
`GET /api/admin/observability`
`GET /api/admin/observability/logs`
`POST /api/admin/observability/sync`
`POST /api/admin/observability/test`

Provides two-way observability integration with Grafana MCP / Grafana Cloud:
- Exposes live CPU, RAM RSS, API P99 latency, and historical 24h timeseries metrics.
- Streams error traces, warn logs, and AI subagent execution timings.
- Supports manual sync and connection testing to Grafana MCP endpoints (`tools/call` with `ingest_logs_and_traces`) or Grafana Cloud Loki (`/loki/api/v1/push`).

**Observability Response (`GET /api/admin/observability`):**
```json
{
  "code": 200,
  "data": {
    "uptime_seconds": 38420,
    "process_memory_rss_mb": 294,
    "process_memory_heap_used_mb": 118,
    "process_memory_heap_total_mb": 180,
    "http_request_duration_p99_ms": 112,
    "websocket_connected_clients": 12,
    "ai_inference_latency_seconds": 1.45,
    "api_error_rate_percentage": 0.00,
    "cpu_count": 4,
    "load_average_1m": 0.18,
    "timestamp": "2026-08-25T04:35:00.000Z",
    "grafanaConnection": {
      "connected": true,
      "url": "https://bronzeholly2284.grafana.net",
      "mcpEndpoint": "https://mcp.grafana.com/mcp",
      "mode": "MCP",
      "latencyMs": 14,
      "lastSyncAt": "2026-08-25T04:34:45.000Z",
      "totalSyncedLogs": 142
    },
    "historyMetrics": [
      {
        "timestamp": "2026-08-25T03:30:00.000Z",
        "p99LatencyMs": 108,
        "errorRatePct": 0.00,
        "memoryRssMb": 288,
        "activeWebsockets": 12,
        "aiInferenceLatency": 1.42
      }
    ]
  },
  "message": "Observability telemetry retrieved",
  "error": null
}
```

---

## 9. Bulk Social Publishing API (`/api/publish`)

### 9.1 Fetch Rendered Video Versions
`GET /api/publish/rendered-versions/:seriesId`

Retrieves all rendered master video versions for a given series, including multi-language dubbed variants, resolutions, durations, and burned-in caption tracks.

**Response:**
```json
{
  "code": 200,
  "data": [
    {
      "id": "ver_ep1_en-US",
      "episode_id": "ep_01",
      "episode_number": 1,
      "episode_title": "Thrown Out into the Rain",
      "language": "en-US",
      "voice": "Original Audio (English)",
      "subtitles": ["Caption: English (Burned-in)"],
      "resolution": "1080x1920 (9:16 Vertical HD)",
      "video_url": "https://storage.googleapis.com/shine-studio-media/videos/ep1_en.mp4",
      "thumbnail_url": "https://storage.googleapis.com/shine-studio-media/covers/ep1.jpg",
      "duration": 60,
      "file_size": "83.7 MB",
      "status": "ready"
    }
  ],
  "message": "Rendered versions retrieved",
  "error": null
}
```

### 9.2 AI Social Optimizer & Poster Cover Generation
`POST /api/publish/generate-metadata`
`POST /api/publish/generate-cover`

Generates high-CTR viral titles with emojis, algorithm-targeted hashtags, description hooks, and custom AI poster art based on selected keyframes.

**Request Body (`POST /api/publish/generate-metadata`):**
```json
{
  "seriesId": "series_123",
  "episodeNumber": 1,
  "episodeTitle": "Thrown Out into the Rain",
  "synopsis": "Clara is thrown out in the rain by her arrogant ex-husband..."
}
```

**Response:**
```json
{
  "code": 200,
  "data": {
    "title": "He kicked her out in the rain, but didn't know who she works for now 😱👠",
    "description": "Betrayed by her husband, Clara takes a live-in job at Vance Manor...",
    "tags": ["#DivorcedBroke", "#BuiltHisEmpireInSecret", "#RevengeDrama", "#TikTokDrama", "#VerticalCinema"]
  },
  "message": "AI metadata generated successfully",
  "error": null
}
```

### 9.3 1-Click Multi-Platform Deployment
`POST /api/publish/multi-platform`

Dispatches videos to connected social media channels (**YouTube Shorts**, **TikTok for Creators**, **Meta Reels**) with immediate or scheduled release.

**Request Body:**
```json
{
  "seriesId": "series_123",
  "versionIds": ["ver_ep1_en-US"],
  "platforms": ["youtube", "tiktok"],
  "metadata": {
    "title": "He kicked her out in the rain...",
    "description": "Full series available now!",
    "tags": ["#RevengeDrama"]
  },
  "scheduleMode": "now"
}
```

**Response:**
```json
{
  "code": 200,
  "data": {
    "jobId": "pub_job_1788964786",
    "status": "published",
    "publishedUrls": {
      "youtube": "https://youtube.com/shorts/live_stream_id_xyz"
    }
  },
  "message": "Multi-Platform Deployment Successful!",
  "error": null
}
```

---

## 10. Antigravity OAuth Account Pool API (`/api/antigravity-accounts`)

### 10.1 List Account Pool & Health Status
`GET /api/antigravity-accounts`

Returns all pooled Google OAuth accounts, active quota usage, project IDs, and sync timestamps.

**Response:**
```json
{
  "code": 200,
  "data": [
    {
      "id": "acc_01",
      "email": "tancamap6@gmail.com",
      "projectId": "aicode-consumers",
      "tier": "PAID",
      "modelQuotas": "26 Models (100%)",
      "requests": 220,
      "status": "ACTIVE",
      "lastSync": "2026-09-09T20:00:00.000Z"
    }
  ],
  "message": "Antigravity accounts retrieved",
  "error": null
}
```

### 10.2 OAuth Connect & Token Rotation
`GET /api/antigravity-accounts/oauth/url`
`POST /api/antigravity-accounts/:id/refresh`
`POST /api/antigravity-accounts/sync-all`

Provides automated OAuth URL generation, manual token refresh triggers, and complete pool health re-synchronization.


