$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$variants = @(
  @{ prompt = 'E:\Pi\Y-agent\brand\prompt-appicon.txt';  ratio = '1:1'; prefix = 'y-agent-appicon' },
  @{ prompt = 'E:\Pi\Y-agent\brand\prompt-wordmark.txt'; ratio = '16:9'; prefix = 'y-agent-wordmark' },
  @{ prompt = 'E:\Pi\Y-agent\brand\prompt-light.txt';    ratio = '1:1'; prefix = 'y-agent-light' }
)

foreach ($v in $variants) {
  $prompt = (Get-Content -Path $v.prompt -Raw -Encoding UTF8) -replace '\r?\n', ' '
  Write-Host "Generating $($v.prefix) ..."
  mmx image generate `
    --prompt $prompt `
    --aspect-ratio $v.ratio `
    --n 1 `
    --prompt-optimizer `
    --out-dir 'E:\Pi\Y-agent\brand' `
    --out-prefix $v.prefix `
    --quiet
}
