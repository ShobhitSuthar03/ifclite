# Local setup for IFClite Desktop on Windows (PowerShell).
# Clone from GitHub first (not Codebase Download):
#   git clone https://github.com/ShobhitSuthar03/ifclite.git
# Later updates: powershell -File scripts\update.ps1
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 22+ is required. Install from https://nodejs.org/ then re-run."
  exit 1
}

$major = [int]((node -p "process.versions.node.split('.')[0]"))
if ($major -lt 22) {
  Write-Host "Node.js 22+ is required (found $(node -v))."
  exit 1
}

Write-Host "Installing npm packages…"
npm install

Write-Host ""
Write-Host "Setup finished."
Write-Host "  Browser preview:  npm run dev"
Write-Host "  Then open http://127.0.0.1:43127 and click Load sample"
Write-Host "  Native Tauri:     npm run dev:desktop   (needs MSVC, WebView2, Rust 1.88+)"
