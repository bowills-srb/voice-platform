@echo off
REM Voice Platform Development Startup Script
REM Opens all services in Windows Terminal tabs

set PROJECT_PATH=C:\Users\bowil\Documents\WebDev\Portfolio Builders\voice-platform-v6\voice-platform

echo Starting Voice Platform services...

wt -w 0 ^
    new-tab -d "%PROJECT_PATH%" --title "Docker" cmd /k "docker-compose up postgres redis" ^
    ; new-tab -d "%PROJECT_PATH%" --title "API" cmd /k "timeout /t 5 && pnpm --filter @voice-platform/api dev" ^
    ; new-tab -d "%PROJECT_PATH%" --title "Voice Engine" cmd /k "timeout /t 7 && pnpm --filter @voice-platform/voice-engine dev" ^
    ; new-tab -d "%PROJECT_PATH%" --title "Dashboard" cmd /k "timeout /t 7 && pnpm --filter @voice-platform/dashboard dev"

echo.
echo Services starting in Windows Terminal tabs:
echo - Docker (Postgres + Redis)
echo - API Server (port 4000)
echo - Voice Engine (port 4001)  
echo - Dashboard (port 3000)
echo.
echo Open http://localhost:3000 in your browser
