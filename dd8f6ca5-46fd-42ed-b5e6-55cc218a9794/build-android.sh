#!/bin/bash
echo "============================================="
echo " ATLAS - Build Android APK"
echo " نرم‌افزار طراحی سیستم‌های ایمنی و آتش‌نشانی"
echo "============================================="
echo ""

# Step 1: Build Vite
echo "[1/5] Building Vite app..."
npx vite build
if [ $? -ne 0 ]; then echo "ERROR: Vite build failed!"; exit 1; fi

# Step 2: Install Capacitor
echo "[2/5] Installing Capacitor..."
npm install @capacitor/core @capacitor/cli @capacitor/android --save
npx cap init "ATLAS Fire Safety" "com.atlas.firesafety" --web-dir dist

# Step 3: Add Android platform
echo "[3/5] Adding Android platform..."
npx cap add android

# Step 4: Sync
echo "[4/5] Syncing web assets to Android..."
npx cap sync android

# Step 5: Build APK
echo "[5/5] Building APK..."
cd android
./gradlew assembleDebug
if [ $? -ne 0 ]; then echo "ERROR: Gradle build failed!"; exit 1; fi

cd ..
echo ""
echo "============================================="
echo " SUCCESS! APK built!"
echo " Check: android/app/build/outputs/apk/debug/"
echo "============================================="
