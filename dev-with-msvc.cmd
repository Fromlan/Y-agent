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
REM Run the tee wrapper (dev-with-msvc.ps1) under pwsh 7, which tees merged
REM stdout+stderr of `npm run tauri:dev` into both the console and dev-stdout.log.
REM Kept as a .cmd so the documented entry point stays unchanged.
REM PowerShell 7+ (pwsh) 是 dev 的运行时依赖 — 自带 PS5.1 不支持 ANSI/UTF-8,
REM 在中文 Windows 上会渲染 tauri/vite/cargo 输出为乱码。装法: winget install Microsoft.PowerShell
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-with-msvc.ps1" %*
exit /b %errorlevel%
