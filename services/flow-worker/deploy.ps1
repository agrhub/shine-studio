# ==============================================================================
# Standalone Google Cloud Run Deployment for Shine Flow AI Worker (PowerShell)
# ==============================================================================
param(
  [string]$Region = "",
  [string]$ServiceName = "shine-flow-worker"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$RootDir = (Resolve-Path "$ScriptDir\..\..").Path

# Load .env from project root if available
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
      if ($key) { $EnvMap[$key] = $val }
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

$Memory = if ($EnvMap.ContainsKey("FLOW_WORKER_MEMORY")) { $EnvMap["FLOW_WORKER_MEMORY"] } else { "4Gi" }
$Cpu = if ($EnvMap.ContainsKey("FLOW_WORKER_CPU")) { $EnvMap["FLOW_WORKER_CPU"] } else { "2" }
$Timeout = if ($EnvMap.ContainsKey("FLOW_WORKER_TIMEOUT")) { $EnvMap["FLOW_WORKER_TIMEOUT"] } else { "600" }
$MinInstances = if ($EnvMap.ContainsKey("FLOW_WORKER_MIN_INSTANCES")) { $EnvMap["FLOW_WORKER_MIN_INSTANCES"] } else { "0" }
$MaxInstances = if ($EnvMap.ContainsKey("FLOW_WORKER_MAX_INSTANCES")) { $EnvMap["FLOW_WORKER_MAX_INSTANCES"] } else { "3" }

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " 🚀 Deploying Shine Flow Worker to Google Cloud Run" -ForegroundColor Cyan
Write-Host " Service:       $ServiceName" -ForegroundColor Yellow
Write-Host " Region:        $Region" -ForegroundColor Yellow
Write-Host " Memory / CPU:  $Memory / $Cpu CPU" -ForegroundColor White
Write-Host " Timeout:       $Timeout seconds" -ForegroundColor White
Write-Host " Min / Max:     $MinInstances / $MaxInstances instances" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Cyan

Push-Location $ScriptDir
try {
  gcloud run deploy "$ServiceName" `
    --source . `
    --region "$Region" `
    --memory "$Memory" `
    --cpu "$Cpu" `
    --timeout "$Timeout" `
    --min-instances "$MinInstances" `
    --max-instances "$MaxInstances" `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$ProjectId,GCP_REGION=$Region,NODE_ENV=production" `
    --allow-unauthenticated `
    --quiet
} finally {
  Pop-Location
}

$Url = (gcloud run services describe "$ServiceName" --region "$Region" --format "value(status.url)" 2>$null).Trim()
$WsUrl = $Url -replace "^https://", "wss://"

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "✅ Shine Flow AI Worker Deployment Successful!" -ForegroundColor Green
Write-Host "Service URL:       $Url" -ForegroundColor White
Write-Host "Extension Config:  $WsUrl/ws" -ForegroundColor White
Write-Host "Dashboard UI:      $Url" -ForegroundColor White
Write-Host "`nAdd this line to your Shine Server .env file:" -ForegroundColor Yellow
Write-Host "FLOW_WORKER_URL=$Url" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
