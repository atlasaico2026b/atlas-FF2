@echo off
chcp 65001 >nul 2>&1
title ATLAS Fire Protection Design - Build Script
echo.
echo ============================================
echo   ATLAS - Fire Protection Design Software
echo   Windows Build Script
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install from: https://nodejs.org
    echo Choose LTS version and run Next Next Finish
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found!
    pause
    exit /b 1
)
echo [OK] npm found

echo.
echo [1/5] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)

echo.
echo [2/5] Building web app...
call npx vite build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [3/5] Installing Electron packager...
call npm install -g electron-packager
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install electron-packager
    pause
    exit /b 1
)

echo.
echo [4/5] Building Windows executable...
call electron-packager . ATLAS --platform=win32 --arch=x64 --overwrite --out=./release
if %errorlevel% neq 0 (
    echo [ERROR] Electron packaging failed
    pause
    exit /b 1
)

echo.
echo [5/5] Done!
echo.
echo ============================================
echo   BUILD SUCCESSFUL!
echo.
echo   Your app is at: release\ATLAS-win32-x64\ATLAS.exe
echo.
echo   You can copy the entire "release\ATLAS-win32-x64"
echo   folder to any Windows computer and run ATLAS.exe
echo ============================================
echo.

:: Open the release folder
explorer release\ATLAS-win32-x64

pause
