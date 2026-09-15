# Pull the latest IFClite Desktop from GitHub (run from the repo root).
$ErrorActionPreference = "Stop"

if (-not (Test-Path .git)) {
  Write-Host "This folder is not a Git clone."
  Write-Host "Do not use Codebase Download for updates."
  Write-Host "Once:  git clone https://github.com/ShobhitSuthar03/ifclite.git"
  Write-Host "Then:  cd ifclite ; powershell -File scripts\update.ps1"
  exit 1
}

git checkout main
git pull origin main

if (Get-Command node -ErrorAction SilentlyContinue) {
  npm install
} else {
  Write-Host "Git pull finished. Install Node.js 22+ then run npm install."
}

Write-Host ""
Write-Host "Updated. Browser: npm run dev    Desktop: npm run dev:desktop"
