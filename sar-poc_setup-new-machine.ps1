<#
SAR POC - New Machine Setup Helper (Windows PowerShell)
Usage:
  1) Copy the sar-poc folder locally (not on network share)
  2) Put this script in the project root (same folder as package.json)
  3) Run PowerShell as a normal user:
       powershell -ExecutionPolicy Bypass -File .\sar-poc_setup-new-machine.ps1

What it does:
  - Confirms you are in a SAR POC project folder
  - Removes node_modules and .next (optional prompts)
  - Runs npm install
  - Runs basic checks
#>

$ErrorActionPreference = "Stop"

Write-Host "`n=== SAR POC: New Machine Setup ===`n"

if (!(Test-Path ".\package.json")) {
  Write-Host "ERROR: package.json not found. Run this script from the sar-poc project root." -ForegroundColor Red
  exit 1
}

# Friendly reminder about .env.local
if (!(Test-Path ".\.env.local")) {
  Write-Host "WARNING: .env.local not found." -ForegroundColor Yellow
  Write-Host "  Copy it from the old machine OR recreate it with Supabase keys before running the app."
} else {
  Write-Host "OK: .env.local found."
}

function Prompt-YesNo($msg) {
  $resp = Read-Host "$msg (Y/N)"
  return ($resp -match '^(Y|y)$')
}

# Remove node_modules
if (Test-Path ".\node_modules") {
  if (Prompt-YesNo "Delete node_modules? (recommended)") {
    Write-Host "Removing node_modules..."
    Remove-Item ".\node_modules" -Recurse -Force
  } else {
    Write-Host "Skipping node_modules removal."
  }
} else {
  Write-Host "node_modules not present (good)."
}

# Remove .next
if (Test-Path ".\.next") {
  if (Prompt-YesNo "Delete .next build cache? (recommended)") {
    Write-Host "Removing .next..."
    Remove-Item ".\.next" -Recurse -Force
  } else {
    Write-Host "Skipping .next removal."
  }
} else {
  Write-Host ".next not present (good)."
}

# Check Node and npm
Write-Host "`nChecking Node/npm..."
node --version
npm --version

# Install dependencies
Write-Host "`nRunning npm install..."
npm install

# Quick Git checks (optional)
if (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Host "`nGit detected. Recent commits:"
  git log --oneline --max-count=5
} else {
  Write-Host "`nGit not found on PATH. Install Git if you want version control." -ForegroundColor Yellow
}

Write-Host "`nDone."
Write-Host "Next: run 'npm run dev' then open http://localhost:3000"
