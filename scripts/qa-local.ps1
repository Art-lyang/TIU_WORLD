$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run lint
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $escapedRoot = [regex]::Escape((Get-Location).Path)
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -match "next" -and $_.CommandLine -match $escapedRoot } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  if (Test-Path .next) {
    Remove-Item -LiteralPath .next -Recurse -Force
  }

  Start-Process `
    -FilePath powershell `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "npm run dev -- -p 3001 *> next-dev-3001.log" `
    -WorkingDirectory (Get-Location).Path `
    -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $status = (Invoke-WebRequest -UseBasicParsing http://localhost:3001/ -TimeoutSec 5).StatusCode
      if ($status -eq 200) {
        $ready = $true
        break
      }
    } catch {
      $ready = $false
    }
  }

  if (-not $ready) {
    Write-Error "Local dev server did not become ready on http://localhost:3001."
  }

  npm run qa:smoke
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  npm run qa:regression
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
