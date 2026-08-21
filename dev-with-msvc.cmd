@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo Failed to load vcvars64
  exit /b 1
)
REM vcvars64 resets PATH; re-prepend cargo so tauri CLI can invoke `cargo metadata`
set "PATH=C:\Users\17123\.cargo\bin;%PATH%"
cd /d "%~dp0"
REM tee 模拟：把 npm run tauri:dev 的合并输出（stdout+stderr）同时写到控制台
REM 和 dev-stdout.log，方便事后回看。PowerShell 在 cmd 里调用时不再展开 %*，
REM 通过 powershell -Command 接受参数。
if "%*"=="" (
  powershell -NoProfile -Command "npm run tauri:dev 2>&1 | Tee-Object -FilePath '%~dp0dev-stdout.log'"
) else (
  powershell -NoProfile -Command "npm run tauri:dev %* 2>&1 | Tee-Object -FilePath '%~dp0dev-stdout.log'"
)
