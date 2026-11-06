@echo off
title AIVES - E2E core flow (lecturer sets up an exam, student takes it, lecturer scores it)

echo ===============================================================================
echo            AIVES - E2E CORE FLOW  (a browser window opens and you can watch it)
echo     Phase 0 Lecturer: course material upload + AI question drafts with platform rubric + review
echo     Phase 1 Lecturer: exam session + questions from the bank + students + publish
echo     Phase 2 Student : lobby + microphone check + interview + submit
echo     Phase 3 Lecturer: review, save draft score, confirm final score
echo     Phase 4 Student : read the confirmed report
echo     Phase 5 Admin   : users list (pages, search, role and status filters, total, duplicate email)
echo     Phase 6 Lecturer: exam session lists show every session (Exam sessions, Results and review, Class statistics)
echo ===============================================================================
echo.
echo   This test WRITES to the local database that the backend uses: it creates one new
echo   exam session named "E2E-Core ..." and one attempt for han.hg@aives.edu.vn. It also
echo   uploads one small text material and creates 2 AI question drafts. It deletes nothing.
echo.

:: 1. Docker containers
echo [1/3] Checking Docker containers: PostgreSQL 5432 and Keycloak 8080...
docker ps --format "{{.Names}}" | findstr /i "aives-postgres" > nul
if errorlevel 1 (
    echo [ERROR] Container aives-postgres is not running. Start Docker Desktop and the containers first.
    pause
    exit /b 1
) else (
    echo   - PostgreSQL: ready on port 5432.
)
docker ps --format "{{.Names}}" | findstr /i "keycloak" > nul
if errorlevel 1 (
    echo [ERROR] Keycloak container is not running. Start it first.
    pause
    exit /b 1
) else (
    echo   - Keycloak: ready on port 8080.
)

:: 2. Backend on 5080. The Mock LLM is required: the default AI provider needs a local Ollama.
echo.
echo [2/3] Checking the backend on port 5080...
netstat -ano | findstr /r ":5080.*LISTENING" > nul
if errorlevel 1 (
    echo   - Backend not running. Starting it with the Mock LLM...
    start "AIVES backend" /min cmd /c "cd /d ..\ai-oral-exam-api\src\AiOralExam.Api && set ASPNETCORE_ENVIRONMENT=Development&& set AiProviders__LlmProvider=Mock&& dotnet run --no-launch-profile --urls http://localhost:5080"
    echo   - Waiting for the backend to start...
    :wait_be
    timeout /t 3 /nobreak > nul
    netstat -ano | findstr /r ":5080.*LISTENING" > nul
    if errorlevel 1 goto wait_be
) else (
    echo   - Backend is already running on port 5080.
    echo     It must have been started with AiProviders__LlmProvider=Mock, otherwise the interview step fails.
)

:: 3. Frontend on 5173 in typed-answer mode (a test browser has no speech recognition)
echo.
echo [3/3] Checking the frontend on port 5173...
netstat -ano | findstr /r ":5173.*LISTENING" > nul
if errorlevel 1 (
    echo   - Frontend not running. Starting Vite with typed answers...
    start "AIVES frontend" /min cmd /c "set VITE_ANSWER_INPUT=text&& npm run dev -- --port 5173 --strictPort"
    echo   - Waiting for Vite to start...
    :wait_fe
    timeout /t 2 /nobreak > nul
    netstat -ano | findstr /r ":5173.*LISTENING" > nul
    if errorlevel 1 goto wait_fe
) else (
    echo   - Frontend is already running on port 5173.
    echo     It must have been started with VITE_ANSWER_INPUT=text. If the test stops at the interview, close it and run this file again.
)

echo.
echo ===============================================================================
echo   Starting the visible browser test. Do not click inside the test window.
echo ===============================================================================
echo.

if not defined E2E_PASSWORD set /p E2E_PASSWORD=Password of the seeded test users: 
set E2E_HEADED=1
set E2E_SLOWMO=450
node tests/e2e-core.mjs all

echo.
echo ===============================================================================
echo   TEST RUN FINISHED. PASS / FAIL lines are listed above.
echo   Screenshots of each phase are in %TEMP%\aives-e2e
echo ===============================================================================
echo.
pause
