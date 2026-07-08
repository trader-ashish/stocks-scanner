@echo off
title Stock Scanner Manager
:menu
cls
echo ============================================================
echo      Stock Scanner - Firebase Database + Render Hosting
echo ============================================================
echo.
echo  [1] Log in to Firebase CLI (for local credential sync)
echo  [2] Run Express Server Locally on Port 4000
echo  [3] Initialize Git and Commit (Ready for Render GitHub Push)
echo  [4] Exit
echo.
echo ============================================================
set /p choice="Enter choice [1-4]: "

if "%choice%"=="1" goto login
if "%choice%"=="2" goto run_local
if "%choice%"=="3" goto git_init
if "%choice%"=="4" goto exit
echo Invalid choice. Please try again.
pause
goto menu

:login
echo.
echo [Firebase Login] Opening browser to authenticate...
call npx firebase login
echo.
pause
goto menu

:run_local
echo.
echo [Local Run] Starting standalone Express server on port 4000...
echo.
echo 💡 Open your browser and go to http://localhost:4000
echo.
set PORT=4000
node functions/index.js
echo.
pause
goto menu

:git_init
echo.
echo [Git Init] Preparing local repository for Render deployment...
git init
git add .
git commit -m "Initialize Firebase Database + Render deployment setup"
echo.
echo Done! Now follow these steps to put it online:
echo 1. Create a repository on GitHub (e.g., 'my-stocks-scanner')
echo 2. Run: git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
echo 3. Run: git branch -M main
echo 4. Run: git push -u origin main
echo 5. Go to Render.com, create a New Web Service, and connect this GitHub repo!
echo.
pause
goto menu

:exit
echo Goodbye!
exit
