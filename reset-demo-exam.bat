@echo off
title AIVES - demo exam: create it if missing, then reset it
rem Run this before every demo or test of the AI viva.
rem   1. If there is no open "English AI viva demo" session, it CREATES one (2 simple questions, student han.hg).
rem      If one exists, it creates nothing.
rem   2. It RESETS the session: deletes the student's attempt (answers, dialogue, AI scores, lecturer review)
rem      and sets the student back to "Registered", so the exam can be taken again.
rem Needs: Docker (container aives-postgres), Keycloak, the backend on 5080 and the frontend on 5173 running.
rem Writes to the local Docker database only. Close the exam tab in the browser first, press F5 on "My exams" afterwards.

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

rem The database container is the one that publishes port 5432 (its name differs between machines:
rem "aives-postgres", "postgres", ...). To force a name, set AIVES_PG before running this file.
if not defined AIVES_PG for /f "delims=" %%i in ('docker ps --filter "publish=5432" --format "{{.Names}}" 2^>nul') do if not defined AIVES_PG set AIVES_PG=%%i
if not defined AIVES_PG (
    echo [ERROR] No running container publishes port 5432. Start Docker Desktop and the Postgres container first.
    pause
    exit /b 1
)
echo Database container: %AIVES_PG%
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
echo [1/2] Checking the demo exam...
node tests\demo-exam.mjs
if errorlevel 1 (
    echo.
    echo [ERROR] Could not check or create the demo exam. See the message above.
    pause
    exit /b 1
)

echo.
echo [2/2] Resetting the demo exam...
set SQL=%TEMP%\aives-reset-demo.sql
> "%SQL%" echo begin;
>> "%SQL%" echo create temp table t_att on commit drop as select a.id from interview_attempts a join participants p on p.id=a.participant_id join exam_sessions s on s.id=p.exam_session_id where s.title like 'English AI viva demo%%' and s.status='Published';
>> "%SQL%" echo delete from criterion_scores where question_response_id in (select r.id from question_responses r where r.attempt_id in (select id from t_att));
>> "%SQL%" echo delete from interview_turns where question_response_id in (select r.id from question_responses r where r.attempt_id in (select id from t_att));
>> "%SQL%" echo delete from score_reviews where attempt_id in (select id from t_att);
>> "%SQL%" echo delete from question_responses where attempt_id in (select id from t_att);
>> "%SQL%" echo delete from interview_attempts where id in (select id from t_att);
>> "%SQL%" echo update participants set status='Registered' where exam_session_id in (select id from exam_sessions where title like 'English AI viva demo%%' and status='Published');
>> "%SQL%" echo select s.title, s.status as session, s.end_time, p.status as student, (select count(*) from interview_attempts a where a.participant_id=p.id) as attempts from exam_sessions s join participants p on p.exam_session_id=s.id where s.title like 'English AI viva demo%%' and s.status='Published';
>> "%SQL%" echo commit;
docker exec -i %AIVES_PG% psql -U aives -d aives -v ON_ERROR_STOP=1 < "%SQL%"
if errorlevel 1 (
    echo.
    echo [ERROR] The reset failed. Nothing was changed.
) else (
    echo.
    echo Done. The student han.hg can take the exam again: reload "My exams" in the browser.
)
del "%SQL%" > nul 2>&1
echo.
pause
