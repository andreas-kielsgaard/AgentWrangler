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

rem Build one maximized window with a seven-runtime grid and a full-width command pane.
wt.exe -M -w new ^
  new-tab --title "Durable Data" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/authority-server" ^
  ; split-pane -H -s .22 --title "Agent Wrangler CLI" --suppressApplicationTitle -d "%PROJECT_ROOT%" ^
  ; move-focus up ^
  ; split-pane -V -s .67 --title "Ranch" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/ranch" ^
  ; split-pane -V -s .5 --title "Router" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/router" ^
  ; split-pane -H -s .5 --title "Execution Node" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/execution-node" ^
  ; move-focus first ^
  ; split-pane -H -s .67 --title "Gallery" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/gallery" ^
  ; split-pane -H -s .5 --title "Farm" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/farm" ^
  ; move-focus first ^
  ; move-focus right ^
  ; split-pane -H -s .5 --title "Engine" --suppressApplicationTitle -d "%PROJECT_ROOT%" cmd /k "npm start --workspace @agent-wrangler/engine"

echo Opened all seven runtimes plus a full-width command pane in one maximized Windows Terminal window.
echo No inter-runtime links were configured.
echo Wrangler Farm will be available at http://127.0.0.1:4105
endlocal
