#!/usr/bin/env pwsh

# Dot-source this file from the repository root to use the project's verified
# Node/npm copies in the current PowerShell session only.
if ($MyInvocation.InvocationName -ne '.') {
  throw "Run with dot-sourcing: . .\scripts\use-pinned-runtime.ps1"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeDir = Join-Path $repoRoot '.cache\tools\node-v24.22.3\node-v24.22.3-win-x64'
$nodeExe = Join-Path $nodeDir 'node.exe'
$npmCli = Join-Path $repoRoot '.cache\tools\npm-12.2.2\package\bin\npm-cli.js'

if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
  throw "Pinned Node.js executable is missing: $nodeExe"
}
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) {
  throw "Pinned npm CLI is missing: $npmCli"
}

$nodeVersion = (& $nodeExe --version).Trim()
$npmVersion = (& $nodeExe $npmCli --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v24.22.3' -or $npmVersion -ne '12.2.2') {
  throw "Pinned runtime check failed (Node $nodeVersion, npm $npmVersion)."
}

$env:PATH = "$nodeDir;$env:PATH"
$global:OMOK_PINNED_NODE_EXE = $nodeExe
$global:OMOK_PINNED_NPM_CLI = $npmCli
if (Get-Alias npm -ErrorAction SilentlyContinue) {
  Remove-Item Alias:npm
}
function global:npm {
  & $global:OMOK_PINNED_NODE_EXE $global:OMOK_PINNED_NPM_CLI @args
}

Write-Host "Current PowerShell session now uses Node.js $nodeVersion and npm $npmVersion."
Write-Host 'This does not change the Windows-wide or user-wide Node.js installation.'
