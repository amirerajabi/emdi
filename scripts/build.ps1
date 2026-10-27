# Release build: builds the UI and packages the app with electron-builder into desktop/dist.
#   pwsh scripts/build.ps1             # installer
#   pwsh scripts/build.ps1 -Dir        # unpacked app folder only
param([switch]$Dir)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

Push-Location "$root/ui"; npm ci; if ($LASTEXITCODE -ne 0) { throw 'UI install failed' }; npm run build; if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }; Pop-Location
Push-Location "$root/desktop"; npm ci; if ($LASTEXITCODE -ne 0) { throw 'Desktop install failed' }; if ($Dir) { npm run dist:dir } else { npm run dist }; if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }; Pop-Location
Write-Host "Done: $root/desktop/dist"
