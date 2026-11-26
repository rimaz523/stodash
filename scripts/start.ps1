<#
.SYNOPSIS
    Starts Stodash: the .NET API (port 5080) and the React web app (port 5173), each in its own window,
    then opens the app in your browser.

.DESCRIPTION
    - Checks that the .NET 10 SDK and Node.js 20+ are installed.
    - Runs "npm install" when frontend packages are missing or out of date.
    - Refuses to start if the ports are taken by something else (run stop.ps1 first).
    - Waits until both servers answer before opening the browser.
    Stop everything with scripts\stop.ps1 (or close the two windows).

.PARAMETER NoBrowser
    Start the servers but don't open the browser.

.EXAMPLE
    .\scripts\start.ps1
.EXAMPLE
    .\scripts\start.ps1 -NoBrowser
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root       = Split-Path -Parent $PSScriptRoot
$apiProject = Join-Path $root 'backend\Stodash.Api'
$frontend   = Join-Path $root 'frontend'
$pidFile    = Join-Path $PSScriptRoot '.pids.json'
$apiPort    = 5080
$webPort    = 5173
$apiHealth  = "http://localhost:$apiPort/api/health"
$webUrl     = "http://localhost:$webPort"

function Write-Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok([string]$message)   { Write-Host "    $message" -ForegroundColor Green }
function Stop-WithError([string]$message) {
    Write-Host ""
    Write-Host "ERROR: $message" -ForegroundColor Red
    exit 1
}

function Test-Command([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Test-PortListening([int]$port) {
    # Try to connect rather than reading the socket table: Vite listens on [::1] only, and on some machines
    # that socket doesn't report the Listen state.
    foreach ($address in '127.0.0.1', '::1') {
        $family = if ($address.Contains(':')) { 'InterNetworkV6' } else { 'InterNetwork' }
        $client = New-Object System.Net.Sockets.TcpClient([System.Net.Sockets.AddressFamily]$family)
        try {
            if ($client.ConnectAsync($address, $port).Wait(500)) { return $true }
        } catch {
            # refused: nothing on this address
        } finally {
            $client.Dispose()
        }
    }
    return $false
}

function Wait-ForUrl([string]$url, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    return $false
}

Write-Host ""
Write-Host "Stodash" -ForegroundColor White
Write-Host ""

# --- 1. Prerequisites -------------------------------------------------------------------------
Write-Step "Checking prerequisites"

if (-not (Test-Command 'dotnet')) {
    Stop-WithError ".NET SDK not found. Install .NET 10 from https://dotnet.microsoft.com/download/dotnet/10.0 and open a new terminal."
}
$sdks = & dotnet --list-sdks
if (-not ($sdks | Where-Object { $_ -match '^10\.' })) {
    Stop-WithError ".NET 10 SDK not found (installed: $($sdks -join '; ')). Install it from https://dotnet.microsoft.com/download/dotnet/10.0"
}
Write-Ok ".NET 10 SDK found"

if (-not (Test-Command 'node')) {
    Stop-WithError "Node.js not found. Install Node.js 20 or newer from https://nodejs.org and open a new terminal."
}
$nodeVersion = (& node --version).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Stop-WithError "Node.js $nodeVersion is too old. Install Node.js 20 or newer from https://nodejs.org"
}
Write-Ok "Node.js $nodeVersion found"

# --- 2. Already running? ----------------------------------------------------------------------
$apiBusy = Test-PortListening $apiPort
$webBusy = Test-PortListening $webPort

if ($apiBusy -and $webBusy -and (Wait-ForUrl $apiHealth 3) -and (Wait-ForUrl $webUrl 3)) {
    Write-Step "Stodash is already running"
    Write-Ok $webUrl
    if (-not $NoBrowser) { Start-Process $webUrl }
    exit 0
}
if ($apiBusy) { Stop-WithError "Port $apiPort is already in use. Run .\scripts\stop.ps1, or close whatever is using it." }
if ($webBusy) { Stop-WithError "Port $webPort is already in use. Run .\scripts\stop.ps1, or close whatever is using it." }

# --- 3. Frontend packages ---------------------------------------------------------------------
$installedMarker = Join-Path $frontend 'node_modules\.package-lock.json'
$lockFile        = Join-Path $frontend 'package-lock.json'
$needsInstall = -not (Test-Path $installedMarker)
if (-not $needsInstall -and (Test-Path $lockFile)) {
    $needsInstall = (Get-Item $lockFile).LastWriteTime -gt (Get-Item $installedMarker).LastWriteTime
}
if ($needsInstall) {
    Write-Step "Installing frontend packages (npm install)"
    Push-Location $frontend
    try {
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Stop-WithError "npm install failed. See the output above." }
    } finally {
        Pop-Location
    }
    Write-Ok "Packages installed"
}

# --- 4. Start both servers in their own windows -----------------------------------------------
# Prefer PowerShell 7 if installed; fall back to Windows PowerShell.
$shell = if (Test-Command 'pwsh') { 'pwsh' } else { 'powershell' }

Write-Step "Starting the API on port $apiPort (first start compiles, so it can take a minute)"
$apiCommand = "`$Host.UI.RawUI.WindowTitle = 'Stodash API (:$apiPort)'; dotnet run --project '$apiProject'"
$apiWindow = Start-Process -FilePath $shell -ArgumentList '-NoExit', '-NoProfile', '-Command', $apiCommand `
    -WorkingDirectory $root -PassThru

Write-Step "Starting the web app on port $webPort"
$webCommand = "`$Host.UI.RawUI.WindowTitle = 'Stodash Web (:$webPort)'; npm run dev"
$webWindow = Start-Process -FilePath $shell -ArgumentList '-NoExit', '-NoProfile', '-Command', $webCommand `
    -WorkingDirectory $frontend -PassThru

# Remember the windows so stop.ps1 can close them.
@{ api = $apiWindow.Id; web = $webWindow.Id } | ConvertTo-Json | Set-Content -Path $pidFile -Encoding ASCII

# --- 5. Wait until both answer ----------------------------------------------------------------
Write-Step "Waiting for the servers"
if (Wait-ForUrl $apiHealth 120) {
    Write-Ok "API is up:      http://localhost:$apiPort"
} else {
    Stop-WithError "The API didn't start within 2 minutes. Check the 'Stodash API' window for errors."
}
if (Wait-ForUrl $webUrl 60) {
    Write-Ok "Web app is up:  $webUrl"
} else {
    Stop-WithError "The web app didn't start within 1 minute. Check the 'Stodash Web' window for errors."
}

if (-not $NoBrowser) { Start-Process $webUrl }

Write-Host ""
Write-Host "Stodash is running at $webUrl" -ForegroundColor Green
Write-Host "Server logs are in the 'Stodash API' and 'Stodash Web' windows."
Write-Host "To stop: .\scripts\stop.ps1"
Write-Host ""
