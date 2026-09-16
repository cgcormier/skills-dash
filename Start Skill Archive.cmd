@echo off
cd /d "%~dp0"
if exist "src-tauri\target\release\skill-archive.exe" (
  start "" "src-tauri\target\release\skill-archive.exe"
) else (
  call npm run desktop
)
