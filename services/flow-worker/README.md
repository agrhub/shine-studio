# Shine Flow AI Worker

A dedicated, scalable microservice that bridges **Shine Studio** with **Google Flow (Veo & Gemini)** using a hybrid architecture:
1. **Chrome Extension WebSocket Gateway**: Dispatches jobs directly into real, logged-in browser tabs on `flow.google.com` (0 risk of bot blocks, reCAPTCHA, or broken auth cookies).
2. **Headless Playwright Runner**: Fallback runner executing tasks with synced session cookies directly on Google Cloud Run.
3. **OpenAPI & Gemini API Standards**: Implements standard `/v1/chat/completions` (OpenAI format) and `/models/{model}:generateContent` (Google Gemini format) with full support for reference images, interpolation, and aspect ratios.

---

## 🚀 Quick Start (Local Development)

### 1. Start Flow Worker
```bash
# In openvideo/apps/shine
pnpm run flow-worker
```
The worker will run on `http://localhost:8088`. Open `http://localhost:8088` in your browser to access the **Live Dashboard & Fleet Manager**.

### 2. Install Chrome Extension
1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** and select:
   ```
   openvideo/apps/shine/services/flow-worker/extension
   ```
   *(Or click "Download Extension (.zip)" on `http://localhost:8088`)*.
4. Open `https://flow.google.com` in a browser tab and log in with your Google account.
5. Click the **Shine Flow Worker** extension icon. It will connect to `ws://localhost:8088/ws` and display **Connected (Online)**.

---

## 🧩 Extension Configuration
- **Server WebSocket URL**:
  - Local: `ws://localhost:8088/ws`
  - Cloud Run: `wss://<shine-flow-worker-domain>/ws`
- **Sync Cookies**: Click **Sync Cookies** in the extension popup to push your current session cookies to the server for headless execution.
- **Multi-Account**: Create multiple Chrome profiles, each with its own Google account and Flow tab. The worker automatically detects each account and load-balances generation requests across the fleet.

---

## ☁️ Deploy to Google Cloud Run

### Option A: Automatic Deployment with Shine Ecosystem
When running the Shine Studio master deployment script, `shine-flow-worker` is automatically built, deployed, and linked into `shine-app`:
```bash
# Linux / macOS / Cloud Shell:
./scripts/deploy-cloudrun.sh

# Windows PowerShell:
.\scripts\deploy-cloudrun.ps1
```
The script automatically provisions `FLOW_WORKER_URL` into the main application's environment variables.

### Option B: Standalone Worker Deployment
```bash
# Linux / macOS:
cd services/flow-worker && ./deploy.sh

# Windows PowerShell:
cd services/flow-worker; .\deploy.ps1
```

---

## 📡 API Endpoints

### 1. Google Gemini Compatible
- `POST /v1beta/models/:model:generateContent`
- `POST /models/:model:generateContent`

Payload supports `contents[].parts` with text and image references (`inlineData` or `fileData`).

### 2. OpenAI Compatible
- `GET /v1/models`
- `POST /v1/chat/completions` (supports multimodal text + `image_url` array)
- `POST /v1/images/generations`

### 3. Dedicated Video Generation
- `POST /v1/video/generations`
  - `prompt` (string)
  - `aspectRatio` ('9:16' | '16:9' | '1:1')
  - `referenceImages` (string[])
  - `imageStart` (string)
  - `imageEnd` (string)
  - `model` (e.g. `veo_3_1_t2v_fast_portrait`)
