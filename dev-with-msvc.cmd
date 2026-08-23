@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo Failed to load vcvars64
  exit /b 1
)
REM vcvars64 resets PATH; re-prepend cargo so the tauri CLI can run `cargo metadata`.
set "PATH=C:\Users\17123\.cargo\bin;%PATH%"
cd /d "%~dp0"
REM Disable ANSI colors so the GBK console does not render Vite/cargo output as mojibake.
set "NO_COLOR=1"
set "FORCE_COLOR=0"
REM Run the tee wrapper (dev-with-msvc.ps1), which routes npm through cmd so its
REM stderr notices do not surface as PowerShell "NativeCommandError", and logs to
REM dev-stdout.log. Kept as a .cmd so the documented entry point stays unchanged.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-with-msvc.ps1" %*
exit /b %errorlevel%
