@echo off
title Pandora Dee Desktop
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing. This takes a minute.
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 4 >nul & start http://localhost:15693"
call npm run dev
pause
