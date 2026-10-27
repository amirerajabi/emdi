# Development run: starts Vite with hot reload and opens the Electron shell on it.
#   pwsh scripts/dev.ps1                  # Electron + Vite
#   pwsh scripts/dev.ps1 -Browser         # Vite only; open the printed URL in a browser
#   pwsh scripts/dev.ps1 README.md        # Electron + Vite, opening a file
param([switch]$Browser, [string[]]$Paths)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

foreach ($dir in 'ui', 'desktop') {
  if (-not (Test-Path "$root/$dir/node_modules")) { Push-Location "$root/$dir"; npm install; Pop-Location }
}

$vite = Start-Process -FilePath 'npm' -ArgumentList 'run', 'dev' -WorkingDirectory "$root/ui" -PassThru -NoNewWindow
try {
  if ($Browser) {
    Write-Host 'Open http://localhost:5173/'
    Wait-Process -Id $vite.Id
  } else {
    $env:EMDI_DEV_URL = 'http://localhost:5173'
    Push-Location "$root/desktop"
    npm run build
    npx electron . @($Paths | ForEach-Object { Resolve-Path $_ })
    Pop-Location
  }
} finally {
  Stop-Process -Id $vite.Id -ErrorAction SilentlyContinue
}
