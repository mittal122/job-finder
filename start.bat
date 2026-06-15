@echo off
title Job Finder - Starting...

echo ================================
echo   Job Finder - Starting App
echo ================================
echo.

cd /d "%~dp0"

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running.
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

if not exist ".env" (
    echo ERROR: .env file not found.
    echo Please create a .env file with your API keys. See SETUP.md for details.
    pause
    exit /b 1
)

echo Stopping any existing containers...
docker compose down >nul 2>&1

echo Starting services (PostgreSQL + Backend)...
docker compose up -d

if %errorlevel% neq 0 (
    echo ERROR: Failed to start services. Check your .env file and Docker setup.
    pause
    exit /b 1
)

echo.
echo Waiting for app to be ready...
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:8000

echo.
echo ================================
echo   App is running!
echo   URL: http://localhost:8000
echo   To stop: docker compose down
echo ================================
echo.
pause
