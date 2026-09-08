# Automated End-to-End Google Cloud Run Deployment for Shine Studio Ecosystem
param(
  [switch]$SkipWorkers = $false,       # Skip building and deploying all workers (Demucs, Render, Flow)
  [switch]$SkipDemucs = $false,        # Skip Demucs AI Worker only
  [switch]$SkipRender = $false,        # Skip Video Render Worker only
  [switch]$SkipFlow = $false,          # Skip Shine Flow AI Worker only
  [switch]$SkipInfra = $false,         # Skip GCP APIs, Storage bucket and Firestore setup
  [switch]$ForceWorkers = $false,      # Force rebuild and deploy workers
  [string]$Region = ""
)

$ErrorActionPreference = "Stop"

# --- Robust Project Root Resolution -------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

$RootDir = if (Test-Path "$ScriptDir\..\Dockerfile") {
  (Resolve-Path "$ScriptDir\..").Path
} elseif (Test-Path "$ScriptDir\Dockerfile") {
  (Resolve-Path "$ScriptDir").Path
} else {
  (Get-Location).Path
}

Set-Location $RootDir
Write-Host "[Info] Working Directory set to: $RootDir" -ForegroundColor Gray

# --- Load Local .env ----------------------------------------------------------
$EnvMap = @{}
$EnvPath = Join-Path $RootDir ".env"
if (Test-Path $EnvPath) {
  $lines = Get-Content $EnvPath
  foreach ($line in $lines) {
    $line = $line.Trim()
    if ($line -and -not $line.StartsWith("#")) {
      $parts = $line.Split("=", 2)
      $key = $parts[0].Trim()
      $val = if ($parts.Length -gt 1) { $parts[1].Trim().Trim('"').Trim("'") } else { "" }
      if ($key) {
        $EnvMap[$key] = $val
      }
    }
  }
}

if (-not $Region) {
  $Region = if ($env:REGION) { $env:REGION } elseif ($EnvMap.ContainsKey("GCP_REGION") -and $EnvMap["GCP_REGION"]) { $EnvMap["GCP_REGION"] } else { "us-central1" }
}

$ProjectId = (gcloud config get-value project 2>&1).Trim()
if (-not $ProjectId -or $ProjectId -like "*ERROR*") {
  Write-Error "No GCP project selected. Please run 'gcloud config set project YOUR_PROJECT_ID' first."
}

# Resolve deploy mode flags (CLI Parameter > .env > Defaults)
$DeployInfra = if ($SkipInfra) { $false } elseif ($EnvMap.ContainsKey("DEPLOY_INFRA") -and $EnvMap["DEPLOY_INFRA"] -match "^(false|0)$") { $false } else { $true }
$DeployDemucs = if ($ForceWorkers) { $true } elseif ($SkipWorkers -or $SkipDemucs) { $false } elseif ($EnvMap.ContainsKey("DEPLOY_DEMUCS") -and $EnvMap["DEPLOY_DEMUCS"] -match "^(false|0)$") { $false } elseif ($EnvMap.ContainsKey("DEPLOY_WORKERS") -and $EnvMap["DEPLOY_WORKERS"] -match "^(false|0)$") { $false } else { $true }
$DeployRender = if ($ForceWorkers) { $true } elseif ($SkipWorkers -or $SkipRender) { $false } elseif ($EnvMap.ContainsKey("DEPLOY_RENDER") -and $EnvMap["DEPLOY_RENDER"] -match "^(false|0)$") { $false } elseif ($EnvMap.ContainsKey("DEPLOY_WORKERS") -and $EnvMap["DEPLOY_WORKERS"] -match "^(false|0)$") { $false } else { $true }
$DeployFlow = if ($ForceWorkers) { $true } elseif ($SkipWorkers -or $SkipFlow) { $false } elseif ($EnvMap.ContainsKey("DEPLOY_FLOW") -and $EnvMap["DEPLOY_FLOW"] -match "^(false|0)$") { $false } elseif ($EnvMap.ContainsKey("DEPLOY_WORKERS") -and $EnvMap["DEPLOY_WORKERS"] -match "^(false|0)$") { $false } else { $true }

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Deploying Shine Studio Ecosystem to Google Cloud Run" -ForegroundColor Cyan
Write-Host " Project ID:       $ProjectId" -ForegroundColor Yellow
Write-Host " Region:           $Region" -ForegroundColor Yellow
Write-Host " Root Dir:         $RootDir" -ForegroundColor Yellow
Write-Host " Auto Deploy Infra: $(if ($DeployInfra) { 'YES' } else { 'NO (Skipped)' })" -ForegroundColor White
Write-Host " Deploy Demucs:    $(if ($DeployDemucs) { 'YES' } else { 'NO (Reuse existing)' })" -ForegroundColor White
Write-Host " Deploy Render:    $(if ($DeployRender) { 'YES' } else { 'NO (Reuse existing)' })" -ForegroundColor White
Write-Host " Deploy Flow AI:   $(if ($DeployFlow) { 'YES' } else { 'NO (Reuse existing)' })" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Cyan

# --- 1. Check and Auto-Enable Required Google Cloud APIs ----------------------
if ($DeployInfra) {
  Write-Host "`n[Step 1/6] Checking and Enabling Required Google Cloud APIs..." -ForegroundColor Yellow

  $RequiredAPIs = @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "pubsub.googleapis.com",
    "firestore.googleapis.com",
    "datastore.googleapis.com",
    "cloudscheduler.googleapis.com",
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
    "texttospeech.googleapis.com"
  )

  $EnabledAPIs = (gcloud services list --enabled --format="value(config.name)" --project $ProjectId 2>&1) -split "`n" | ForEach-Object { $_.Trim() }
  $MissingAPIs = @()

  foreach ($api in $RequiredAPIs) {
    if ($api -and ($EnabledAPIs -notcontains $api)) {
      $MissingAPIs += $api
    }
  }

  if ($MissingAPIs.Count -gt 0) {
    Write-Host "Enabling missing GCP APIs: $($MissingAPIs -join ', ')..." -ForegroundColor Gray
    gcloud services enable $MissingAPIs --project $ProjectId --quiet
    Write-Host "All required APIs are now enabled." -ForegroundColor Green
  } else {
    Write-Host "All required Google Cloud APIs are already active." -ForegroundColor Green
  }
} else {
  Write-Host "`n[Step 1/6] Skipping GCP APIs verification (-SkipInfra)." -ForegroundColor DarkGray
}

# --- 2. Auto-Provision GCP Infrastructure (GCS, Pub/Sub, Firestore, IAM) -------
$GcsBucketName = if ($EnvMap.ContainsKey("GCS_BUCKET_NAME") -and $EnvMap["GCS_BUCKET_NAME"]) { $EnvMap["GCS_BUCKET_NAME"] } else { "shine-studio-media" }
$EnvMap["GCS_BUCKET_NAME"] = $GcsBucketName

$FirestoreDbId = if ($EnvMap.ContainsKey("FIRESTORE_DATABASE_ID") -and $EnvMap["FIRESTORE_DATABASE_ID"]) { $EnvMap["FIRESTORE_DATABASE_ID"] } else { "shine-db" }
$EnvMap["FIRESTORE_DATABASE_ID"] = $FirestoreDbId
$EnvMap["FIRESTORE_PROJECT_ID"] = $ProjectId

$JobTopic = if ($EnvMap.ContainsKey("PUBSUB_TOPIC_RENDER") -and $EnvMap["PUBSUB_TOPIC_RENDER"]) { $EnvMap["PUBSUB_TOPIC_RENDER"] } else { "shine-render-jobs" }
$StatusTopic = if ($EnvMap.ContainsKey("PUBSUB_TOPIC_STATUS") -and $EnvMap["PUBSUB_TOPIC_STATUS"]) { $EnvMap["PUBSUB_TOPIC_STATUS"] } else { "shine-render-status" }
$JobSub = if ($EnvMap.ContainsKey("PUBSUB_SUBSCRIPTION_RENDER") -and $EnvMap["PUBSUB_SUBSCRIPTION_RENDER"]) { $EnvMap["PUBSUB_SUBSCRIPTION_RENDER"] } else { "shine-render-sub" }
$StatusSub = if ($EnvMap.ContainsKey("PUBSUB_SUBSCRIPTION_STATUS") -and $EnvMap["PUBSUB_SUBSCRIPTION_STATUS"]) { $EnvMap["PUBSUB_SUBSCRIPTION_STATUS"] } else { "shine-render-status-sub" }

$EnvMap["PUBSUB_TOPIC_RENDER"] = $JobTopic
$EnvMap["PUBSUB_TOPIC_STATUS"] = $StatusTopic
$EnvMap["PUBSUB_SUBSCRIPTION_RENDER"] = $JobSub
$EnvMap["PUBSUB_SUBSCRIPTION_STATUS"] = $StatusSub

if ($DeployInfra) {
  Write-Host "`n[Step 2/6] Verifying and Auto-Provisioning GCP Infrastructure..." -ForegroundColor Yellow

  # A. IAM Roles for Compute Service Account
  try {
    $ProjectNumber = (gcloud projects describe $ProjectId --format "value(projectNumber)" 2>&1).Trim()
    if ($ProjectNumber -and $ProjectNumber -notlike "*ERROR*") {
      $ComputeSA = "$ProjectNumber-compute@developer.gserviceaccount.com"
      Write-Host "Configuring IAM roles for Compute Service Account: $ComputeSA..." -ForegroundColor Gray
      
      $Roles = @(
        "roles/datastore.user",
        "roles/pubsub.editor",
        "roles/storage.objectAdmin",
        "roles/aiplatform.user",
        "roles/iam.serviceAccountTokenCreator"
      )

      foreach ($role in $Roles) {
        gcloud projects add-iam-policy-binding $ProjectId `
          --member="serviceAccount:$ComputeSA" `
          --role="$role" `
          --condition=None `
          --quiet >$null 2>&1
      }
      Write-Host "IAM permissions configured successfully." -ForegroundColor Green
    }
  } catch {
    Write-Host "Notice: IAM verification skipped: $_" -ForegroundColor DarkYellow
  }

  # B. Auto-Create Google Cloud Storage (GCS) Bucket if not exists
  $bucketExists = $false
  try {
    $describeBucket = gcloud storage buckets describe "gs://$GcsBucketName" 2>&1
    if ($describeBucket -notlike "*ERROR*" -and $describeBucket -notlike "*NOT_FOUND*") {
      $bucketExists = $true
    }
  } catch {
    $bucketExists = $false
  }

  if (-not $bucketExists) {
    Write-Host "Creating GCS Bucket: gs://$GcsBucketName (Location: $Region)..." -ForegroundColor Gray
    try {
      gcloud storage buckets create "gs://$GcsBucketName" --location=$Region --uniform-bucket-level-access --quiet
      Write-Host "GCS Bucket 'gs://$GcsBucketName' created successfully." -ForegroundColor Green
    } catch {
      Write-Host "Notice: Could not auto-create GCS bucket: $_" -ForegroundColor DarkYellow
    }
  } else {
    Write-Host "GCS Bucket 'gs://$GcsBucketName' is active." -ForegroundColor Green
  }

  # Ensure CORS policy for browser & worker media loading
  $CorsFile = Join-Path $RootDir "gcs-cors.json"
  if (Test-Path $CorsFile) {
    try {
      gcloud storage buckets update "gs://$GcsBucketName" --cors-file="$CorsFile" --quiet >$null 2>&1
      Write-Host "GCS CORS policy configured (*, GET/HEAD/PUT/POST/OPTIONS)." -ForegroundColor Green
    } catch {}
  }

  # C. Auto-Create Firestore Native Database
  $dbExists = $false
  try {
    $describeDb = gcloud firestore databases describe --database="$FirestoreDbId" 2>&1
    if ($describeDb -notlike "*ERROR*" -and $describeDb -notlike "*NOT_FOUND*") {
      $dbExists = $true
    }
  } catch {
    $dbExists = $false
  }

  if (-not $dbExists) {
    Write-Host "Creating Firestore Native database '$FirestoreDbId' in $Region..." -ForegroundColor Gray
    try {
      if ($FirestoreDbId -eq "(default)") {
        gcloud firestore databases create --location=$Region --type=firestore-native --quiet
      } else {
        gcloud firestore databases create --database="$FirestoreDbId" --location=$Region --type=firestore-native --quiet
      }
      Write-Host "Firestore Native database '$FirestoreDbId' created successfully." -ForegroundColor Green
    } catch {
      Write-Host "Notice: Firestore database creation notice: $_" -ForegroundColor DarkYellow
    }
  } else {
    Write-Host "Firestore Native database '$FirestoreDbId' is active." -ForegroundColor Green
  }

  # D. Auto-Create Pub/Sub Topics and Subscriptions
  $topicMap = @{
    $JobTopic = $JobSub
    $StatusTopic = $StatusSub
  }

  foreach ($t in $topicMap.Keys) {
    $s = $topicMap[$t]
    $tExists = $false
    try {
      $null = gcloud pubsub topics describe $t --project $ProjectId 2>&1
      $tExists = $true
    } catch {}

    if (-not $tExists) {
      Write-Host "Creating Pub/Sub topic: $t..." -ForegroundColor Gray
      gcloud pubsub topics create $t --project $ProjectId --quiet
    } else {
      Write-Host "Pub/Sub topic '$t' is active." -ForegroundColor Green
    }

    $sExists = $false
    try {
      $null = gcloud pubsub subscriptions describe $s --project $ProjectId 2>&1
      $sExists = $true
    } catch {}

    if (-not $sExists) {
      Write-Host "Creating Pub/Sub subscription: $s (Topic: $t)..." -ForegroundColor Gray
      gcloud pubsub subscriptions create $s --topic=$t --project $ProjectId --quiet
    } else {
      Write-Host "Pub/Sub subscription '$s' is active." -ForegroundColor Green
    }
  }
} else {
  Write-Host "`n[Step 2/6] Skipping GCP Infrastructure verification (-SkipInfra)." -ForegroundColor DarkGray
}

# --- 3. Build and Deploy Demucs AI Worker (From Source or Reuse) ---------------
$DemucsUrl = ""
if ($DeployDemucs) {
  $DemucsCpu = if ($EnvMap.ContainsKey("DEMUCS_WORKER_CPU") -and $EnvMap["DEMUCS_WORKER_CPU"]) { $EnvMap["DEMUCS_WORKER_CPU"] } else { "2" }
  $DemucsMem = if ($EnvMap.ContainsKey("DEMUCS_WORKER_MEMORY") -and $EnvMap["DEMUCS_WORKER_MEMORY"]) { $EnvMap["DEMUCS_WORKER_MEMORY"] } else { "4Gi" }
  $DemucsTimeout = if ($EnvMap.ContainsKey("DEMUCS_WORKER_TIMEOUT") -and $EnvMap["DEMUCS_WORKER_TIMEOUT"]) { $EnvMap["DEMUCS_WORKER_TIMEOUT"] } else { "300" }
  $DemucsMin = if ($EnvMap.ContainsKey("DEMUCS_WORKER_MIN_INSTANCES") -and $EnvMap["DEMUCS_WORKER_MIN_INSTANCES"]) { $EnvMap["DEMUCS_WORKER_MIN_INSTANCES"] } else { "0" }
  $DemucsMax = if ($EnvMap.ContainsKey("DEMUCS_WORKER_MAX_INSTANCES") -and $EnvMap["DEMUCS_WORKER_MAX_INSTANCES"]) { $EnvMap["DEMUCS_WORKER_MAX_INSTANCES"] } else { "3" }

  Write-Host "`n[Step 3/6] Building and Deploying Demucs Worker (CPU: $DemucsCpu, Mem: $DemucsMem, Timeout: ${DemucsTimeout}s, Max Instances: $DemucsMax)..." -ForegroundColor Yellow
  Push-Location (Join-Path $RootDir "services/demucs-worker")
  gcloud run deploy demucs-worker `
    --source . `
    --region $Region `
    --memory $DemucsMem `
    --cpu $DemucsCpu `
    --timeout $DemucsTimeout `
    --min-instances $DemucsMin `
    --max-instances $DemucsMax `
    --allow-unauthenticated `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$ProjectId,GCP_REGION=$Region" `
    --quiet
  $DemucsUrl = (gcloud run services describe demucs-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  Pop-Location
  Write-Host "Demucs Worker Deployed: $DemucsUrl" -ForegroundColor Green
} else {
  Write-Host "`n[Step 3/6] Skipping Demucs Worker build (Reusing existing service)..." -ForegroundColor DarkGray
  try {
    $DemucsUrl = (gcloud run services describe demucs-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  } catch {}
  if (-not $DemucsUrl -and $EnvMap.ContainsKey("DEMUCS_SERVICE_URL")) {
    $DemucsUrl = $EnvMap["DEMUCS_SERVICE_URL"]
  }
  if ($DemucsUrl) {
    Write-Host "Reusing Active Demucs Worker: $DemucsUrl" -ForegroundColor Green
  } else {
    Write-Host "Notice: Demucs worker URL not found on GCP or in .env." -ForegroundColor DarkYellow
  }
}

# --- 4. Build and Deploy Video Render Worker (From Source or Reuse) ------------
$RenderUrl = ""
if ($DeployRender) {
  $RenderCpu = if ($EnvMap.ContainsKey("RENDER_WORKER_CPU") -and $EnvMap["RENDER_WORKER_CPU"]) { $EnvMap["RENDER_WORKER_CPU"] } else { "2" }
  $RenderMem = if ($EnvMap.ContainsKey("RENDER_WORKER_MEMORY") -and $EnvMap["RENDER_WORKER_MEMORY"]) { $EnvMap["RENDER_WORKER_MEMORY"] } else { "4Gi" }
  $RenderTimeout = if ($EnvMap.ContainsKey("RENDER_WORKER_TIMEOUT") -and $EnvMap["RENDER_WORKER_TIMEOUT"]) { $EnvMap["RENDER_WORKER_TIMEOUT"] } else { "600" }
  $RenderMin = if ($EnvMap.ContainsKey("RENDER_WORKER_MIN_INSTANCES") -and $EnvMap["RENDER_WORKER_MIN_INSTANCES"]) { $EnvMap["RENDER_WORKER_MIN_INSTANCES"] } else { "0" }
  $RenderMax = if ($EnvMap.ContainsKey("RENDER_WORKER_MAX_INSTANCES") -and $EnvMap["RENDER_WORKER_MAX_INSTANCES"]) { $EnvMap["RENDER_WORKER_MAX_INSTANCES"] } else { "5" }
  $RenderConcurrency = if ($EnvMap.ContainsKey("RENDER_WORKER_CONCURRENCY") -and $EnvMap["RENDER_WORKER_CONCURRENCY"]) { $EnvMap["RENDER_WORKER_CONCURRENCY"] } else { "10" }
  $RenderPoolSize = if ($EnvMap.ContainsKey("RENDER_POOL_SIZE") -and $EnvMap["RENDER_POOL_SIZE"]) { $EnvMap["RENDER_POOL_SIZE"] } else { "4" }
  $RenderPoolMin = if ($EnvMap.ContainsKey("RENDER_POOL_MIN") -and $EnvMap["RENDER_POOL_MIN"]) { $EnvMap["RENDER_POOL_MIN"] } else { "1" }
  $RenderMaxPerInstance = if ($EnvMap.ContainsKey("RENDER_MAX_PER_INSTANCE") -and $EnvMap["RENDER_MAX_PER_INSTANCE"]) { $EnvMap["RENDER_MAX_PER_INSTANCE"] } else { "25" }

  Write-Host "`n[Step 4/6] Building and Deploying Video Render Worker (CPU: $RenderCpu, Mem: $RenderMem, Timeout: ${RenderTimeout}s, Max Instances: $RenderMax, Pool Size: $RenderPoolSize)..." -ForegroundColor Yellow
  Push-Location (Join-Path $RootDir "services/render-worker")
  gcloud run deploy shine-render-worker `
    --source . `
    --region $Region `
    --memory $RenderMem `
    --cpu $RenderCpu `
    --timeout $RenderTimeout `
    --concurrency $RenderConcurrency `
    --min-instances $RenderMin `
    --max-instances $RenderMax `
    --allow-unauthenticated `
    --set-env-vars "GCS_BUCKET=$GcsBucketName,PUBSUB_TOPIC_STATUS=$StatusTopic,RENDER_POOL_SIZE=$RenderPoolSize,RENDER_POOL_MIN=$RenderPoolMin,RENDER_MAX_PER_INSTANCE=$RenderMaxPerInstance,GOOGLE_CLOUD_PROJECT=$ProjectId,GCP_REGION=$Region" `
    --quiet
  $RenderUrl = (gcloud run services describe shine-render-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  Pop-Location
  Write-Host "Render Worker Deployed: $RenderUrl" -ForegroundColor Green
} else {
  Write-Host "`n[Step 4/6] Skipping Video Render Worker build (Reusing existing service)..." -ForegroundColor DarkGray
  try {
    $RenderUrl = (gcloud run services describe shine-render-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  } catch {}
  if (-not $RenderUrl -and $EnvMap.ContainsKey("RENDER_WORKER_URL")) {
    $RenderUrl = $EnvMap["RENDER_WORKER_URL"]
  }
  if ($RenderUrl) {
    Write-Host "Reusing Active Render Worker: $RenderUrl" -ForegroundColor Green
  } else {
    Write-Host "Notice: Render worker URL not found on GCP or in .env." -ForegroundColor DarkYellow
  }
}

# --- 5. Build and Deploy Shine Flow AI Worker (From Source or Reuse) -----------
$FlowUrl = ""
if ($DeployFlow) {
  $FlowCpu = if ($EnvMap.ContainsKey("FLOW_WORKER_CPU") -and $EnvMap["FLOW_WORKER_CPU"]) { $EnvMap["FLOW_WORKER_CPU"] } else { "2" }
  $FlowMem = if ($EnvMap.ContainsKey("FLOW_WORKER_MEMORY") -and $EnvMap["FLOW_WORKER_MEMORY"]) { $EnvMap["FLOW_WORKER_MEMORY"] } else { "4Gi" }
  $FlowTimeout = if ($EnvMap.ContainsKey("FLOW_WORKER_TIMEOUT") -and $EnvMap["FLOW_WORKER_TIMEOUT"]) { $EnvMap["FLOW_WORKER_TIMEOUT"] } else { "600" }
  $FlowMin = if ($EnvMap.ContainsKey("FLOW_WORKER_MIN_INSTANCES") -and $EnvMap["FLOW_WORKER_MIN_INSTANCES"]) { $EnvMap["FLOW_WORKER_MIN_INSTANCES"] } else { "0" }
  $FlowMax = if ($EnvMap.ContainsKey("FLOW_WORKER_MAX_INSTANCES") -and $EnvMap["FLOW_WORKER_MAX_INSTANCES"]) { $EnvMap["FLOW_WORKER_MAX_INSTANCES"] } else { "3" }

  Write-Host "`n[Step 5/7] Building and Deploying Shine Flow AI Worker (CPU: $FlowCpu, Mem: $FlowMem, Timeout: ${FlowTimeout}s, Max Instances: $FlowMax)..." -ForegroundColor Yellow
  Push-Location (Join-Path $RootDir "services/flow-worker")
  gcloud run deploy shine-flow-worker `
    --source . `
    --region $Region `
    --memory $FlowMem `
    --cpu $FlowCpu `
    --timeout $FlowTimeout `
    --min-instances $FlowMin `
    --max-instances $FlowMax `
    --allow-unauthenticated `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$ProjectId,GCP_REGION=$Region,NODE_ENV=production" `
    --quiet
  $FlowUrl = (gcloud run services describe shine-flow-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  Pop-Location
  Write-Host "Flow Worker Deployed: $FlowUrl" -ForegroundColor Green
} else {
  Write-Host "`n[Step 5/7] Skipping Flow Worker build (Reusing existing service)..." -ForegroundColor DarkGray
  try {
    $FlowUrl = (gcloud run services describe shine-flow-worker --region $Region --format "value(status.url)" 2>$null).Trim()
  } catch {}
  if (-not $FlowUrl -and $EnvMap.ContainsKey("FLOW_WORKER_URL")) {
    $FlowUrl = $EnvMap["FLOW_WORKER_URL"]
  }
  if ($FlowUrl) {
    Write-Host "Reusing Active Flow Worker: $FlowUrl" -ForegroundColor Green
  } else {
    Write-Host "Notice: Flow worker URL not found on GCP or in .env." -ForegroundColor DarkYellow
  }
}

# --- 6. Deploy Main Shine Application (Full .env Synchronization) -------------
$AppCpu = if ($EnvMap.ContainsKey("APP_CPU") -and $EnvMap["APP_CPU"]) { $EnvMap["APP_CPU"] } else { "2" }
$AppMem = if ($EnvMap.ContainsKey("APP_MEMORY") -and $EnvMap["APP_MEMORY"]) { $EnvMap["APP_MEMORY"] } else { "4Gi" }
$AppTimeout = if ($EnvMap.ContainsKey("APP_TIMEOUT") -and $EnvMap["APP_TIMEOUT"]) { $EnvMap["APP_TIMEOUT"] } else { "300" }
$AppMin = if ($EnvMap.ContainsKey("APP_MIN_INSTANCES") -and $EnvMap["APP_MIN_INSTANCES"]) { $EnvMap["APP_MIN_INSTANCES"] } else { "0" }
$AppMax = if ($EnvMap.ContainsKey("APP_MAX_INSTANCES") -and $EnvMap["APP_MAX_INSTANCES"]) { $EnvMap["APP_MAX_INSTANCES"] } else { "3" }

Write-Host "`n[Step 6/7] Building and Deploying Main Shine App (CPU: $AppCpu, Mem: $AppMem, Timeout: ${AppTimeout}s, Max Instances: $AppMax)..." -ForegroundColor Yellow

if ($DemucsUrl) { $EnvMap["DEMUCS_SERVICE_URL"] = $DemucsUrl }
if ($RenderUrl) { $EnvMap["RENDER_WORKER_URL"] = $RenderUrl }
if ($FlowUrl) { $EnvMap["FLOW_WORKER_URL"] = $FlowUrl }
$EnvMap["GOOGLE_CLOUD_PROJECT"] = $ProjectId
$EnvMap["GOOGLE_CLOUD_LOCATION"] = "global"
$EnvMap["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

if (-not $EnvMap.ContainsKey("DB_PROVIDER") -or -not $EnvMap["DB_PROVIDER"]) {
  $EnvMap["DB_PROVIDER"] = "firestore"
}

# Generate temporary YAML for flawless --env-vars-file injection
$TempEnvFile = Join-Path $RootDir "tmp-cloudrun-env.yaml"
$YamlLines = @()
foreach ($entry in $EnvMap.GetEnumerator()) {
  $k = $entry.Key
  $v = ($entry.Value -replace '"', '\"')
  $YamlLines += "$($k): `"$v`""
}
$YamlLines | Set-Content $TempEnvFile -Encoding UTF8

try {
  # Deploy in Serverless Scale-to-Zero mode from project root directory ($RootDir)
  Push-Location $RootDir
  gcloud run deploy shine-app `
    --source . `
    --region $Region `
    --memory $AppMem `
    --cpu $AppCpu `
    --timeout $AppTimeout `
    --min-instances $AppMin `
    --cpu-throttling `
    --max-instances $AppMax `
    --allow-unauthenticated `
    --env-vars-file "$TempEnvFile" `
    --quiet
  Pop-Location
} finally {
  if (Test-Path $TempEnvFile) {
    Remove-Item $TempEnvFile -Force -ErrorAction SilentlyContinue
  }
}

$ShineAppUrl = (gcloud run services describe shine-app --region $Region --format "value(status.url)").Trim()

# Sync SHINE_APP_URL redirect target to workers
try {
  Write-Host "Updating workers default redirect target to: $ShineAppUrl..." -ForegroundColor Gray
  gcloud run services update demucs-worker --update-env-vars "SHINE_APP_URL=$ShineAppUrl" --region $Region --quiet 2>$null
  gcloud run services update shine-render-worker --update-env-vars "SHINE_APP_URL=$ShineAppUrl" --region $Region --quiet 2>$null
  gcloud run services update shine-flow-worker --update-env-vars "SHINE_APP_URL=$ShineAppUrl" --region $Region --quiet 2>$null
} catch {}

# --- 7. Configure Cloud Scheduler for Periodic Flow Token Sync Heartbeat ------
Write-Host "`n[Step 7/7] Configuring Google Cloud Scheduler for Flow Token Sync..." -ForegroundColor Yellow

$JobName = "shine-flow-token-sync"
$SyncUri = "$ShineAppUrl/api/flow-accounts/sync"
$JobExists = $false

try {
  $null = gcloud scheduler jobs describe $JobName --location $Region 2>&1
  $JobExists = $true
} catch {
  $JobExists = $false
}

if ($JobExists) {
  Write-Host "Updating Cloud Scheduler job: $JobName (Schedule: */5 * * * *)..." -ForegroundColor Gray
  gcloud scheduler jobs update http $JobName --location $Region --schedule "*/5 * * * *" --uri "$SyncUri" --http-method POST --attempt-deadline 180s --quiet
} else {
  Write-Host "Creating Cloud Scheduler job: $JobName (Schedule: */5 * * * *)..." -ForegroundColor Gray
  gcloud scheduler jobs create http $JobName --location $Region --schedule "*/5 * * * *" --uri "$SyncUri" --http-method POST --attempt-deadline 180s --quiet
}
Write-Host "Cloud Scheduler job '$JobName' active -> $SyncUri" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host " Shine Studio Ecosystem Deployed Successfully!" -ForegroundColor Green
Write-Host " Main App URL:   $ShineAppUrl" -ForegroundColor Cyan
Write-Host " Demucs Worker:  $DemucsUrl" -ForegroundColor White
Write-Host " Render Worker:  $RenderUrl" -ForegroundColor White
Write-Host " Flow Sync:      Cloud Scheduler [Every 5 mins, Scale-to-Zero]" -ForegroundColor White
$DbInfo = "$($EnvMap['DB_PROVIDER']) [DB ID: $FirestoreDbId]"
Write-Host " Database:       $DbInfo" -ForegroundColor White
Write-Host " GCS Bucket:     gs://$GcsBucketName" -ForegroundColor White
Write-Host " Pub/Sub Topics: $JobTopic, $StatusTopic" -ForegroundColor White
Write-Host " GCP APIs, IAM:  Verified and Auto-Configured" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green
