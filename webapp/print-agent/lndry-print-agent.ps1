# LNDRY Print Agent
# Lets the LNDRY POS website print raw label commands (TSPL) through a Windows printer driver that is
# already installed - e.g. a TSC TTP-244 Pro / TE244 - without removing the driver.
#
#  * Listens on 127.0.0.1 only (never on the network).
#  * Answers only requests that come from the LNDRY website (see $AllowedOrigins).
#  * Needs no administrator rights and no extra software: it is plain Windows PowerShell 5.1.
#
# Endpoints:  GET /status   GET /printers   POST /print?printer=<queue name>&job=<label>   (body = raw bytes)

param(
    [int]$Port = 9271,
    [string[]]$ExtraOrigin = @()
)

$ErrorActionPreference = 'Stop'
$Version = '1.0.0'
$AllowedOrigins = @('https://pos.lndry.in', 'http://localhost:5199', 'http://127.0.0.1:5199') + $ExtraOrigin
$MaxBody = 16MB
$LogDir = Join-Path $env:LOCALAPPDATA 'LndryPrintAgent'
$LogFile = Join-Path $LogDir 'agent.log'

function Write-Log([string]$Message) {
    try {
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
        if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 512KB)) { Remove-Item $LogFile -Force }
        Add-Content -Path $LogFile -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message)
    } catch { }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class LndryRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int StartDocPrinter(IntPtr handle, int level, ref DOCINFO info);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr handle, byte[] buffer, int count, out int written);

    // Returns null on success, otherwise a message.
    public static string Send(string printer, byte[] data, string docName)
    {
        IntPtr handle;
        if (!OpenPrinter(printer, out handle, IntPtr.Zero))
            return "Windows could not open the printer \"" + printer + "\" (error " + Marshal.GetLastWin32Error() + ").";
        try
        {
            DOCINFO info = new DOCINFO();
            info.pDocName = docName;
            info.pOutputFile = null;
            info.pDataType = "RAW";
            if (StartDocPrinter(handle, 1, ref info) == 0)
                return "Windows refused to start the print job (error " + Marshal.GetLastWin32Error() + ").";
            try
            {
                if (!StartPagePrinter(handle))
                    return "Windows refused to start the page (error " + Marshal.GetLastWin32Error() + ").";
                try
                {
                    int offset = 0;
                    while (offset < data.Length)
                    {
                        int chunk = Math.Min(32768, data.Length - offset);
                        byte[] part = new byte[chunk];
                        Array.Copy(data, offset, part, 0, chunk);
                        int written;
                        if (!WritePrinter(handle, part, chunk, out written) || written <= 0)
                            return "Sending data to the printer failed (error " + Marshal.GetLastWin32Error() + ").";
                        offset += written;
                    }
                }
                finally { EndPagePrinter(handle); }
            }
            finally { EndDocPrinter(handle); }
        }
        finally { ClosePrinter(handle); }
        return null;
    }
}
"@

function Get-UsbLabelDevices {
    $found = @()
    try {
        $devices = @(Get-PnpDevice -PresentOnly -ErrorAction Stop |
            Where-Object { $_.InstanceId -like 'USB\VID_1203&PID_*' -and $_.InstanceId -notmatch '&MI_' })
        foreach ($device in $devices) {
            $parts = $device.InstanceId -split '\\'
            $serial = ''
            if ($parts.Count -ge 3 -and $parts[2] -notmatch '&') { $serial = $parts[2] }
            $productId = ''
            if ($device.InstanceId -match 'PID_([0-9A-Fa-f]{4})') { $productId = $Matches[1].ToUpper() }
            $found += [ordered]@{
                name   = [string]$device.FriendlyName
                vid    = '1203'
                pid    = $productId
                serial = $serial
                status = [string]$device.Status
            }
        }
    } catch { Write-Log ('USB lookup failed: ' + $_.Exception.Message) }
    return $found
}

function Get-InstalledPrinters {
    $list = @()
    foreach ($printer in @(Get-CimInstance -ClassName Win32_Printer)) {
        $name = [string]$printer.Name
        $driver = [string]$printer.DriverName
        $list += [ordered]@{
            name          = $name
            driver        = $driver
            port          = [string]$printer.PortName
            isDefault     = [bool]$printer.Default
            offline       = [bool]$printer.WorkOffline
            state         = [int]$printer.PrinterStatus
            detectedError = [int]$printer.DetectedErrorState
            likelyTsc     = [bool](($name -match 'TSC|TTP|TDP|TE\d{3}|TC\d{3}') -or ($driver -match 'TSC|TTP|TDP|TE\d{3}|TC\d{3}'))
            usb           = [bool]([string]$printer.PortName -match '^USB')
        }
    }
    return $list
}

function Send-Json($Context, [int]$Status, $Payload) {
    $json = ConvertTo-Json -InputObject $Payload -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}

function Handle-Request($Context) {
    $request = $Context.Request
    $response = $Context.Response

    # DNS-rebinding guard: only literal loopback host names are served.
    $hostHeader = [string]$request.Headers['Host']
    if ($hostHeader -notmatch '^(127\.0\.0\.1|localhost)(:\d+)?$') {
        Send-Json $Context 403 @{ ok = $false; error = 'Unexpected host name.' }
        return
    }

    $origin = [string]$request.Headers['Origin']
    if ($origin) {
        if ($AllowedOrigins -notcontains $origin) {
            Write-Log ('Rejected origin ' + $origin)
            Send-Json $Context 403 @{ ok = $false; error = 'This website is not allowed to use the print agent.' }
            return
        }
        $response.Headers['Access-Control-Allow-Origin'] = $origin
        $response.Headers['Vary'] = 'Origin'
        $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
        $response.Headers['Access-Control-Allow-Private-Network'] = 'true'
        $response.Headers['Access-Control-Max-Age'] = '600'
    }

    if ($request.HttpMethod -eq 'OPTIONS') {
        $response.StatusCode = 204
        $response.OutputStream.Close()
        return
    }

    $path = $request.Url.AbsolutePath.TrimEnd('/')
    if ($path -eq '') { $path = '/status' }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/status') {
        Send-Json $Context 200 @{ ok = $true; agent = 'lndry-print-agent'; version = $Version; machine = $env:COMPUTERNAME }
        return
    }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/printers') {
        Send-Json $Context 200 @{
            ok         = $true
            printers   = [object[]]@(Get-InstalledPrinters)
            usbDevices = [object[]]@(Get-UsbLabelDevices)
        }
        return
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/print') {
        $queue = [string]$request.QueryString['printer']
        $job = [string]$request.QueryString['job']
        if (-not $job) { $job = 'LNDRY labels' }
        if (-not $queue) {
            Send-Json $Context 400 @{ ok = $false; error = 'No printer was named.' }
            return
        }
        if ($request.ContentLength64 -gt $MaxBody) {
            Send-Json $Context 413 @{ ok = $false; error = 'That print job is too large.' }
            return
        }
        $installed = @(Get-InstalledPrinters | ForEach-Object { $_.name })
        if ($installed -notcontains $queue) {
            Send-Json $Context 404 @{ ok = $false; error = ('Windows has no printer called "' + $queue + '".') }
            return
        }
        $memory = New-Object System.IO.MemoryStream
        $request.InputStream.CopyTo($memory)
        $bytes = $memory.ToArray()
        if ($bytes.Length -eq 0) {
            Send-Json $Context 400 @{ ok = $false; error = 'The print job was empty.' }
            return
        }
        $failure = [LndryRawPrinter]::Send($queue, $bytes, $job)
        if ($failure) {
            Write-Log ('Print failed on ' + $queue + ': ' + $failure)
            Send-Json $Context 502 @{ ok = $false; error = $failure }
            return
        }
        Write-Log ('Printed ' + $bytes.Length + ' bytes to ' + $queue + ' (' + $job + ')')
        Send-Json $Context 200 @{ ok = $true; bytes = $bytes.Length }
        return
    }

    Send-Json $Context 404 @{ ok = $false; error = 'Unknown request.' }
}

function Start-Listener([string[]]$Hosts) {
    $candidate = New-Object System.Net.HttpListener
    foreach ($name in $Hosts) { $candidate.Prefixes.Add("http://${name}:$Port/") }
    $candidate.Start()
    return $candidate
}

$listener = $null
try {
    # Both spellings of loopback. Some Windows setups only allow "localhost" without administrator rights.
    $listener = Start-Listener @('localhost', '127.0.0.1')
} catch {
    Write-Log ('Both prefixes failed (' + $_.Exception.Message + ') - trying localhost only')
    try {
        $listener = Start-Listener @('localhost')
    } catch {
        # Already running (a second copy cannot bind the port) - that is fine.
        Write-Log ('Not started: ' + $_.Exception.Message)
        exit 0
    }
}
Write-Log ('LNDRY Print Agent ' + $Version + ' listening on 127.0.0.1:' + $Port)

while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
        Handle-Request $context
    } catch {
        Write-Log ('Request failed: ' + $_.Exception.Message)
        try { Send-Json $context 500 @{ ok = $false; error = $_.Exception.Message } } catch { }
    }
}
