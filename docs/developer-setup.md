# Shine Developer Setup & Deployment Guide

This guide provides step-by-step instructions for setting up the local development environment and deploying the complete serverless ecosystem for **Shine — AI Micro-Drama Video Studio**.

---

## 1. Prerequisites

Before you begin, ensure you have the following installed on your system:

* **Node.js**: `>= 20.x` (along with `pnpm` `v9.x` or `v10.x`)
* **Google Cloud SDK (`gcloud` CLI)**: Required for project management and Cloud Run deployment.
* **Google Cloud Platform (GCP) Account & Project**:
  * Default Region: **`us-central1`** (recommended for full Google Vertex AI & Gemini model availability)
  * Project ID: `YOUR_GCP_PROJECT_ID` (set via `gcloud config set project YOUR_GCP_PROJECT_ID`)
* **Git**: Version control system.

---

## 2. Quick Local Setup (Development)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Local `.env`
Copy the template `.env.example`:
```bash
cp .env.example .env
```

Key configuration parameters in `.env`:
```env
# --- 1. Database (Firestore Native 'shine-db' or MongoDB) ---
DB_PROVIDER="firestore" # "firestore" | "mongodb" | "sqlite" | "mapdb"
FIRESTORE_PROJECT_ID="your-gcp-project-id"
FIRESTORE_DATABASE_ID="shine-db"

# --- 2. Cloud Run Microservices (us-central1) ---
DEMUCS_SERVICE_URL="https://demucs-worker-xxxx-uc.a.run.app"
RENDER_WORKER_URL="https://shine-render-worker-xxxx-uc.a.run.app"

# --- 3. Storage Provider (Google Cloud Storage or Backblaze B2 / S3) ---
STORAGE_PROVIDER="gcs" # "gcs" | "b2" | "s3" | "local"
GCS_BUCKET_NAME="shine-studio-media"

# --- 4. Google AI & Vertex AI ---
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="global"
GOOGLE_GENAI_USE_VERTEXAI="1"
GOOGLE_APPLICATION_CREDENTIALS="path/to/gcp-service-account.json" # Optional if using ADC

GEMINI_MODEL_TEXT="gemini-3.5-flash-lite"
GEMINI_MODEL_IMAGE="gemini-3.1-flash-lite-image"
GEMINI_MODEL_VIDEO="veo-3.1-generate-001"
GEMINI_MODEL_TTS="gemini-3.1-flash-tts-preview"
GEMINI_MODEL_VOICE="gemini-live-2.5-flash-native-audio"
GEMINI_MODEL_MUSIC="lyria-3-clip-preview"

# --- 5. Stock Media & Search Engines ---
PARALLEL_API_KEY="your-parallel-search-mcp-key"
PEXELS_API_KEY="your-pexels-api-key"
PIXABAY_API_KEY="your-pixabay-api-key"
FREESOUND_API_KEY="your-freesound-api-key"

# --- 6. Social Publishing OAuth ---
YOUTUBE_CLIENT_ID="your-google-oauth-client-id"
YOUTUBE_CLIENT_SECRET="your-google-oauth-client-secret"
TIKTOK_CLIENT_KEY="your-tiktok-open-api-client-key"
TIKTOK_CLIENT_SECRET="your-tiktok-client-secret"
```

### 3. Run Development Servers
```bash
pnpm run dev
```
* **Frontend SPA**: [http://localhost:3000](http://localhost:3000)
* **Backend Express API**: [http://localhost:3000](http://localhost:3000)

---

## 3. 1-Click Automated Google Cloud Run Deployment (`us-central1`)

The Shine ecosystem includes a fully automated, end-to-end deployment script that provisions all necessary Google Cloud resources and deploys all 3 serverless services in **Scale-to-Zero ($0 idle cost)** mode.

### Run Deployment

```powershell
# Windows PowerShell
.\scripts\deploy-cloudrun.ps1
```

```bash
# Linux / macOS / Cloud Shell
./scripts/deploy-cloudrun.sh
```

---

## 4. What the Deployment Script Automatically Handles

### Step 1: Google Cloud APIs Check & Auto-Enable
Scans and automatically activates 10 required GCP APIs:
1. `run.googleapis.com` (Cloud Run Serverless Compute)
2. `cloudbuild.googleapis.com` (Container Image Builder)
3. `artifactregistry.googleapis.com` (Container Image Registry)
4. `pubsub.googleapis.com` (Asynchronous Video Rendering Queue & Event Bus)
5. `firestore.googleapis.com` (Cloud Firestore NoSQL API)
6. `datastore.googleapis.com` (Cloud Datastore API for Firestore Native)
7. `cloudscheduler.googleapis.com` (Automated Cron Heartbeat for Token Sync)
8. `aiplatform.googleapis.com` (Google Vertex AI / Gemini 3.5, Imagen 3, Veo)
9. `storage.googleapis.com` (Google Cloud Storage)
10. `texttospeech.googleapis.com` (Google Neural Cloud TTS)

### Step 2: IAM Permissions & Infrastructure Auto-Provisioning
* **IAM Roles**: Automatically assigns `roles/datastore.user`, `roles/pubsub.editor`, `roles/storage.objectAdmin`, and `roles/aiplatform.user` to the Compute Default Service Account (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`).
* **GCS Bucket**: Auto-creates `gs://shine-studio-media` with `uniform_bucket_level_access` if not already existing.
* **Firestore Native Database**: Auto-creates database **`shine-db`** (`us-central1`) in Firestore Native mode if not already existing.
* **Pub/Sub Topics & Subscriptions**: Auto-creates:
  * Topic `shine-render-jobs` $\rightarrow$ Subscription `shine-render-sub`
  * Topic `shine-render-status` $\rightarrow$ Subscription `shine-render-status-sub`

### Step 3: Demucs Stem Separation Worker
* Verifies or deploys `demucs-worker` (FastAPI + PyTorch + Meta Demucs v4 AI) on Cloud Run (`2 vCPU, 4Gi RAM, min-instances: 0`).

### Step 4: Video Render Worker
* Verifies or deploys `shine-render-worker` (Playwright Chromium + WebCodecs Headless Compositor with `VideoRendererPool` instance management) on Cloud Run (`2 vCPU, 4Gi RAM, pool-size: 4, min-instances: 0, max-instances: 5`).

### Step 5: Main Application (`shine-app`)
* Builds the complete Node.js Express backend + Vue 3 SPA container.
* Injects 100% of `.env` configuration via dynamic YAML dictionary (`--env-vars-file`) to preserve all special characters in connection strings (`MONGODB_URI`, B2 keys, Vertex AI settings).
* Deploys with `--min-instances 0 --cpu-throttling` for $0 idle cost.

### Step 6: Cloud Scheduler Token Sync Heartbeat
* Configures `shine-flow-token-sync` job running on cron schedule `*/5 * * * *` (every 5 minutes).
* Wakes the app periodically to refresh Google Flow authentication tokens stored in Firestore `shine-db`.

---

## 5. Deployment Verification

Check the health status of your deployed Cloud Run service:

```bash
curl https://<YOUR_SHINE_APP_URL>/api/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "service": "Shine API Server",
  "version": "0.1.0-alpha",
  "db_provider": "firestore",
  "timestamp": "2026-08-25T00:00:00.000Z"
}
```
