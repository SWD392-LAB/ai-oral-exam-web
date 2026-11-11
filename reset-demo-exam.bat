@echo off
title AIVES - reset the demo exam
rem Run this before every demo or test of the AI viva. It gives student han.hg a fresh "English AI viva demo":
rem   1. closes every open "English AI viva demo" session, with whatever was taken in it (nothing is deleted);
rem   2. creates a new one with the same 2 simple questions and the student registered.
rem It only uses the app itself (sign-in page, API, lecturer screens), so it works whatever database the
rem backend uses and needs no Docker command. The closed sessions stay in the student's "Finished" list.
rem Needs: Keycloak (8080), the backend (5080) and the frontend (5173) running, and Node.js.
rem After it finishes, press F5 on "My exams" in the browser.

cd /d "%~dp0"

rem Tools this file needs on a fresh machine: Node.js, the project packages and the Playwright browser.
where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Install it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)
if not exist "node_modules\playwright" (
    echo Installing the project packages ^(first run only^)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See the message above.
        pause
        exit /b 1
    )
)
rem Does nothing when the browser is already there; downloads it once on a new machine.
call npx playwright install chromium > nul 2>&1
if errorlevel 1 echo [WARNING] Could not check or install the Playwright browser. If the next step fails, run: npx playwright install chromium

netstat -ano | findstr /r ":5080.*LISTENING" > nul
if errorlevel 1 (
    echo [ERROR] The backend is not running on port 5080. Start it first.
    pause
    exit /b 1
)
netstat -ano | findstr /r ":5173.*LISTENING" > nul
if errorlevel 1 (
    echo [ERROR] The frontend is not running on port 5173. Start it first with: npm run dev
    pause
    exit /b 1
)

if not defined E2E_PASSWORD set /p E2E_PASSWORD=Password of the seeded test users:

echo.
echo Resetting the demo exam: closing the old one and creating a new one...
node tests\demo-exam.mjs --fresh
if errorlevel 1 (
    echo.
    echo [ERROR] The reset failed. See the message above.
) else (
    echo.
    echo Done. The student han.hg has a fresh exam: reload "My exams" in the browser.
)
echo.
pause
