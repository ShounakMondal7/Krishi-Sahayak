@echo off
title Krishi Sahayak Stopper
echo ===================================================
echo   Stopping Krishi Sahayak Services
echo ===================================================
echo.

echo Releasing Port 8000 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Terminating PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Releasing Port 8081 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do (
    echo Terminating PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All Krishi Sahayak services have been stopped.
timeout /t 3 >nul
