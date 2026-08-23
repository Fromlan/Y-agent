# Wrapper for `npm run tauri:dev` that tees merged stdout+stderr to dev-stdout.log.
# npm is routed through `cmd /c` so its stderr notices (e.g. "npm notice run ...")
# merge into a single stream instead of surfacing as PowerShell "NativeCommandError".
$ErrorActionPreference = "Continue"

$log = Join-Path $PSScriptRoot "dev-stdout.log"
$cmd = "npm run tauri:dev"
if ($args.Count -gt 0) {
  $cmd = "$cmd $($args -join ' ')"
}

# `2>&1` inside cmd merges stdout+stderr; PowerShell pipes the single stream to
# Tee-Object, which writes to both the console and the log file.
cmd.exe /c "$cmd 2>&1" | Tee-Object -FilePath $log
