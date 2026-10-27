// Builds the one-file Windows installer for the LNDRY Print Agent.
//   print-agent/lndry-print-agent.ps1  (source of truth)
//   -> public/print-agent/Install-LndryPrintAgent.cmd   (double-click installer; the agent is embedded in it)
//   -> public/print-agent/lndry-print-agent.ps1         (plain copy, for inspection)
// The website serves both from /print-agent/. Run by `npm run build:web`; safe to run by hand.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const agent = readFileSync(join(root, 'print-agent', 'lndry-print-agent.ps1'), 'utf8').replace(/\r\n/g, '\n')
if (/^'@/m.test(agent)) throw new Error("The agent script must not contain a line starting with '@ (it is embedded in a PowerShell here-string).")
if (/[^\x00-\x7f]/.test(agent)) throw new Error('The agent script must be plain ASCII (Windows PowerShell 5.1 reads BOM-less files as ANSI).')

const installer = `$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'LndryPrintAgent'
$agentPath = Join-Path $dir 'lndry-print-agent.ps1'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'LNDRY Print Agent.lnk'

function Stop-Agent {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -like '*lndry-print-agent.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($env:LNDRY_ACTION -eq 'uninstall') {
    Stop-Agent
    Remove-Item $shortcut -Force -ErrorAction SilentlyContinue
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'LNDRY Print Agent has been removed from this computer.'
    return
}

$agentCode = @'
${agent}
'@

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Stop-Agent
[IO.File]::WriteAllText($agentPath, $agentCode, (New-Object Text.UTF8Encoding($false)))

$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$link.TargetPath = 'powershell.exe'
$link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $agentPath + '"'
$link.WindowStyle = 7
$link.Save()

Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $agentPath + '"'))
Start-Sleep -Seconds 3

try {
    $status = Invoke-RestMethod -Uri 'http://localhost:9271/status' -TimeoutSec 5
    Write-Host ''
    Write-Host ('LNDRY Print Agent ' + $status.version + ' is running on this computer.') -ForegroundColor Green
    Write-Host 'It starts by itself whenever you sign in to Windows.'
    $found = Invoke-RestMethod -Uri 'http://localhost:9271/printers' -TimeoutSec 10
    Write-Host ''
    Write-Host 'Printers Windows has:'
    foreach ($printer in $found.printers) {
        $mark = ''
        if ($printer.likelyTsc) { $mark = '   <-- label printer' }
        Write-Host ('  - ' + $printer.name + '  [' + $printer.port + ']' + $mark)
    }
    Write-Host ''
    Write-Host 'Now open the POS website -> Print centre (or Settings -> Tags and printers) -> Connect printer.'
} catch {
    Write-Host ''
    Write-Host 'The agent was installed but did not answer yet.' -ForegroundColor Yellow
    Write-Host ('Details: ' + $_.Exception.Message)
    Write-Host ('Log file: ' + (Join-Path $dir 'agent.log'))
}
`

const marker = '#__' + 'PS__'
const wrapper = [
  '@echo off',
  'setlocal',
  'title LNDRY Print Agent installer',
  'set "LNDRY_SELF=%~f0"',
  'set "LNDRY_ACTION=%~1"',
  'echo.',
  'echo LNDRY Print Agent - lets the POS website print labels through your installed printer driver.',
  'echo.',
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create(([IO.File]::ReadAllText($env:LNDRY_SELF) -split ('#__'+'PS__'),2)[1]))"`,
  'echo.',
  'pause',
  'exit /b',
  marker,
  installer.replace(/\r\n/g, '\n'),
].join('\n')

const out = join(root, 'public', 'print-agent')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'Install-LndryPrintAgent.cmd'), wrapper.replace(/\n/g, '\r\n'), 'ascii')
writeFileSync(join(out, 'lndry-print-agent.ps1'), agent.replace(/\n/g, '\r\n'), 'ascii')
console.log('print agent installer written to public/print-agent/')
