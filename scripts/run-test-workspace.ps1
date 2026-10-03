param(
  [int]$Port = 3002
)

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root 'server'
$runtime = Join-Path $root 'demo-runtime'
$env:PORT = "$Port"
$env:EPIC_WORKSPACE_MODE = 'demo'
$env:EPIC_DB_FILE = Join-Path $runtime 'local-demo.sqlite'
$env:EPIC_LEGACY_JSON_FILE = Join-Path $runtime 'local-demo-legacy.json'

Set-Location $server
& npm.cmd run start
exit $LASTEXITCODE
