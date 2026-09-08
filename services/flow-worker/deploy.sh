#!/usr/bin/env bash
# ==============================================================================
# Standalone Google Cloud Run Deployment for Shine Flow AI Worker
# ==============================================================================
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$( cd "$DIR/../.." && pwd )"

# Load .env from project root if available
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source <(grep -v '^#' "$ROOT_DIR/.env" | sed -e 's/\r$//') 2>/dev/null || true
  set +a
fi

SERVICE_NAME="${SERVICE_NAME:-${FLOW_WORKER_SERVICE_NAME:-shine-flow-worker}}"
REGION="${REGION:-${GCP_REGION:-us-central1}}"
MEMORY="${MEMORY:-${FLOW_WORKER_MEMORY:-4Gi}}"
CPU="${CPU:-${FLOW_WORKER_CPU:-2}}"
TIMEOUT="${TIMEOUT:-${FLOW_WORKER_TIMEOUT:-600}}"
MIN_INSTANCES="${MIN_INSTANCES:-${FLOW_WORKER_MIN_INSTANCES:-0}}"
MAX_INSTANCES="${MAX_INSTANCES:-${FLOW_WORKER_MAX_INSTANCES:-3}}"

echo "========================================================="
echo " 🚀 Deploying Shine Flow Worker to Google Cloud Run"
echo " Service:       $SERVICE_NAME"
echo " Region:        $REGION"
echo " Memory / CPU:  $MEMORY / $CPU CPU"
echo " Timeout:       $TIMEOUT seconds"
echo " Min / Max:     $MIN_INSTANCES / $MAX_INSTANCES instances"
echo "========================================================="

PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "$PROJECT_ID" ] || [[ "$PROJECT_ID" == *"ERROR"* ]]; then
  echo "ERROR: No GCP project selected. Please run 'gcloud config set project YOUR_PROJECT_ID' first."
  exit 1
fi

# Deploy from source using Cloud Build
gcloud run deploy "$SERVICE_NAME" \
  --source "$DIR" \
  --region "$REGION" \
  --memory "$MEMORY" \
  --cpu "$CPU" \
  --timeout "$TIMEOUT" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=$REGION,NODE_ENV=production" \
  --allow-unauthenticated \
  --quiet

# Print service URL
URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')
echo ""
echo "========================================================="
echo "✅ Shine Flow AI Worker Deployment Successful!"
echo "Service URL:       $URL"
echo "Extension Config:  ${URL/https:\/\//wss:\/\/}/ws"
echo "Dashboard UI:      $URL"
echo ""
echo "Add this line to your Shine Server .env file:"
echo "FLOW_WORKER_URL=$URL"
echo "========================================================="
