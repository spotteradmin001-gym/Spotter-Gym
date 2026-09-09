@echo off
REM Spotter Engine launcher (CR-12). Double-click this, or pin it to the taskbar.
REM Runs the WinForms GUI (Spotter-Engine.ps1) with the flags it needs; the
REM PowerShell console itself stays hidden.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0Spotter-Engine.ps1"
