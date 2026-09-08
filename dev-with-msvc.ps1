# Wrapper for `npm run tauri:dev` that tees merged stdout+stderr to dev-stdout.log.
# Run directly under pwsh 7 — its UTF-8 + ConPTY render cargo/vite output correctly
# on Chinese Windows, where a cmd.exe child would attach a GBK console and mojibake
# UTF-8 bytes. (Earlier versions wrapped `cmd /c` to dodge PS 5.1's
# NativeCommandError on npm stderr notices; pwsh 7 no longer needs that.)
$ErrorActionPreference = "Continue"

$log = Join-Path $PSScriptRoot "dev-stdout.log"
$cmd = "npm run tauri:dev"
if ($args.Count -gt 0) {
  $cmd = "$cmd $($args -join ' ')"
}

# 2>&1 merges stderr into stdout; Tee-Object splits the single stream to the
# console (so pwsh 7's ConPTY renders it) and the log file.
Invoke-Expression $cmd 2>&1 | Tee-Object -FilePath $log
