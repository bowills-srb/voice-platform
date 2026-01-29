# Voice Platform Development Startup Script
# Opens all services in Windows Terminal tabs

$projectPath = "C:\Users\bowil\Documents\WebDev\Portfolio Builders\voice-platform-v6\voice-platform"

# Start Windows Terminal with multiple tabs
wt -w 0 `
    new-tab -d "$projectPath" --title "Docker" powershell -NoExit -Command "docker-compose up postgres redis" `; `
    new-tab -d "$projectPath" --title "API" powershell -NoExit -Command "Start-Sleep -Seconds 5; pnpm --filter @voice-platform/api dev" `; `
    new-tab -d "$projectPath" --title "Voice Engine" powershell -NoExit -Command "Start-Sleep -Seconds 7; pnpm --filter @voice-platform/voice-engine dev" `; `
    new-tab -d "$projectPath" --title "Dashboard" powershell -NoExit -Command "Start-Sleep -Seconds 7; pnpm --filter @voice-platform/dashboard dev"

Write-Host "Starting Voice Platform services..."
Write-Host "- Docker (Postgres + Redis)"
Write-Host "- API Server (port 4000)"
Write-Host "- Voice Engine (port 4001)"
Write-Host "- Dashboard (port 3000)"
Write-Host ""
Write-Host "Open http://localhost:3000 in your browser"
