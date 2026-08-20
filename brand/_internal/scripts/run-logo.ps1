$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$prompt = Get-Content -Path 'E:\Pi\Y-agent\brand\prompt-logo.txt' -Raw -Encoding UTF8
$prompt = ($prompt -replace '\r?\n', ' ').Trim()

mmx image generate `
  --prompt $prompt `
  --aspect-ratio '1:1' `
  --n 1 `
  --prompt-optimizer `
  --out-dir 'E:\Pi\Y-agent\brand' `
  --out-prefix 'y-agent-logo' `
  --quiet
