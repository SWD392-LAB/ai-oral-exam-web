@echo off
title AIVES - Playwright E2E Visual Automation Test Phase 3

echo ===============================================================================
echo            AIVES - E2E FULL SYSTEM VISUAL AUTOMATION TEST PHASE 3
echo     Course Materials -- AI Question Gen -- Viva Exam -- Lecturer Review
echo ===============================================================================
echo.

:: 1. Check Docker Containers
echo [1/3] Checking Docker containers: PostgreSQL 5432 and Keycloak 8080...
docker ps --format "{{.Names}}" | findstr /i "aives-postgres" > nul
if errorlevel 1 (
    echo [WARNING] Container aives-postgres is not running. Please start Docker Desktop.
) else (
    echo   - PostgreSQL: Ready on port 5432.
)

docker ps --format "{{.Names}}" | findstr /i "keycloak" > nul
if errorlevel 1 (
    echo [WARNING] Container Keycloak is not running. Please ensure Keycloak is up.
) else (
    echo   - Keycloak OIDC: Ready on port 8080.
)

:: 2. Check Backend API port 5080
echo.
echo [2/3] Checking Backend API on port 5080...
netstat -ano | findstr /r ":5080.*LISTENING" > nul
if errorlevel 1 (
    echo   - Backend not running. Starting .NET API on port 5080...
    start /b cmd /c "cd /d ..\ai-oral-exam-api\src\AiOralExam.Api && set ASPNETCORE_ENVIRONMENT=Development && set AiProviders__LlmProvider=Mock && dotnet run --no-launch-profile --urls http://localhost:5080"
    timeout /t 6 /nobreak > nul
) else (
    echo   - Backend API: Active on port 5080.
)

:: 3. Check Frontend port 5173
echo.
echo [3/3] Checking Frontend Vite server on port 5173...
netstat -ano | findstr /r ":5173.*LISTENING" > nul
if errorlevel 1 (
    echo   - Frontend not running. Starting Vite dev server...
    start /b cmd /c "npm run dev"
    timeout /t 4 /nobreak > nul
) else (
    echo   - Frontend: Active on port 5173.
)

echo.
echo ===============================================================================
echo   LAUNCHING CHROME BROWSER FOR VISUAL E2E TEST:
echo     Part 1: Lecturer flow - Course Materials, AI Question Gen, Rubrics, Review
echo     Part 2: Student flow - Exam Lobby, Real Viva Interview, Report View
echo ===============================================================================
echo.

node tests/e2e-visual-demo.mjs

echo.
echo ===============================================================================
echo   VISUAL TEST RUN COMPLETED.
echo ===============================================================================
echo.
pause
