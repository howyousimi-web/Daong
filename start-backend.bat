@echo off
cd /d "%~dp0daong"
if not exist node_modules (
  echo Installing backend dependencies...
  call npm install
)
echo Starting DAONG backend + web frontend on http://localhost:3000 ...
call npm start
