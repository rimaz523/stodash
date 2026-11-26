<#
.SYNOPSIS
    Stops Stodash: closes the windows that start.ps1 opened and frees ports 5080 and 5173.

.EXAMPLE
    .\scripts\stop.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

$pidFile = Join-Path $PSScriptRoot '.pids.json'
$ports   = 5080, 5173
$stopped = 0

# 1. Close the windows start.ps1 opened (and everything running inside them).
if (Test-Path $pidFile) {
    try {
        $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($id in @($pids.api, $pids.web)) {
            if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
                & taskkill.exe /PID $id /T /F 2>&1 | Out-Null
                $stopped++
            }
        }
    } catch {
        Write-Host "Couldn't read $pidFile; falling back to stopping by port." -ForegroundColor Yellow
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Anything still listening on Stodash's ports (e.g. started by hand with dotnet run / npm run dev).
foreach ($port in $ports) {
    # Any live socket whose LOCAL port is ours belongs to the server (clients use random local ports).
    # Don't filter on State=Listen: Vite's [::1] listener can report an empty state.
    $owners = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -gt 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($owner in $owners) {
        $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Stopping $($proc.ProcessName) (PID $owner) on port $port"
            & taskkill.exe /PID $owner /T /F 2>&1 | Out-Null
            $stopped++
        }
    }
}

if ($stopped -eq 0) {
    Write-Host "Stodash wasn't running." -ForegroundColor Yellow
} else {
    Write-Host "Stodash stopped." -ForegroundColor Green
}
