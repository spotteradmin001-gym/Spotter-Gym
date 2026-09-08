# Spotter engine launcher (Phase 6 Batch 6.2; promotions added in CR-10 F.6).
#
# Starts the local Docker stack (n8n + WAHA), waits for WAHA to answer, then
# runs the reminder sender and the promotions sender once. Pass -Loop to keep
# running every N minutes.
#
#   powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1
#   powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1 -Loop -EveryMinutes 15

param(
  [switch]$Loop,
  [int]$EveryMinutes = 15
)

$ErrorActionPreference = "Stop"
$engineDir = $PSScriptRoot
$repoDir = Split-Path $engineDir -Parent
$stackDir = Split-Path $repoDir -Parent   # E:\whatsapp-gym-stack

Write-Host "Starting Docker stack in $stackDir ..."
Push-Location $stackDir
try {
  docker compose up -d
} finally {
  Pop-Location
}

$wahaUrl = if ($env:WAHA_URL) { $env:WAHA_URL } else { "http://localhost:3000" }
Write-Host "Waiting for WAHA at $wahaUrl ..."
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$wahaUrl/api/sessions" `
      -Headers @{ "X-Api-Key" = $env:WAHA_API_KEY } | Out-Null
    Write-Host "WAHA is up."
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

function Invoke-Sender {
  Push-Location $repoDir
  try {
    node engine/send-reminders.mjs
    node engine/send-promotions.mjs
  } finally {
    Pop-Location
  }
}

Invoke-Sender
while ($Loop) {
  Write-Host "Sleeping $EveryMinutes min ..."
  Start-Sleep -Seconds ($EveryMinutes * 60)
  Invoke-Sender
}
