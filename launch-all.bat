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

rem Build a 40/60 window: CLI and Execution Node on the left, six runtimes on the right.
wt.exe -M -w new ^
  new-tab --title "Agent Wrangler CLI" --suppressApplicationTitle -d "%PROJECT_ROOT%" ^
  ; split-pane -V -s .6 --title "Durable Data" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/authority-server" ^
  ; move-focus left ^
  ; split-pane -H -s .33 --title "Execution Node" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/execution-node" ^
  ; move-focus up ^
  ; move-focus right ^
  ; split-pane -V -s .5 --title "Router" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/router" ^
  ; split-pane -H -s .67 --title "Engine" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/engine" ^
  ; split-pane -H -s .5 --title "Farm" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/farm" ^
  ; move-focus first ^
  ; move-focus right ^
  ; split-pane -H -s .67 --title "Ranch" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/ranch" ^
  ; split-pane -H -s .5 --title "Gallery" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/gallery"

echo Opened a 40/60 layout with CLI and Execution Node on the left and six runtime panes on the right.
echo No inter-runtime links were configured.
echo Wrangler Farm will be available at http://127.0.0.1:4105
endlocal
