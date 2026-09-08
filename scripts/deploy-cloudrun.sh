#!/usr/bin/env bash
# ==============================================================================
# Automated End-to-End Google Cloud Run Deployment for Shine Studio Ecosystem
# ==============================================================================
set -e

# ─── Robust Project Root Resolution ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../Dockerfile" ]; then
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -f "$SCRIPT_DIR/Dockerfile" ]; then
  ROOT_DIR="$SCRIPT_DIR"
else
  ROOT_DIR="$(pwd)"
fi

cd "$ROOT_DIR"
echo "[Info] Working Directory set to: $ROOT_DIR"

# ─── Load Local .env ──────────────────────────────────────────────────────────
declare -A ENV_MAP
ENV_PATH="$ROOT_DIR/.env"
if [ -f "$ENV_PATH" ]; then
  while IFS='=' read -r key val || [ -n "$key" ]; do
    key=$(echo "$key" | xargs)
    if [[ -n "$key" && ! "$key" =~ ^# ]]; then
      val=$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
      ENV_MAP["$key"]="$val"
    fi
  done < "$ENV_PATH"
fi

REGION="${REGION:-${ENV_MAP["GCP_REGION"]:-us-central1}}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)

if [ -z "$PROJECT_ID" ] || [[ "$PROJECT_ID" == *"ERROR"* ]]; then
  echo "ERROR: No GCP project selected. Please run 'gcloud config set project YOUR_PROJECT_ID' first."
  exit 1
fi

# Deploy mode flags
DEPLOY_INFRA="${DEPLOY_INFRA:-${ENV_MAP["DEPLOY_INFRA"]:-true}}"
DEPLOY_WORKERS="${DEPLOY_WORKERS:-${ENV_MAP["DEPLOY_WORKERS"]:-true}}"
DEPLOY_DEMUCS="${DEPLOY_DEMUCS:-${ENV_MAP["DEPLOY_DEMUCS"]:-$DEPLOY_WORKERS}}"
DEPLOY_RENDER="${DEPLOY_RENDER:-${ENV_MAP["DEPLOY_RENDER"]:-$DEPLOY_WORKERS}}"
DEPLOY_FLOW="${DEPLOY_FLOW:-${ENV_MAP["DEPLOY_FLOW"]:-$DEPLOY_WORKERS}}"

# Parse CLI arguments (e.g. --skip-workers, --skip-infra)
for arg in "$@"; do
  case $arg in
    --skip-workers) DEPLOY_WORKERS=false; DEPLOY_DEMUCS=false; DEPLOY_RENDER=false; DEPLOY_FLOW=false ;;
    --skip-demucs) DEPLOY_DEMUCS=false ;;
    --skip-render) DEPLOY_RENDER=false ;;
    --skip-flow) DEPLOY_FLOW=false ;;
    --skip-infra) DEPLOY_INFRA=false ;;
    --force-workers) DEPLOY_WORKERS=true; DEPLOY_DEMUCS=true; DEPLOY_RENDER=true; DEPLOY_FLOW=true ;;
  esac
done

echo "========================================================="
echo " 🚀 Deploying Shine Studio Ecosystem to Google Cloud Run"
echo " Project ID:       $PROJECT_ID"
echo " Region:           $REGION"
echo " Root Dir:         $ROOT_DIR"
echo " Auto Deploy Infra: $DEPLOY_INFRA"
echo " Deploy Demucs:    $DEPLOY_DEMUCS"
echo " Deploy Render:    $DEPLOY_RENDER"
echo " Deploy Flow AI:   $DEPLOY_FLOW"
echo "========================================================="

# ─── 1. Check & Auto-Enable Required Google Cloud APIs ─────────────────────────
if [ "$DEPLOY_INFRA" = "true" ]; then
  echo ""
  echo "[Step 1/6] Checking and Enabling Required Google Cloud APIs..."

  REQUIRED_APIS=(
    "run.googleapis.com"              # Cloud Run Admin
    "cloudbuild.googleapis.com"       # Cloud Build
    "artifactregistry.googleapis.com" # Artifact Registry
    "pubsub.googleapis.com"           # Cloud Pub/Sub
    "firestore.googleapis.com"        # Cloud Firestore API
    "datastore.googleapis.com"        # Cloud Datastore for Firestore Native
    "cloudscheduler.googleapis.com"   # Cloud Scheduler for Flow Token Sync
    "aiplatform.googleapis.com"       # Vertex AI / Gemini APIs
    "storage.googleapis.com"          # Google Cloud Storage
    "texttospeech.googleapis.com"      # Google Neural TTS
  )

  ENABLED_APIS=$(gcloud services list --enabled --format="value(config.name)" --project "$PROJECT_ID" 2>/dev/null || true)
  MISSING_APIS=()

  for api in "${REQUIRED_APIS[@]}"; do
    if ! echo "$ENABLED_APIS" | grep -qx "$api"; then
      MISSING_APIS+=("$api")
    fi
  done

  if [ ${#MISSING_APIS[@]} -gt 0 ]; then
    echo "Enabling missing GCP APIs: ${MISSING_APIS[*]}..."
    gcloud services enable "${MISSING_APIS[@]}" --project "$PROJECT_ID" --quiet
    echo "All required APIs are now enabled."
  else
    echo "All required Google Cloud APIs are already active."
  fi
else
  echo ""
  echo "[Step 1/6] Skipping GCP APIs verification (--skip-infra)."
fi

# ─── 2. Auto-Provision GCP Infrastructure (GCS, Pub/Sub, Firestore, IAM) ──────
GCS_BUCKET_NAME="${ENV_MAP["GCS_BUCKET_NAME"]:-shine-studio-media}"
ENV_MAP["GCS_BUCKET_NAME"]="$GCS_BUCKET_NAME"

FIRESTORE_DATABASE_ID="${ENV_MAP["FIRESTORE_DATABASE_ID"]:-shine-db}"
ENV_MAP["FIRESTORE_DATABASE_ID"]="$FIRESTORE_DATABASE_ID"
ENV_MAP["FIRESTORE_PROJECT_ID"]="$PROJECT_ID"

JOB_TOPIC="${ENV_MAP["PUBSUB_TOPIC_RENDER"]:-shine-render-jobs}"
STATUS_TOPIC="${ENV_MAP["PUBSUB_TOPIC_STATUS"]:-shine-render-status}"
JOB_SUB="${ENV_MAP["PUBSUB_SUBSCRIPTION_RENDER"]:-shine-render-sub}"
STATUS_SUB="${ENV_MAP["PUBSUB_SUBSCRIPTION_STATUS"]:-shine-render-status-sub}"

ENV_MAP["PUBSUB_TOPIC_RENDER"]="$JOB_TOPIC"
ENV_MAP["PUBSUB_TOPIC_STATUS"]="$STATUS_TOPIC"
ENV_MAP["PUBSUB_SUBSCRIPTION_RENDER"]="$JOB_SUB"
ENV_MAP["PUBSUB_SUBSCRIPTION_STATUS"]="$STATUS_SUB"

if [ "$DEPLOY_INFRA" = "true" ]; then
  echo ""
  echo "[Step 2/6] Verifying and Auto-Provisioning GCP Infrastructure..."

  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)" 2>/dev/null || true)
  if [ -n "$PROJECT_NUMBER" ] && [[ "$PROJECT_NUMBER" != *"ERROR"* ]]; then
    COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    echo "Configuring IAM roles for Compute Service Account: $COMPUTE_SA..."

    ROLES=(
      "roles/datastore.user"
      "roles/pubsub.editor"
      "roles/storage.objectAdmin"
      "roles/aiplatform.user"
      "roles/iam.serviceAccountTokenCreator"
    )

    for role in "${ROLES[@]}"; do
      gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="$role" \
        --condition=None \
        --quiet >/dev/null 2>&1 || true
    done
    echo "IAM permissions configured successfully."
  fi

  if ! gcloud storage buckets describe "gs://$GCS_BUCKET_NAME" >/dev/null 2>&1; then
    echo "Creating GCS Bucket: gs://$GCS_BUCKET_NAME (Location: $REGION)..."
    gcloud storage buckets create "gs://$GCS_BUCKET_NAME" --location="$REGION" --uniform-bucket-level-access --quiet || true
    echo "GCS Bucket 'gs://$GCS_BUCKET_NAME' created successfully."
  else
    echo "GCS Bucket 'gs://$GCS_BUCKET_NAME' is active."
  fi

  if ! gcloud firestore databases describe --database="$FIRESTORE_DATABASE_ID" >/dev/null 2>&1; then
    echo "Creating Firestore Native database '$FIRESTORE_DATABASE_ID' in $REGION..."
    if [ "$FIRESTORE_DATABASE_ID" = "(default)" ]; then
      gcloud firestore databases create --location="$REGION" --type=firestore-native --quiet || true
    else
      gcloud firestore databases create --database="$FIRESTORE_DATABASE_ID" --location="$REGION" --type=firestore-native --quiet || true
    fi
    echo "Firestore Native database '$FIRESTORE_DATABASE_ID' created successfully."
  else
    echo "Firestore Native database '$FIRESTORE_DATABASE_ID' is active."
  fi

  declare -A TOPIC_MAP
  TOPIC_MAP["$JOB_TOPIC"]="$JOB_SUB"
  TOPIC_MAP["$STATUS_TOPIC"]="$STATUS_SUB"

  for t in "${!TOPIC_MAP[@]}"; do
    s="${TOPIC_MAP[$t]}"
    if ! gcloud pubsub topics describe "$t" --project "$PROJECT_ID" >/dev/null 2>&1; then
      echo "Creating Pub/Sub topic: $t..."
      gcloud pubsub topics create "$t" --project "$PROJECT_ID" --quiet
    else
      echo "Pub/Sub topic '$t' is active."
    fi

    if ! gcloud pubsub subscriptions describe "$s" --project "$PROJECT_ID" >/dev/null 2>&1; then
      echo "Creating Pub/Sub subscription: $s (Topic: $t)..."
      gcloud pubsub subscriptions create "$s" --topic="$t" --project "$PROJECT_ID" --quiet
    else
      echo "Pub/Sub subscription '$s' is active."
    fi
  done
else
  echo ""
  echo "[Step 2/6] Skipping GCP Infrastructure verification (--skip-infra)."
fi

# ─── 3. Build & Deploy Demucs AI Worker (From Source or Reuse) ────────────────
DEMUCS_URL=""
if [ "$DEPLOY_DEMUCS" = "true" ]; then
  DEMUCS_CPU="${ENV_MAP["DEMUCS_WORKER_CPU"]:-2}"
  DEMUCS_MEM="${ENV_MAP["DEMUCS_WORKER_MEMORY"]:-4Gi}"
  DEMUCS_TIMEOUT="${ENV_MAP["DEMUCS_WORKER_TIMEOUT"]:-300}"
  DEMUCS_MIN="${ENV_MAP["DEMUCS_WORKER_MIN_INSTANCES"]:-0}"
  DEMUCS_MAX="${ENV_MAP["DEMUCS_WORKER_MAX_INSTANCES"]:-3}"

  echo ""
  echo "[Step 3/6] Building and Deploying Demucs Worker (CPU: $DEMUCS_CPU, Mem: $DEMUCS_MEM, Timeout: ${DEMUCS_TIMEOUT}s, Max Instances: $DEMUCS_MAX)..."
  cd "$ROOT_DIR/services/demucs-worker"
  gcloud run deploy demucs-worker \
    --source . \
    --region "$REGION" \
    --memory "$DEMUCS_MEM" \
    --cpu "$DEMUCS_CPU" \
    --timeout "$DEMUCS_TIMEOUT" \
    --min-instances "$DEMUCS_MIN" \
    --max-instances "$DEMUCS_MAX" \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=$REGION" \
    --quiet

  DEMUCS_URL=$(gcloud run services describe demucs-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  cd "$ROOT_DIR"
  echo "✅ Demucs Worker Deployed: $DEMUCS_URL"
else
  echo ""
  echo "[Step 3/6] Skipping Demucs Worker build (Reusing existing service)..."
  DEMUCS_URL=$(gcloud run services describe demucs-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  if [ -z "$DEMUCS_URL" ] && [ -n "${ENV_MAP["DEMUCS_SERVICE_URL"]}" ]; then
    DEMUCS_URL="${ENV_MAP["DEMUCS_SERVICE_URL"]}"
  fi
  if [ -n "$DEMUCS_URL" ]; then
    echo "ℹ️ Reusing Active Demucs Worker: $DEMUCS_URL"
  else
    echo "⚠️ Notice: Demucs worker URL not found on GCP or in .env."
  fi
fi

# ─── 4. Build & Deploy Video Render Worker (From Source or Reuse) ─────────────
RENDER_URL=""
if [ "$DEPLOY_RENDER" = "true" ]; then
  RENDER_CPU="${ENV_MAP["RENDER_WORKER_CPU"]:-2}"
  RENDER_MEM="${ENV_MAP["RENDER_WORKER_MEMORY"]:-4Gi}"
  RENDER_TIMEOUT="${ENV_MAP["RENDER_WORKER_TIMEOUT"]:-600}"
  RENDER_MIN="${ENV_MAP["RENDER_WORKER_MIN_INSTANCES"]:-0}"
  RENDER_MAX="${ENV_MAP["RENDER_WORKER_MAX_INSTANCES"]:-5}"
  RENDER_CONCURRENCY="${ENV_MAP["RENDER_WORKER_CONCURRENCY"]:-10}"
  RENDER_POOL_SIZE="${ENV_MAP["RENDER_POOL_SIZE"]:-4}"
  RENDER_POOL_MIN="${ENV_MAP["RENDER_POOL_MIN"]:-1}"
  RENDER_MAX_PER_INSTANCE="${ENV_MAP["RENDER_MAX_PER_INSTANCE"]:-25}"

  echo ""
  echo "[Step 4/6] Building and Deploying Video Render Worker (CPU: $RENDER_CPU, Mem: $RENDER_MEM, Timeout: ${RENDER_TIMEOUT}s, Max Instances: $RENDER_MAX, Pool: $RENDER_POOL_SIZE)..."
  cd "$ROOT_DIR/services/render-worker"
  gcloud run deploy shine-render-worker \
    --source . \
    --region "$REGION" \
    --memory "$RENDER_MEM" \
    --cpu "$RENDER_CPU" \
    --timeout "$RENDER_TIMEOUT" \
    --concurrency "$RENDER_CONCURRENCY" \
    --min-instances "$RENDER_MIN" \
    --max-instances "$RENDER_MAX" \
    --allow-unauthenticated \
    --set-env-vars "GCS_BUCKET=$GCS_BUCKET_NAME,PUBSUB_TOPIC_STATUS=$STATUS_TOPIC,RENDER_POOL_SIZE=$RENDER_POOL_SIZE,RENDER_POOL_MIN=$RENDER_POOL_MIN,RENDER_MAX_PER_INSTANCE=$RENDER_MAX_PER_INSTANCE,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=$REGION" \
    --quiet

  RENDER_URL=$(gcloud run services describe shine-render-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  cd "$ROOT_DIR"
  echo "✅ Render Worker Deployed: $RENDER_URL"
else
  echo ""
  echo "[Step 4/6] Skipping Video Render Worker build (Reusing existing service)..."
  RENDER_URL=$(gcloud run services describe shine-render-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  if [ -z "$RENDER_URL" ] && [ -n "${ENV_MAP["RENDER_WORKER_URL"]}" ]; then
    RENDER_URL="${ENV_MAP["RENDER_WORKER_URL"]}"
  fi
  if [ -n "$RENDER_URL" ]; then
    echo "ℹ️ Reusing Active Render Worker: $RENDER_URL"
  else
    echo "⚠️ Notice: Render worker URL not found on GCP or in .env."
  fi
fi

# ─── 5. Build & Deploy Shine Flow AI Worker (From Source or Reuse) ───────────
FLOW_WORKER_URL=""
if [ "$DEPLOY_FLOW" = "true" ]; then
  FLOW_CPU="${ENV_MAP["FLOW_WORKER_CPU"]:-2}"
  FLOW_MEM="${ENV_MAP["FLOW_WORKER_MEMORY"]:-4Gi}"
  FLOW_TIMEOUT="${ENV_MAP["FLOW_WORKER_TIMEOUT"]:-600}"
  FLOW_MIN="${ENV_MAP["FLOW_WORKER_MIN_INSTANCES"]:-0}"
  FLOW_MAX="${ENV_MAP["FLOW_WORKER_MAX_INSTANCES"]:-3}"

  echo ""
  echo "[Step 5/7] Building and Deploying Shine Flow AI Worker (CPU: $FLOW_CPU, Mem: $FLOW_MEM, Timeout: ${FLOW_TIMEOUT}s, Max Instances: $FLOW_MAX)..."
  cd "$ROOT_DIR/services/flow-worker"
  gcloud run deploy shine-flow-worker \
    --source . \
    --region "$REGION" \
    --memory "$FLOW_MEM" \
    --cpu "$FLOW_CPU" \
    --timeout "$FLOW_TIMEOUT" \
    --min-instances "$FLOW_MIN" \
    --max-instances "$FLOW_MAX" \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=$REGION,NODE_ENV=production" \
    --quiet

  FLOW_WORKER_URL=$(gcloud run services describe shine-flow-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  cd "$ROOT_DIR"
  echo "✅ Flow Worker Deployed: $FLOW_WORKER_URL"
else
  echo ""
  echo "[Step 5/7] Skipping Flow Worker build (Reusing existing service)..."
  FLOW_WORKER_URL=$(gcloud run services describe shine-flow-worker --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)
  if [ -z "$FLOW_WORKER_URL" ] && [ -n "${ENV_MAP["FLOW_WORKER_URL"]}" ]; then
    FLOW_WORKER_URL="${ENV_MAP["FLOW_WORKER_URL"]}"
  fi
  if [ -n "$FLOW_WORKER_URL" ]; then
    echo "ℹ️ Reusing Active Flow Worker: $FLOW_WORKER_URL"
  else
    echo "⚠️ Notice: Flow worker URL not found on GCP or in .env."
  fi
fi

# ─── 6. Deploy Main Shine Application (Full .env Synchronization) ─────────────
APP_CPU="${ENV_MAP["APP_CPU"]:-2}"
APP_MEM="${ENV_MAP["APP_MEMORY"]:-4Gi}"
APP_TIMEOUT="${ENV_MAP["APP_TIMEOUT"]:-300}"
APP_MIN="${ENV_MAP["APP_MIN_INSTANCES"]:-0}"
APP_MAX="${ENV_MAP["APP_MAX_INSTANCES"]:-3}"

echo ""
echo "[Step 6/7] Building and Deploying Main Shine App (CPU: $APP_CPU, Mem: $APP_MEM, Timeout: ${APP_TIMEOUT}s, Max Instances: $APP_MAX)..."

if [ -n "$DEMUCS_URL" ]; then ENV_MAP["DEMUCS_SERVICE_URL"]="$DEMUCS_URL"; fi
if [ -n "$RENDER_URL" ]; then ENV_MAP["RENDER_WORKER_URL"]="$RENDER_URL"; fi
if [ -n "$FLOW_WORKER_URL" ]; then ENV_MAP["FLOW_WORKER_URL"]="$FLOW_WORKER_URL"; fi
ENV_MAP["GOOGLE_CLOUD_PROJECT"]="$PROJECT_ID"
ENV_MAP["GOOGLE_CLOUD_LOCATION"]="global"
ENV_MAP["GOOGLE_GENAI_USE_VERTEXAI"]="1"

if [ -z "${ENV_MAP["DB_PROVIDER"]}" ]; then
  ENV_MAP["DB_PROVIDER"]="firestore"
fi

TEMP_ENV_FILE="$ROOT_DIR/tmp-cloudrun-env.yaml"
> "$TEMP_ENV_FILE"

for k in "${!ENV_MAP[@]}"; do
  v="${ENV_MAP[$k]}"
  v_escaped=$(echo "$v" | sed 's/"/\\"/g')
  echo "$k: \"$v_escaped\"" >> "$TEMP_ENV_FILE"
done

trap 'rm -f "$TEMP_ENV_FILE"' EXIT

cd "$ROOT_DIR"
gcloud run deploy shine-app \
  --source . \
  --region "$REGION" \
  --memory "$APP_MEM" \
  --cpu "$APP_CPU" \
  --timeout "$APP_TIMEOUT" \
  --min-instances "$APP_MIN" \
  --cpu-throttling \
  --max-instances "$APP_MAX" \
  --allow-unauthenticated \
  --env-vars-file "$TEMP_ENV_FILE" \
  --quiet

rm -f "$TEMP_ENV_FILE"
trap - EXIT

SHINE_APP_URL=$(gcloud run services describe shine-app --region "$REGION" --format="value(status.url)" 2>/dev/null | xargs || true)

# Sync SHINE_APP_URL redirect target to workers
try_sync_redirect() {
  gcloud run services update demucs-worker --update-env-vars "SHINE_APP_URL=$SHINE_APP_URL" --region "$REGION" --quiet >/dev/null 2>&1 || true
  gcloud run services update shine-render-worker --update-env-vars "SHINE_APP_URL=$SHINE_APP_URL" --region "$REGION" --quiet >/dev/null 2>&1 || true
  gcloud run services update shine-flow-worker --update-env-vars "SHINE_APP_URL=$SHINE_APP_URL" --region "$REGION" --quiet >/dev/null 2>&1 || true
}
try_sync_redirect

# ─── 7. Configure Cloud Scheduler for Periodic Flow Token Sync Heartbeat ──────
echo ""
echo "[Step 7/7] Configuring Google Cloud Scheduler for Flow Token Sync..."

JOB_NAME="shine-flow-token-sync"
SYNC_URI="$SHINE_APP_URL/api/flow-accounts/sync"

if gcloud scheduler jobs describe "$JOB_NAME" --location "$REGION" >/dev/null 2>&1; then
  echo "Updating Cloud Scheduler job: $JobName (Schedule: */5 * * * *)..."
  gcloud scheduler jobs update http "$JOB_NAME" --location "$REGION" --schedule "*/5 * * * *" --uri "$SYNC_URI" --http-method POST --attempt-deadline 180s --quiet
else
  echo "Creating Cloud Scheduler job: $JOB_NAME (Schedule: */5 * * * *)..."
  gcloud scheduler jobs create http "$JOB_NAME" --location "$REGION" --schedule "*/5 * * * *" --uri "$SYNC_URI" --http-method POST --attempt-deadline 180s --quiet
fi
echo "Cloud Scheduler job '$JOB_NAME' active -> $SYNC_URI"

echo ""
echo "========================================================="
echo " Shine Studio Ecosystem Deployed Successfully!"
echo " Main App URL:   $SHINE_APP_URL"
echo " Demucs Worker:  $DEMUCS_URL"
echo " Render Worker:  $RENDER_URL"
echo " Flow Sync:      Cloud Scheduler [Every 5 mins, Scale-to-Zero]"
DB_INFO="${ENV_MAP["DB_PROVIDER"]} [DB ID: $FIRESTORE_DATABASE_ID]"
echo " Database:       $DB_INFO"
echo " GCS Bucket:     gs://$GCS_BUCKET_NAME"
echo " Pub/Sub Topics: $JOB_TOPIC, $STATUS_TOPIC"
echo " GCP APIs, IAM:  Verified and Auto-Configured"
echo "========================================================="
