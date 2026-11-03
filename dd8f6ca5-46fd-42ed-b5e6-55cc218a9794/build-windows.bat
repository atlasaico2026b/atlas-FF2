@echo off
echo =============================================
echo  ATLAS - Build Windows Installer
echo  نرم‌افزار طراحی سیستم‌های ایمنی و آتش‌نشانی
echo =============================================
echo.

:: Step 1: Build Vite
echo [1/3] Building Vite app...
call npx vite build
if %errorlevel% neq 0 (
    echo ERROR: Vite build failed!
    pause
    exit /b 1
)

:: Step 2: Install electron dependencies
echo [2/3] Installing Electron dependencies...
cd electron
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

:: Step 3: Build Windows installer
echo [3/3] Building Windows installer (NSIS)...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo ERROR: electron-builder failed!
    pause
    exit /b 1
)

cd ..
echo.
echo =============================================
echo  SUCCESS! Windows installer built!
echo  Check: electron\release\ for .exe installer
echo =============================================
pause
