param(
  [int]$Port = 3002,
  [switch]$NoBrowser
)

$root = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:$Port/api/health"
$appUrl = "http://127.0.0.1:$Port/ui/app/?local-demo=1#/laundry/dashboard"
$runner = Join-Path $PSScriptRoot 'run-test-workspace.ps1'

function Test-WorkspaceHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $healthUrl
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path (Join-Path $root 'server\node_modules'))) {
  Write-Error "Server dependencies are missing. Run npm install inside $root\server first."
  exit 1
}

if (-not (Test-Path (Join-Path $root 'server\public\app\index.html'))) {
  Write-Error "The web application has not been built. Run npm run build inside $root\webapp first."
  exit 1
}

if (-not (Test-WorkspaceHealth)) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner, '-Port', $Port) -WorkingDirectory (Join-Path $root 'server') -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline -and -not (Test-WorkspaceHealth)) {
    Start-Sleep -Seconds 2
  }
}

if (-not (Test-WorkspaceHealth)) {
  Write-Error "Epic Laundry did not start within two minutes. Check demo-runtime or the server log for errors."
  exit 1
}

Write-Host "Epic Laundry writable sample workspace is running." -ForegroundColor Green
Write-Host "Open: $appUrl"
Write-Host "Sign in: demo / DemoLaundry!2026"
Write-Host "Orders you create here are saved to local sample data and can be reset from the app header."
if (-not $NoBrowser) { Start-Process $appUrl }
