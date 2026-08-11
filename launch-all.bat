@echo off
setlocal
rem Append a dot so the quoted Windows Terminal working directory does not end in a backslash.
set "PROJECT_ROOT=%~dp0."
set "AUTHORITY_URL="
set "RANCH_URL="
set "GALLERY_URL="
set "ROUTER_URL="
set "ENGINE_URL="
set "CODEX_NODE_URL="

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on PATH.
  exit /b 1
)

where wt.exe >nul 2>nul
if errorlevel 1 (
  echo Windows Terminal is required to launch the runtimes as tabs in one window.
  exit /b 1
)

wt.exe -w new new-tab --title "Durable Data Server (working name)" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/authority-server" ; new-tab --title "Wrangle Ranch" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/ranch" ; new-tab --title "Wrangle Gallery" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/gallery" ; new-tab --title "Wrangle Router" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/router" ; new-tab --title "Wrangle Engine" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/engine" ; new-tab --title "Wrangler Farm" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/farm" ; new-tab --title "Codex CLI Execution Node" -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/execution-node"

echo Opened five primary runtime tabs, one Durable Data Server tab, and one execution-node tab in one Windows Terminal window.
echo No inter-runtime links were configured.
echo Wrangler Farm will be available at http://127.0.0.1:4105
endlocal
