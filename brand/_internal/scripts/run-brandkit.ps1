$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$prompt = Get-Content -Path 'E:\Pi\Y-agent\brand\prompt-brandkit.txt' -Raw -Encoding UTF8

# Strip newlines and collapse whitespace so it passes cleanly as one CLI arg
$prompt = ($prompt -replace '\r?\n', ' ').Trim()

mmx image generate `
  --prompt $prompt `
  --aspect-ratio '16:9' `
  --n 1 `
  --prompt-optimizer `
  --out-dir 'E:\Pi\Y-agent\brand' `
  --out-prefix 'y-agent-brandkit' `
  --quiet
