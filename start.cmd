@echo off
REM Double-click to run AI Visual Tutor locally on Windows.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing packages, first run only...
  call npm install || (echo npm install failed. & pause & exit /b 1)
)
echo Starting the tutor at http://localhost:3000 ...
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
pause
