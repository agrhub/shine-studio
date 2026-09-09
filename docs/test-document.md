# Shine - AI Micro-Drama Video Studio
## Test Plan & Detailed Test Cases Document

**Version:** 1.0
**Date:** August 2026

---

## 1. Test Plan Overview

### 1.1 Objectives
The objective of this test plan is to define the testing strategy, scope, environment, and methodologies required to ensure the quality, reliability, and performance of Shine. The platform is an enterprise-grade AI-powered system for creating vertical short dramas.

### 1.2 Scope
**In Scope:**
- Functional testing of all 15 core modules (Dashboard, Script Assembly, Timeline, Captions, Export, Voice, Character Consistency, Analytics, Audio Mixing, Viral Hook, Virtual Set, Collaboration, Asset Library, Transitions, Onboarding).
- Cross-browser (Chrome, Firefox, Safari, Edge) and responsive UI testing.
- End-to-End (E2E) workflow verification.
- Performance testing (Load, Stress).
- API testing.
- Accessibility testing (WCAG 2.1 AA).

**Out of Scope:**
- Third-party social media platform uptime (TikTok, YouTube, IG).
- Underlying foundational model training (Vertex AI, Veo).
- Hardware-level failure scenarios beyond standard network timeouts.

### 1.3 Test Strategy
A hybrid testing approach will be utilized, combining automated testing (Unit, Integration, E2E) with exploratory manual testing for subjective AI generation outputs (e.g., character consistency, lip-sync quality).

### 1.4 Test Levels
- **Unit Testing:** Individual components and isolated functions (Vitest).
- **Integration Testing:** API endpoints, database interactions, external AI service connections.
- **E2E Testing:** Complete user journeys from login to video export (Playwright).
- **Performance Testing:** Load capacity, rendering speed, AI generation latency (k6).
- **Accessibility Testing:** Screen reader compatibility, contrast, keyboard navigation (axe-core).

### 1.5 Test Environment
- **Frontend:** Vue 3 (Composition API) + TypeScript + Vite 7. Browsers: Chrome 114+, Firefox 113+, Safari 16+, Edge 114+.
- **Backend:** Node.js (v20+), Express, Socket.io.
- **Database:** Google Cloud Firestore Native (`shine-db`), MongoDB, SQLite, MapDB.
- **Microservices:** Google Cloud Run (`us-central1`) for `demucs-worker` and `shine-render-worker`.
- **Cloud Infrastructure:** Google Cloud Storage (`gs://shine-studio-media`), Backblaze B2, Google Cloud Pub/Sub, Cloud Scheduler.
- **AI Services:** Google Vertex AI, Gemini 3.5 & 3.1 Flash, Veo 3.1, Imagen 3, Google Neural Cloud TTS.
- **OS:** Windows 11, macOS, Linux / Ubuntu.

### 1.6 Entry/Exit Criteria
**Entry Criteria:**
- Code is merged to the staging branch and deployed to the staging environment.
- Unit tests pass with >= 80% coverage.
- CI/CD pipeline (e.g., pnpm lint) passes with no errors.

**Exit Criteria:**
- 100% of P0 (Critical) and P1 (High) test cases executed and passed.
- No P0 or P1 open defects.
- E2E workflows execute successfully.
- Performance metrics met (Page load < 2s, API < 500ms).

### 1.7 Risk Analysis
| Risk | Impact | Likelihood | Mitigation |
| :--- | :--- | :--- | :--- |
| AI Generation Latency (Timeout) | High | Medium | Implement async processing, progress bars, and retry mechanisms. |
| Third-party API rate limits | High | Low | Implement caching, fallback stubs for testing, monitor quotas. |
| Cross-browser rendering issues (Timeline) | Medium | High | Automated Playwright tests across multiple browsers. |

---

## 2. Test Cases

### 2.1 Project Hub/Dashboard (8 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| DB-001 | Create new project | Functional | P0 | Logged in | 1. Click 'New Series'. 2. Enter details. 3. Save. | Project is created and visible on Dashboard. | | TBD |
| DB-002 | View project KPIs | UI | P2 | Project exists | 1. Navigate to Dashboard. 2. View KPI cards. | KPIs (views, renders) display correctly. | | TBD |
| DB-003 | Delete project | Functional | P1 | Project exists | 1. Click 'Delete' on project. 2. Confirm. | Project is removed from DB and UI. | | TBD |
| DB-004 | Search projects | Functional | P2 | Multiple projects | 1. Enter text in search bar. | List filters to match query. | | TBD |
| DB-005 | Filter by status | Functional | P2 | Multiple projects | 1. Select 'Draft' filter. | Only draft projects are shown. | | TBD |
| DB-006 | Duplicate project | Functional | P1 | Project exists | 1. Click 'Duplicate'. | Exact copy is created with new ID. | | TBD |
| DB-007 | Responsive Dashboard | UI | P2 | Logged in | 1. Resize window to mobile/tablet. | Grid adjusts, no overlapping. | | TBD |
| DB-008 | Empty state dashboard | Functional | P2 | New user | 1. Login. 2. View Dashboard. | Clear empty state graphic and CTA shown. | | TBD |

### 2.2 Script & Scene Assembly (10 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SA-001 | AI script generation | Functional | P0 | Project open | 1. Enter prompt. 2. Click 'Generate Script'. | Script text is populated. | | TBD |
| SA-002 | Edit AI script | Functional | P1 | Script exists | 1. Modify text inline. 2. Save. | Changes persisted to DB. | | TBD |
| SA-003 | Scene storyboard gen | Functional | P0 | Script exists | 1. Click 'Generate Storyboard'. | Visual scenes generated per script block. | | TBD |
| SA-004 | Reorder scenes | Functional | P1 | Multiple scenes | 1. Drag and drop scene 2 before 1. | Scenes reordered, script updates. | | TBD |
| SA-005 | Tone management | Functional | P2 | Script active | 1. Select 'Suspense' tone. 2. Re-gen. | Script reflects suspenseful tone. | | TBD |
| SA-006 | Character assignment | Functional | P1 | Scene exists | 1. Assign 'Protagonist' to scene. | Character metadata linked to scene. | | TBD |
| SA-007 | Delete scene | Functional | P2 | Multiple scenes | 1. Click 'Delete' on scene. | Scene removed. | | TBD |
| SA-008 | Add blank scene | Functional | P2 | Project open | 1. Click 'Add Scene'. | Blank scene block appears. | | TBD |
| SA-009 | Script character limit | Negative | P3 | Project open | 1. Paste 100k words. | Proper error/warning shown. | | TBD |
| SA-010 | Export script to PDF | Functional | P2 | Script exists | 1. Click 'Export PDF'. | Formatted PDF downloaded. | | TBD |

### 2.3 Video Editor/Timeline (12 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TL-001 | Upload real video clip | Functional | P0 | Editor open | 1. Upload MP4. 2. Drag to timeline. | Clip placed on timeline, preview updates. | | TBD |
| TL-002 | Multi-track support | Functional | P1 | Editor open | 1. Add video to Track 1. 2. Add video to Track 2. | Both tracks visible, correct z-index in preview. | | TBD |
| TL-003 | Split clip | Functional | P1 | Clip on timeline | 1. Move playhead. 2. Click 'Split'. | Clip divided into two separate clips. | | TBD |
| TL-004 | Delete clip | Functional | P1 | Clip on timeline | 1. Select clip. 2. Press Delete. | Clip removed from timeline. | | TBD |
| TL-005 | Timeline zoom | UI | P2 | Clip on timeline | 1. Use zoom slider. | Timeline scales correctly, clips adjust. | | TBD |
| TL-006 | Real-time preview | Functional | P0 | Clip on timeline | 1. Press Spacebar. | Video plays smoothly in preview. | | TBD |
| TL-007 | Adjust clip length | Functional | P1 | Clip on timeline | 1. Drag clip edge. | Duration updates, preview updates. | | TBD |
| TL-008 | Clear empty state | Negative | P2 | Empty timeline | 1. Play video. 2. Export. | No crash. Export blocked with clear message. | | TBD |
| TL-009 | Add AI generated clip | Functional | P0 | Editor open | 1. Import Veo output. | AI clip functions like normal video. | | TBD |
| TL-010 | Timeline scrubbing | Functional | P2 | Clip on timeline | 1. Drag playhead rapidly. | Preview frame updates without crashing. | | TBD |
| TL-011 | Undo/Redo | Functional | P1 | Clip edited | 1. Split clip. 2. Ctrl+Z. 3. Ctrl+Y. | Split is undone, then redone. | | TBD |
| TL-012 | Change project ratio | Functional | P2 | Editor open | 1. Change to 9:16. | Preview canvas updates to vertical. | | TBD |

#### Episode Editor — Scene Clip Model
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-EP-001 | Episode Editor | Scene clips on VIDEO 1 track | 1. Generate scenes for episode 2. Open Episode Editor | VIDEO 1 track shows individual 4–8s scene clips end-to-end | P0 |
| TC-EP-002 | Episode Editor | Total episode duration | 1. Assemble 20 scenes × 6s each | Timeline total duration = 120s (2 min) | P1 |
| TC-EP-003 | Episode Editor | Re-synthesize single scene | 1. Click on a scene clip 2. Change AI prompt 3. Click Synthesize Scene | Only selected scene regenerates, others unchanged | P0 |
| TC-EP-004 | Episode Editor | Add All to Timeline | 1. Complete scene storyboard 2. Click 'Add All to Timeline' | All storyboard scenes added as clips in correct order | P0 |
| TC-EP-005 | Episode Editor | Production Balance donut | 1. Mix AI and raw clips in timeline | Production Balance donut reflects correct AI/Raw/SFX ratio | P2 |
### 2.4 Auto-Captions & Styling (8 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AC-001 | AI transcription | Functional | P0 | Audio on timeline | 1. Click 'Auto Caption'. | Speech converted to text blocks on timeline. | | TBD |
| AC-002 | Edit caption text | Functional | P1 | Captions exist | 1. Double click caption. 2. Type text. | Text updates in timeline and preview. | | TBD |
| AC-003 | Apply style preset | Functional | P1 | Captions exist | 1. Select 'TikTok Bold' style. | Font, color, and animation update. | | TBD |
| AC-004 | Manual caption add | Functional | P2 | Timeline open | 1. Click 'Add Text'. | Blank text clip added. | | TBD |
| AC-005 | Auto-translation | Functional | P2 | Captions exist | 1. Select 'Translate to Spanish'. | Captions converted to Spanish accurately. | | TBD |
| AC-006 | Export SRT | Functional | P2 | Captions exist | 1. Click 'Export SRT'. | Valid SRT file downloaded. | | TBD |
| AC-007 | Delete all captions | Functional | P2 | Captions exist | 1. Select all captions. 2. Delete. | All captions removed. | | TBD |
| AC-008 | Sync adjustment | Functional | P1 | Captions exist | 1. Drag caption clip. | Timing shifts accordingly. | | TBD |

### 2.5 Export & Publishing (10 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| EP-001 | Standard cloud render | Functional | P0 | Valid timeline | 1. Click 'Export'. 2. Select 1080p. | Video renders on backend, returns link. | | TBD |
| EP-002 | Render progress | UI | P2 | Rendering | 1. View progress bar. | Progress updates real-time, completes. | | TBD |
| EP-003 | AI Cover generation | Functional | P1 | Rendered video | 1. Click 'Generate Cover'. | Thumbnail created from keyframe/AI. | | TBD |
| EP-004 | Publish to TikTok | Integration| P1 | Auth linked | 1. Select TikTok. 2. Click Publish. | Video pushed via API, success message. | | TBD |
| EP-005 | Publish to YouTube | Integration| P1 | Auth linked | 1. Select YouTube Shorts. 2. Publish. | Video published as Short. | | TBD |
| EP-006 | Publish to Instagram | Integration| P1 | Auth linked | 1. Select Instagram Reels. 2. Publish. | Video published as Reel. | | TBD |
| EP-007 | Export zero clips | Negative | P1 | Empty timeline | 1. Click 'Export'. | Export blocked, error message shown. | | TBD |
| EP-008 | Concurrent exports | Performance| P2 | Multiple tabs | 1. Start render in 2 tabs. | Both queue and process successfully. | | TBD |
| EP-009 | Cancel render | Functional | P2 | Rendering | 1. Click 'Cancel'. | Render job aborted on backend. | | TBD |
| EP-010 | Download MP4 | Functional | P0 | Render complete | 1. Click 'Download'. | MP4 file downloaded to local machine. | | TBD |
| EP-011 | Bulk Publishing Step 1: Version Selection | Functional | P0 | Series has renders | 1. Open Publish Wizard. 2. Select rendered versions. | Versions highlighted with resolution badge. | | TBD |
| EP-012 | Bulk Publishing Step 2: AI Metadata Gen | Functional | P0 | Versions selected | 1. Click Next. 2. Trigger AI metadata generator. | Gemini returns SEO titles, hashtags, description. | | TBD |
| EP-013 | Bulk Publishing Step 3: Target Channels | Functional | P0 | Metadata confirmed | 1. Select YouTube Shorts, TikTok, Reels. | Channels selected with connected account status. | | TBD |
| EP-014 | Post Scheduling & Queue Dispatch | Functional | P1 | Wizard Step 3 | 1. Choose 'Schedule for later'. 2. Set time. | Job queued in Task Manager with schedule timestamp. | | TBD |
| EP-015 | Live YouTube Shorts Verification | E2E | P0 | Publish dispatched | 1. Trigger YouTube Shorts deployment. 2. Open link. | Live YouTube Shorts playback URL verified on YouTube. | | TBD |
| EP-016 | Task Manager Real-Time SSE Logs | UI / API | P1 | Task running | 1. Open Task Manager sidebar. 2. View logs. | Streaming SSE log entries update without page refresh. | | TBD |

### 2.6 Voice & Dubbing (8 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VD-001 | Neural TTS gen | Functional | P0 | Text exists | 1. Select voice. 2. Generate. | Audio clip added to timeline. | | TBD |
| VD-002 | Change TTS emotion | Functional | P1 | Text exists | 1. Select 'Angry'. 2. Generate. | Audio reflects angry tone. | | TBD |
| VD-003 | Lip-sync generation | Functional | P0 | Video & Audio | 1. Select both. 2. Click 'Lip Sync'. | Video mouth movements sync to audio. | | TBD |
| VD-004 | Voice cloning upload | Integration| P2 | Auth linked | 1. Upload 30s sample. | Custom voice profile created. | | TBD |
| VD-005 | Voice clone gen | Functional | P1 | Clone exists | 1. Select clone voice. 2. Gen TTS. | Output sounds like clone. | | TBD |
| VD-006 | Adjust TTS speed | Functional | P2 | TTS generating | 1. Set speed 1.5x. | Audio is faster, pitch preserved. | | TBD |
| VD-007 | Unsupported language | Negative | P3 | TTS menu | 1. Enter text. 2. Select unsupported lang. | Error message shown. | | TBD |
| VD-008 | Regenerate TTS | Functional | P2 | TTS clip | 1. Click 'Regenerate'. | New variation created. | | TBD |

#### Multi-Speaker TTS Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-TTS-001 | Voice & Dubbing | Multi-speaker TTS for scene | 1. Set speakers=[{Mara:Kore},{Kael:Fenrir}] 2. Generate audio for dialogue | Audio has two distinct voices alternating per character line | P0 |
| TC-TTS-002 | Voice & Dubbing | 30 voices available | 1. Open Voice & Dubbing panel 2. Check voice dropdown | All 30 Gemini voices listed (Zephyr, Puck, Charon, Kore, Fenrir, Aoede, etc.) | P1 |
| TC-TTS-003 | Voice & Dubbing | PCM to WAV conversion | 1. Generate audio 2. Download output file | Output file is valid WAV with RIFF header, 24kHz, 16-bit | P1 |
| TC-TTS-004 | Voice & Dubbing | Voice profile persisted across episodes | 1. Assign Kore voice to Mara in EP 01 2. Open EP 02 | Mara's voice is still Kore in EP 02 | P0 |
### 2.7 Character Consistency (7 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CC-001 | Create character profile| Functional | P0 | Asset library | 1. Upload 5 photos. 2. Train. | LoRA/Anchor created. | | TBD |
| CC-002 | Apply character to scene| Functional | P0 | Profile exists | 1. Generate scene with character tag. | Face matches profile. | | TBD |
| CC-003 | Outfit consistency | Functional | P1 | Profile exists | 1. Specify "red suit" in 3 scenes. | Character wears red suit in all. | | TBD |
| CC-004 | View multiple angles | Functional | P2 | Scene gen | 1. Prompt "profile view". | Character face accurate from side. | | TBD |
| CC-005 | Delete character | Functional | P2 | Profile exists | 1. Delete profile. | Removed, subsequent gens fail to use it. | | TBD |
| CC-006 | Character aging | Functional | P2 | Scene gen | 1. Prompt "elderly version". | Face retains identity but aged. | | TBD |
| CC-007 | Multi-character scene | Functional | P1 | 2 Profiles | 1. Prompt both characters. | Both render accurately, no merging. | | TBD |

### 2.8 Analytics (6 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AN-001 | View views metric | Functional | P1 | Video published | 1. Navigate to Analytics. | Total views displayed accurately. | | TBD |
| AN-002 | Date range filter | UI | P2 | Analytics open | 1. Select 'Last 7 Days'. | Charts update to reflect range. | | TBD |
| AN-003 | Export report CSV | Functional | P2 | Analytics open | 1. Click 'Export'. | CSV file downloads with correct data. | | TBD |
| AN-004 | Platform breakdown | Functional | P1 | Analytics open | 1. View pie chart. | Shows TikTok vs YouTube metrics. | | TBD |
| AN-005 | Retention graph | UI | P2 | Analytics open | 1. View retention curve. | Graph displays drop-off rates. | | TBD |
| AN-006 | Zero data state | UI | P3 | New account | 1. View Analytics. | "No data yet" placeholder shown. | | TBD |

### 2.9 Audio Mixing (7 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AM-001 | Adjust track volume | Functional | P1 | Audio track | 1. Use volume slider. | Playback volume changes. | | TBD |
| AM-002 | Auto-ducking | Functional | P0 | Voice & BGM | 1. Enable Auto-duck. | BGM lowers when voice speaks. | | TBD |
| AM-003 | Fade in/out | Functional | P2 | Audio clip | 1. Apply fade in 2s. | Audio starts quiet, rises to normal. | | TBD |
| AM-004 | Mute track | Functional | P1 | Audio track | 1. Click 'Mute' icon. | Track plays no sound. | | TBD |
| AM-005 | Solo track | Functional | P1 | Multi tracks | 1. Click 'Solo' icon. | Only that track plays. | | TBD |
| AM-006 | EQ Presets | Functional | P2 | Audio track | 1. Apply 'Bass Boost'. | Audio profile changes in playback. | | TBD |
| AM-007 | Audio clipping warning | Negative | P3 | Audio track | 1. Set volume 200%. | Visual indicator shows red (clipping). | | TBD |

### 2.10 Viral Hook Analyzer (5 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VH-001 | Analyze script hook | Functional | P1 | Script exists | 1. Click 'Analyze Hook'. | Score (0-100) and feedback provided. | | TBD |
| VH-002 | Generate headline vars | Functional | P1 | Script exists | 1. Click 'Generate Variations'. | 3-5 alternative hook lines provided. | | TBD |
| VH-003 | Apply new hook | Functional | P2 | Vars generated | 1. Select a variation. | Script updates with new text. | | TBD |
| VH-004 | Retention prediction | UI | P2 | Hook analyzed | 1. View chart. | Estimated retention graph shown. | | TBD |
| VH-005 | Empty script analysis | Negative | P3 | Blank script | 1. Click Analyze. | Prompt to add text first. | | TBD |

### 2.11 Virtual Set Studio (6 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| VS-001 | Text to Environment | Functional | P0 | Set open | 1. Prompt "Cyberpunk city". | 3D/2.5D background generated. | | TBD |
| VS-002 | Camera pan | Functional | P1 | Set generated | 1. Apply pan left. | Rendered video shows camera movement. | | TBD |
| VS-003 | Change lighting | Functional | P2 | Set generated | 1. Select 'Neon lighting'. | Environment relit accordingly. | | TBD |
| VS-004 | Green screen subject | Functional | P1 | Set generated | 1. Add keyed subject. | Subject composites correctly over set. | | TBD |
| VS-005 | Save set preset | Functional | P2 | Set edited | 1. Click 'Save Set'. | Set available in Asset Library. | | TBD |
| VS-006 | Invalid prompt | Negative | P3 | Set open | 1. Enter gibberish. | Error or default fallback generated. | | TBD |

### 2.12 Collaboration Review (7 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| CR-001 | Share project link | Functional | P1 | Project exists | 1. Click 'Share'. | Copyable link generated. | | TBD |
| CR-002 | Time-stamped comment | Functional | P0 | Review link | 1. Pause at 0:05. 2. Add comment. | Comment pinned to 0:05 marker. | | TBD |
| CR-003 | Reply to comment | Functional | P2 | Comment exists | 1. Click 'Reply'. 2. Type. | Threaded reply created. | | TBD |
| CR-004 | Resolve comment | Functional | P1 | Comment exists | 1. Click 'Resolve'. | Comment hidden/marked done. | | TBD |
| CR-005 | Version approval | Functional | P1 | Review link | 1. Click 'Approve Version'. | Status updates in owner's dashboard. | | TBD |
| CR-006 | Real-time cursors | UI | P2 | 2 Users in file | 1. Move mouse. | User 2 sees User 1's cursor. | | TBD |
| CR-007 | Uninvited access | Security | P0 | Private project | 1. Open link incognito. | Access denied, login required. | | TBD |

### 2.13 Asset Library (6 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| AL-001 | Upload custom asset | Functional | P1 | Library open | 1. Upload PNG. | Asset appears in grid. | | TBD |
| AL-002 | Filter by type | Functional | P2 | Library populated| 1. Select 'Audio'. | Only audio files shown. | | TBD |
| AL-003 | Rename asset | Functional | P2 | Asset exists | 1. Right click -> Rename. | New name saved. | | TBD |
| AL-004 | Delete asset | Functional | P1 | Asset exists | 1. Right click -> Delete. | Removed from library. | | TBD |
| AL-005 | LoRA model mgmt | Functional | P0 | Models exist | 1. View 'Models' tab. | Custom trained character models listed. | | TBD |
| AL-006 | Max storage limit | Negative | P2 | Quota full | 1. Upload file. | Blocked with "Storage Full" error. | | TBD |

### 2.14 Transitions/SFX (5 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TX-001 | Apply transition | Functional | P1 | 2 clips on line | 1. Drag 'Wipe' between clips. | Transition plays in preview. | | TBD |
| TX-002 | Adjust transition dur | Functional | P2 | Transition applied| 1. Drag edge to 2s. | Transition slows down. | | TBD |
| TX-003 | Delete transition | Functional | P1 | Transition applied| 1. Select & Delete. | Clips snap back to hard cut. | | TBD |
| TX-004 | Add SFX from library| Functional | P1 | Editor open | 1. Drag 'Whoosh' to audio. | SFX plays at correct time. | | TBD |
| TX-005 | Neural transition gen | Functional | P0 | 2 clips | 1. Apply 'AI Morph'. | Vertex/Veo generates seamless morph. | | TBD |

### 2.15 Non-Functional / E2E / Security (15 Test Cases)
| TC-ID | Title | Type | Priority | Preconditions | Steps | Expected Result | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NF-001 | End-to-End Workflow | E2E | P0 | Logged in | 1. Dashboard -> New -> Script -> Editor -> Captions -> Export. | Entire flow works without breaking. | | TBD |
| NF-002 | Build pipeline pass | CI/CD | P0 | Code commit | 1. Run `pnpm lint`. | Passes, no errors. | | TBD |
| NF-003 | Dark-mode contrast | UI | P1 | App open | 1. Toggle dark mode. | All text readable, WCAG contrast met. | | TBD |
| NF-004 | Page load < 2s | Perf | P1 | Dashboard | 1. Hard refresh. | FCP < 2s, TTI < 3s. | | TBD |
| NF-005 | SQL Injection block | Sec | P0 | Login | 1. Input `' OR 1=1--`. | Rejected, no DB access. | | TBD |
| NF-006 | XSS Protection | Sec | P0 | Script input | 1. Input `<script>alert()</script>`. | Input sanitized, no execution. | | TBD |
| NF-007 | API Rate Limiting | Sec | P1 | API client | 1. Send 1000 req/min. | HTTP 429 Too Many Requests returned. | | TBD |
| NF-008 | JWT Expiration | Sec | P1 | Logged in | 1. Wait 24h (or force expiry). | User forced to re-login. | | TBD |
| NF-009 | Concurrent Editor | E2E | P2 | 2 Tabs open | 1. Edit in Tab A. 2. Check Tab B. | State syncs or locking prevents corruption. | | TBD |
| NF-010 | Network disconnect | Negative | P1 | Editing | 1. Go offline. 2. Make edit. | "Offline" indicator, changes cached locally. | | TBD |
| NF-011 | Network reconnect | E2E | P1 | Offline cache | 1. Go online. | Local changes sync to cloud. | | TBD |
| NF-012 | Large project load | Perf | P2 | 500 clips project| 1. Open project. | Loads < 5s, timeline doesn't lag. | | TBD |
| NF-013 | AI Gen timeout | Negative | P2 | Prompting | 1. Simulate Veo timeout. | Graceful error, retry button shown. | | TBD |
| NF-014 | Mobile layout | UI | P3 | Mobile device | 1. Open app. | Read-only/dashboard optimized for touch. | | TBD |
| NF-015 | Data privacy GDPR | Sec | P0 | Account settings | 1. Click 'Delete Account'. | All user data/assets purged from DB. | | TBD |

### 2.16 Series Management
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-SRS-001 | Series Management | Create new series | 1. Click 'New Series' 2. Enter name, genre=Suspense, tone, visual style 3. Click Create | Series created, appears in Project Hub grid with episode count = 0 | P0 |
| TC-SRS-002 | Series Management | View episodes in series | 1. Click on a series card 2. Open episode list | All episodes listed with number, title, duration, status | P0 |
| TC-SRS-003 | Series Management | Create empty series then add episodes | 1. Create series 2. Click 'Add Episode' 3. Enter episode details | Episode EP 01 created with sceneCount = 0 | P0 |
| TC-SRS-004 | Series Management | Series episode count display | 1. Create series 2. Add 3 episodes | Project Hub card shows correct episode count | P1 |

### 2.17 Multi-Agent Script Pipeline
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-AI-SCR-001 | AI Script Pipeline | Story Skeleton generation | 1. Open series 2. Input synopsis 3. Click 'Generate Outline' | Returns episode breakdown list with titles and summaries for all episodes | P0 |
| TC-AI-SCR-002 | AI Script Pipeline | Per-episode script generation | 1. Select episode 2. Click 'Generate Script' | Script Agent produces structured JSON with key `scriptItem`, containing scenes array with index, heading (INT./EXT.), action, dialogue[], durationSeconds | P0 |
| TC-AI-SCR-003 | AI Script Pipeline | Script Supervision quality check | 1. Generate script 2. Click 'Supervise/Review' | Supervision Agent returns score, issues list, improvement suggestions | P1 |
| TC-AI-SCR-004 | AI Script Pipeline | Character consistency in script | 1. Generate scripts for EP 01 and EP 02 with same character | Same character name, voice tone, and personality maintained across both episode scripts | P0 |
| TC-AI-SCR-005 | AI Script Pipeline | Scene count per episode | 1. Generate script for 2-minute episode | Timeline contains 15–30 scene clips (4–8s each totaling 1–3 min) | P1 |
| TC-AI-SCR-006 | AI Script Pipeline | Abort script generation | 1. Start script generation 2. Click Cancel/Abort | Generation stops, no partial script saved | P2 |

### 2.18 Vertex AI Authentication Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-AUTH-001 | Vertex AI Auth | Valid Service Account JSON | 1. Set GOOGLE_APPLICATION_CREDENTIALS to valid SA file 2. Trigger any AI call | AI call succeeds, response returned | P0 |
| TC-AUTH-002 | Vertex AI Auth | Missing credentials | 1. Remove GOOGLE_APPLICATION_CREDENTIALS 2. Trigger AI call | Error returned: 'No valid Vertex AI credentials found' | P0 |
| TC-AUTH-003 | Vertex AI Auth | Invalid project ID | 1. Set GOOGLE_CLOUD_PROJECT to non-existent project 2. Trigger AI call | Error returned with GCP 403/404 details | P1 |
| TC-AUTH-004 | Vertex AI Auth | Model location routing — gemini-2.5 | 1. Call generateContent with gemini-2.5-flash | Request sent to us-central1 location | P1 |
| TC-AUTH-005 | Vertex AI Auth | Model location routing — veo | 1. Call generateVideo with veo-3.1-* | Request sent to global location | P1 |

### 2.19 Veo Character Reference (R2V) Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-VEO-001 | Video Gen (Veo) | Generate scene with character reference | 1. Set characterImages[] with LoRA anchor 2. Call generateVideo | Video contains character matching reference image | P0 |
| TC-VEO-002 | Video Gen (Veo) | Async generation with jobId | 1. Call generateVideo with async=true | Returns {jobId, status:'pending'} immediately | P0 |
| TC-VEO-003 | Video Gen (Veo) | Poll async job until done | 1. Get jobId 2. Poll GET /video-status/:jobId every 10s | Status transitions pending → done, url returned | P1 |
| TC-VEO-004 | Video Gen (Veo) | Scene duration range | 1. Generate scene with durationSeconds=4 and durationSeconds=8 | Video clip duration matches requested duration | P1 |
| TC-VEO-005 | Video Gen (Veo) | I2V with start frame | 1. Set imageStart to character reference image 2. Generate video | First frame of video matches provided start image | P0 |

### 2.20 Empty State Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-EMPTY-001 | Dashboard | Empty series state | 1. Create new series with no episodes | Dashboard card shows 0 episodes, 'Add Episode' CTA visible | P1 |
| TC-EMPTY-002 | Episode Editor | Empty timeline | 1. Create new episode without generating scenes | VIDEO 1 track is empty, 'Generate Scenes' prompt shown | P1 |
| TC-EMPTY-003 | Analytics | Series with no views | 1. Publish 0 episodes | Analytics shows 0 for all KPIs, no division-by-zero errors | P1 |

### 2.21 Timeline Revision History & Zero-Render Preview Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-HIS-001 | Timeline History | Automatic history log on timeline save | 1. User A modifies clip duration 2. Call PUT /episodes/:id/timeline | History entry created with versionId, author User A, timestamp | P0 |
| TC-HIS-002 | Timeline History | List timeline history | 1. Open episode editor 2. Click 'History' panel | Lists all historical revisions with author, version label, and change summary | P0 |
| TC-HIS-003 | Timeline History | Zero-render browser preview | 1. Open History panel 2. Select version v1.1 3. Click 'Preview' | Browser loads version JSON directly into canvas timeline state; plays video/audio locally without initiating cloud render job | P0 |
| TC-HIS-004 | Timeline History | Restore historical version | 1. Select version v1.1 2. Click 'Restore Version' | Active timeline reverts to v1.1 state; new version entry (v1.3 - Restored to v1.1) appended to history | P0 |
### 2.22 Real-Time Trend & Cultural Compliance Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-TRD-001 | Onboarding Wizard | Real-time viral topic scanning | 1. Open Genre Wizard 2. Select Suspense 3. Click 'Scan Trends' | Returns top trending topics from TikTok/Douyin/X via Parallel MCP with virality scores | P0 |
| TC-TRD-002 | Onboarding Wizard | Competitor script trope suggestion | 1. Select genre=Romance 2. Request trope suggestions | Displays competitor script tropes (e.g. CEO secret identity, fake marriage) | P1 |
| TC-CMP-001 | Compliance Engine | Content safety audit (pass) | 1. Select EP 01 script 2. Run /ai/compliance/check for regions [US, VN] | Returns passed=true, PG-13 safety rating, zero critical violations | P0 |
| TC-CMP-002 | Compliance Engine | Age & IP infringement flag | 1. Upload script containing copyrighted lyrics & graphic violence 2. Run compliance check | Flags copyright risk and age rating restriction (R-rated / 18+) with line highlights | P0 |

### 2.23 Comment Moderation & Viewer Script Feedback Adaptation Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-MOD-001 | Audience Engagement | Auto-reply to positive comment | 1. Receive comment "Love Mara's character!" 2. Trigger AI Auto-Reply | Generates engaging, context-aware reply boosting platform algorithm | P0 |
| TC-MOD-002 | Audience Engagement | Auto-deletion of toxic comment | 1. Receive spam/hate comment 2. Run AI Moderation Agent | Flags comment as toxic and issues DELETE command to social API | P0 |
### 2.24 OpenVideo Dual Rendering Engine Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-RND-001 | Rendering Engine | OpenVideo WebGL Client-Side Studio playback | 1. Open Episode Editor 2. Press Play | `Studio` / Pixi.js WebGL canvas renders 9:16 timeline smooth 30 FPS playback | P0 |
### 2.25 AI Wardrobe Swap, Cliffhanger Engine & Dubbing Re-alignment Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-WRD-001 | Persona Studio | AI Character Wardrobe & Prop Swap | 1. Select character Mara 2. Choose preset `Mara_Trenchcoat_v1` 3. Apply to Scene 4 | Swaps reference vector `characterImages` in Veo call while maintaining 98.4% face mesh match | P0 |
| TC-CLF-001 | Viral Hook Engine | Dynamic Cliffhanger Hook Generation | 1. Select Episode 1 2. Trigger `/ai/cliffhanger/generate` with `glitch` transition | Injects 3s crescendo SFX, GLSL glitch transition, zoom keyframe, and CTA caption (*"EPISODE 2 UNLOCKED IN 3S"*) | P0 |
| TC-DUB-001 | Voice & Dubbing | Multi-Market Dubbing Auto-Timeline Re-alignment | 1. Translate English voiceover to Spanish LatAm (+25% duration) 2. Trigger `/voices/dubbing/re-align` | Swaps Spanish TTS WAV on `AUDIO 1` without re-rendering silent Veo video on `VIDEO 1`; re-calculates scene clip bounds ($\mu s$) and updates OpenVideo `Caption` timing to match Spanish speech | P0 |


### 2.26 OpenVideo Patches, Commands & AI Chatbot Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-PAT-001 | Collaboration | Real-Time Atomic Patch Broadcast | 1. Two users open Episode 1 2. User A moves clip on timeline | Generates OpenVideo atomic delta patch (`op: update`, `path: /clips/...`) and broadcasts over WebSocket; User B sees move instantly | P0 |
| TC-CMD-001 | Command Engine | Command Execution & Inverse Patch Undo | 1. Execute command `clip.add` 2. Call `core.undo()` | Command adds clip atomically; `undo()` applies inverse patch to restore exact previous timeline state | P0 |
| TC-AIC-001 | AI Assistant | Real-Time AI Chatbot Command Loop | 1. Type chat prompt "Trim 1 second off scene 2" 2. Send to AI Assistant | AI Assistant returns `Command[]` array (`clip.update`); client executes via `core.executeMany` and updates Vue 3 canvas | P0 |
| TC-AIC-002 | AI Assistant | End-to-End Chat-Driven Series Creation Pipeline | 1. Enter prompt "Create 20-ep Cyberpunk drama 'Neon Betrayal'" 2. Issue step-by-step chat prompts for script, personas, sets, video gen, voiceover, and captions | Chatbot dispatches sequential API calls (`POST /series`, `POST /ai/generate-script`, `POST /characters`, `POST /environments/generate`, `POST /ai/video-gen`, `POST /voices/generate`, `POST /captions/auto-generate`) and populates full episode timeline | P0 |
| TC-AIC-003 | AI Assistant | Multimodal Visual & Audio QA Inspection | 1. Enter prompt "Check if Mara's face is framed correctly in Scene 3 and fix background audio drowning dialogue" 2. Trigger Chatbot QA | Chatbot calls Gemini Vision frame inspection, identifies framing offset, triggers volume ducking (`autoDuck: true`), and highlights Scene 3 with blue outline glow | P1 |
| TC-AIC-004 | AI Assistant | Multimodal Input Ingestion (Image, Video, Docs, Voice) | 1. Upload actor photo, sample video, script PDF, and trigger microphone voice input 2. Send prompt to Chatbot | Chatbot parses multimodal attachments (extracts facial anchors from photo, camera motion from video, script scenes from PDF, and STT from voice) and executes corresponding workspace commands | P0 |
| TC-AIC-005 | AI Assistant | Long-Term Vector Memory & Cross-Episode RAG Search | 1. Ask Chatbot "What outfit did Mara wear in Episode 3 rooftop scene?" 2. Trigger Chatbot query | Chatbot queries `GET /ai/assistant/memory/search`, retrieves Top-K vector chunks from Vertex AI Vector Search in <50ms, and returns accurate cross-episode answer | P1 |
| TC-KAP-001 | Subtitle Engine | Kinetic Karaoke Highlight & Bass Bounce | 1. Trigger `POST /captions/kinetic-style` with `kinetic_pop` preset | Renders word-level yellow karaoke pop-up highlight and applies bass-synced font scale transforms during playback | P0 |
| TC-SPT-001 | Audio Mixer | 3D Spatial Audio Panning & Voice Coach | 1. Trigger `POST /audio/spatial-mix` 2. Play episode | Pans ambience SFX dynamically across L/R audio channels matching camera motion and applies emotion-tuned TTS reverb | P1 |
| TC-CVR-001 | Export & Cover | AI Viral Cover Aesthetic Scanner & A/B Poster | 1. Trigger `POST /export/viral-covers` | Scans video frames for highest face aesthetic score, generates 3 viral cover poster variants with hook titles | P1 |
| TC-COP-001 | AI Director | Live Video Canvas Copilot Overlay Runtime | 1. Play timeline with 400ms pacing lag | Renders non-blocking floating alert bubble on preview canvas pointing out pacing delays and volume ducking advice | P0 |






### 2.27 Parity Audit, Cost Guardrails & A/B Variant Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-PAR-001 | Quality Assurance | Client WebGL vs Server Headless Render Parity | 1. Render Episode 1 on WebGL Studio 2. Render on Headless Node.js 3. Execute SSIM pixel-diff | SSIM score exceeds 0.999; audio waveform alignment drift < 0.05% | P0 |
| TC-CST-001 | Cost Guardrails | Vertex AI Budget Ceiling Enforcement | 1. Set max budget $3.50 USD 2. Execute 10 heavy Veo requests | System blocks 11th request, emits budget alert, and switches to low-res proxy workflow | P0 |
| TC-ABV-001 | Growth Engine | Episode 1 A/B Variant Retention Winner Selection | 1. Generate 3 ending variants (Mystery, Action, Romance) 2. Publish to TikTok 3. Ingest retention after 24h | Identifies highest retention variant (Action: 78%) and updates `adaptationStrategy` for future episodes | P1 |
| TC-GRD-001 | Code Governance | Git Pre-Commit Guard Stub Rejection | 1. Add `TODO: implement later` stub 2. Run `git commit` | Husky + `eslint-plugin-agent-guard` blocks commit with explicit stub error message | P0 |

### 2.28 Interactive Branching, Product Placement & Offline Hybrid Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-BRN-001 | Interactive Drama | Branching Story Choice Overlay & Graph Execution | 1. Play Episode 1 climax 2. Select Choice B ("Expose Kael") | Micro-app overlays choice buttons; selecting B seamlessly transitions to pre-cached Episode 2B stream | P1 |
| TC-PPL-001 | Monetization | AI In-Video Product Placement Layer Compositing | 1. Supply 3D product PNG 2. Trigger `/environments/product-placement` | Composites sponsored product onto coffee table layer with matching lighting, perspective skew, and affiliate link | P1 |
| TC-OFF-001 | Infrastructure | Offline IndexedDB Command Queueing & Reconnection Sync | 1. Disconnect internet 2. Edit timeline clips 3. Reconnect network | Stores OpenVideo patches in IndexedDB offline; automatically dispatches `/collaboration/sync-offline-patches` on reconnection | P0 |

### 2.29 Bulk Social Publishing & Multi-Platform Channel Distribution Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-PUB-001 | Social Publishing | Fetch rendered versions | 1. Open Publish Wizard with seriesId 2. Query rendered versions | Returns all available MP4 versions with resolution, bitrate, timestamp | P0 |
| TC-PUB-002 | Social Publishing | AI Cover Thumbnail Generation | 1. Select rendered version 2. Click 'Generate AI Cover' | Returns 9:16 high CTR thumbnail with title typography | P1 |
| TC-PUB-003 | Social Publishing | Platform-specific metadata generation | 1. Select target YouTube Shorts & TikTok 2. Click Generate Metadata | Returns platform-tailored titles, hashtags, description blocks via Gemini | P0 |
| TC-PUB-004 | Social Publishing | Multi-platform batch deployment | 1. Select 2 channels 2. Click 'Publish Now' | Dispatches background jobs; returns taskId and monitoring link | P0 |
| TC-PUB-005 | Social Publishing | Real-time SSE render/publish stream | 1. Connect to `/api/publish/render/stream` 2. Monitor events | Receives progress percentage and status events without timeouts | P0 |
| TC-PUB-006 | Social Publishing | Live YouTube Shorts verification | 1. Deploy to YouTube Shorts 2. Follow returned video URL | Video plays live on YouTube Shorts (@TanDo-o9u) with correct audio & title | P0 |

### 2.30 Sets, Narrative Props & Wardrobe Consistency Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-SET-001 | Sets & Props | Set location environment creation | 1. Open Sets tab 2. Add 'Neon Alley' with prompt & lighting | Set persisted and linked to series scenes | P1 |
| TC-SET-002 | Sets & Props | Narrative prop assignment to scene | 1. Create prop 'Encrypted Flash Drive' 2. Assign to Scene 4 | Visual prompt includes prop description for Veo 3.1 generation | P1 |
| TC-SET-003 | Sets & Props | Wardrobe consistency check across episodes | 1. Lock character wardrobe in Cast panel 2. Generate Episode 2 | Character wardrobe tags propagate into image/video prompts | P0 |

### 2.31 Antigravity Google OAuth Account Pool & Observability Tests
| TC ID | Module | Test Name | Steps | Expected Result | Priority |
|-------|--------|-----------|-------|-----------------|----------|
| TC-ACC-001 | Account Pool | List active OAuth pool accounts | 1. Navigate to Settings > AI Models 2. View account table | Lists connected accounts with email, token health, quotas, active status | P0 |
| TC-ACC-002 | Account Pool | Health check & token sync | 1. Trigger 'Sync Accounts' | Refreshes OAuth tokens; updates quota remaining meters | P1 |
| TC-ACC-003 | Account Pool | Rate-limit auto-rotation | 1. Simulate 429 quota exhaustion on Account A | Router automatically switches to Account B with zero request drops | P0 |
| TC-OBS-001 | Observability | Grafana MCP telemetry check | 1. Open Settings > Grafana Observability | Displays latency charts, subagent token meters, and cluster health | P1 |

---

## 3. API Test Cases

| APIT-ID | Endpoint | Method | Request Body / Params | Expected Status | Expected Response | Type |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| API-001 | `/api/series` | POST | `{ "title": "Test Drama", "targetAudience": "global" }` | 201 Created | `{ id: "...", title: "Test Drama" }` | Happy Path |
| API-002 | `/api/series` | GET | `limit=10&page=1` | 200 OK | `[{...}], total: 1` | Happy Path |
| API-003 | `/api/ai/agentic/generate` | POST | `{ "prompt": "Scary story" }` | 200 OK | `{ "script": "..." }` | Happy Path |
| API-004 | `/api/ai/agentic/generate` | POST | `{ "prompt": "" }` | 400 Bad Req | `{"error": "Prompt required"}` | Error |
| API-005 | `/api/export` | POST | `{ "projectId": "123" }` | 202 Accepted | `{ "jobId": "..." }` | Async Job |
| API-006 | `/api/series` | POST | (No Auth Header) | 401 Unauth | `{"error": "Unauthorized"}` | Auth |
| API-007 | `/api/auth/me` | GET | Valid JWT | 200 OK | User profile data | Happy Path |
| API-008 | `/api/episodes/:id/timeline/history` | GET | `limit=10` | 200 OK | `{ total: 3, history: [...] }` | Happy Path |
| API-009 | `/api/episodes/:id/timeline/history/:verId` | GET | Valid versionId | 200 OK | `{ versionId, timelineData: {...} }` | Zero-Render Preview |
| API-010 | `/api/episodes/:id/timeline/restore` | POST | `{ versionId: "ver_1a2b" }` | 200 OK | `{ success: true, newVersionId: "..." }` | Restore |
| API-011 | `/api/ai/assistant/trend-hunt` | GET | `genre=suspense&region=global` | 200 OK | `{ topics: [{ title: "...", viralScore: 96 }] }` | Parallel MCP Trend |
| API-012 | `/api/ai/agentic/compliance/check` | POST | `{ "seriesId": "s1", "targetRegions": ["US"] }` | 200 OK | `{ passed: true, safetyRating: "PG-13" }` | Compliance Audit |
| API-013 | `/api/analytics/comments/ep1` | GET | `limit=20` | 200 OK | `{ total: 1250, comments: [...] }` | Comments Aggregation |
| API-014 | `/api/analytics/comments/c1/reply` | POST | `{ "customInstruction": "Tease cliffhanger" }` | 200 OK | `{ replyText: "...", posted: true }` | AI Auto-Reply |
| API-015 | `/api/ai/agentic/adapt-from-feedback` | POST | `{ "seriesId": "s1", "targetEpisodeNumber": 6 }` | 200 OK | `{ adaptationSummary: "...", revisedScript: {} }` | Script Feedback Loop |
| API-016 | `/api/admin/flow-accounts/status` | GET | Admin JWT | 200 OK | `{ poolSize: 5, activeAccounts: 5, captchaHealth: "ok" }` | Google Flow Pool |
| API-017 | `/api/health` | GET | None | 200 OK | `{ status: "ok", primaryDatabase: "sqlite" }` | DB Provider Check |
| API-018 | `/api/publish/rendered-versions/:seriesId` | GET | None | 200 OK | `{ success: true, versions: [{ id: "...", url: "..." }] }` | Publish Version Query |
| API-019 | `/api/publish/generate-cover` | POST | `{ "seriesId": "s1", "episodeId": "ep1" }` | 200 OK | `{ success: true, coverUrl: "..." }` | AI Cover Gen |
| API-020 | `/api/publish/generate-metadata` | POST | `{ "seriesId": "s1", "targetPlatforms": ["youtube_shorts"] }` | 200 OK | `{ success: true, metadata: {...} }` | Platform SEO Gen |
| API-021 | `/api/publish/schedule` | POST | `{ "seriesId": "s1", "scheduledAt": "2026-09-10T12:00:00Z" }` | 200 OK | `{ success: true, scheduleId: "..." }` | Post Scheduling |
| API-022 | `/api/publish/connected-channels` | GET | None | 200 OK | `{ success: true, channels: [{ platform: "youtube", connected: true }] }` | Channel Query |
| API-023 | `/api/publish/multi-platform` | POST | `{ "seriesId": "s1", "platforms": ["youtube_shorts"], "metadata": {...} }` | 200 OK | `{ success: true, taskId: "...", results: [...] }` | Multi-Platform Publish |
| API-024 | `/api/antigravity-accounts` | GET | None | 200 OK | `{ success: true, accounts: [{ email: "...", status: "active" }] }` | Account Pool Query |
| API-025 | `/api/antigravity-accounts/sync` | POST | None | 200 OK | `{ success: true, message: "Synced" }` | Account Pool Sync |

---

## 4. Performance Test Scenarios

1. **Frontend Load (Lighthouse):**
   - Goal: Performance score > 90.
   - Metrics: First Contentful Paint < 1.5s, Time to Interactive < 3s, Cumulative Layout Shift < 0.1.
2. **API Benchmarks (k6):**
   - Standard Endpoints (`/projects`, `/assets`): p95 latency < 300ms at 500 VUs.
   - Export Trigger (`/export`): p95 latency < 500ms.
3. **AI Generation Stress:**
   - Simulate 50 concurrent requests to Vertex AI / Veo proxy.
   - Goal: Generation queue handles load without dropping requests; max wait time < 45s for standard prompts.
4. **Browser Memory Leak:**
   - Playwright script: Open timeline, add 50 clips, scrub randomly for 10 minutes.
   - Goal: Browser memory stays stable, no crash/OOM.

---

## 5. Accessibility Checklist (WCAG 2.1 AA)

- [ ] **Keyboard Navigation:** All interactive elements (timeline clips, buttons) reachable via Tab.
- [ ] **Focus States:** Clear visual indicator for focused elements.
- [ ] **Contrast Ratio:** Text against background meets 4.5:1 ratio (especially in Dark Mode).
- [ ] **Screen Readers:** ARIA labels on timeline controls (Play, Pause, Split, Export).
- [ ] **Error Identification:** Form errors clearly marked in text, not just color.
- [ ] **Media Alternatives:** Auto-captions satisfy closed captioning requirements for output.

---

## 6. Test Summary Template

**Date:** YYYY-MM-DD
**Tested Version:** v1.0.X
**Environment:** Staging

**Execution Summary:**
- Total Executed: ___
- Passed: ___
- Failed: ___
- Blocked: ___

**Defect Summary:**
- P0 (Critical): ___
- P1 (High): ___
- P2 (Medium): ___
- P3 (Low): ___

**Key Issues/Risks:**
- (List major blockers or performance bottlenecks observed during execution)

**Sign-off:** [ ] Approved / [ ] Not Approved
