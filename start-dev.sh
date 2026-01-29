#!/bin/bash
osascript -e '
tell application "Terminal"
    activate
    
    -- First tab - Docker
    do script "cd ~/Projects/voice-platform && docker-compose up -d postgres redis && echo Docker started"
    
    delay 1
    
    -- Second tab - API
    tell application "System Events" to keystroke "t" using command down
    delay 0.3
    do script "cd ~/Projects/voice-platform/apps/api && npm run dev" in front window
    
    -- Third tab - Dashboard  
    tell application "System Events" to keystroke "t" using command down
    delay 0.3
    do script "cd ~/Projects/voice-platform/apps/dashboard && npm run dev" in front window
    
    -- Fourth tab - Voice Engine
    tell application "System Events" to keystroke "t" using command down
    delay 0.3
    do script "cd ~/Projects/voice-platform/apps/voice-engine && npm run dev" in front window
end tell
'
