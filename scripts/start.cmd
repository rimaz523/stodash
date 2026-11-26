@echo off
rem Double-click to start Stodash. Runs scripts\start.ps1 without changing your PowerShell settings.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
