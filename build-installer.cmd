@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo Failed to load vcvars64
  exit /b 1
)
set "PATH=C:\Users\17123\.cargo\bin;%PATH%"
cd /d "%~dp0"
call npm run tauri:build %*
