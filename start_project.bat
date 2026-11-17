@echo off
title Krishi Sahayak Launcher
echo ===================================================
echo   Starting Krishi Sahayak (AI Farmer Advisory)
echo ===================================================
echo.

echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "Krishi Sahayak - Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo [2/2] Launching Expo Web Frontend on http://localhost:8081 ...
start "Krishi Sahayak - Frontend (Port 8081)" cmd /k "cd /d "%~dp0frontend\mobile" && npx expo start --web --port 8081"

echo.
echo ===================================================
echo  Services launched in separate command windows:
echo  - Backend API:    http://localhost:8000
echo  - Swagger Docs:   http://localhost:8000/docs
echo  - Web Dashboard:  http://localhost:8081
echo ===================================================
echo.
pause
