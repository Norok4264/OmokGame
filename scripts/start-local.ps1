[CmdletBinding()]
param(
  [Parameter(HelpMessage = 'Bind the web client to this active private IPv4 address for same-LAN phone testing.')]
  [string]$LanAddress
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeDir = Join-Path $repoRoot '.cache\tools\node-v24.22.3\node-v24.22.3-win-x64'
$nodeExe = Join-Path $nodeDir 'node.exe'
$npmCli = Join-Path $repoRoot '.cache\tools\npm-12.2.2\package\bin\npm-cli.js'

if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
  throw "Pinned Node.js v24.22.3 is missing: $nodeExe. Restore the project's verified runtime before starting."
}
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) {
  throw "Pinned npm 12.2.2 is missing: $npmCli. Restore the project's verified runtime before starting."
}

$nodeVersion = (& $nodeExe --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v24.22.3') {
  throw "Expected Node.js v24.22.3, got '$nodeVersion'."
}
$npmVersion = (& $nodeExe $npmCli --version).Trim()
if ($LASTEXITCODE -ne 0 -or $npmVersion -ne '12.2.2') {
  throw "Expected npm 12.2.2, got '$npmVersion'."
}

$webBindAddress = [System.Net.IPAddress]::Loopback
$allowedOrigins = 'http://127.0.0.1:5173,http://localhost:5173'
$modeLabel = 'local only'

if (-not [string]::IsNullOrWhiteSpace($LanAddress)) {
  $parsedAddress = $null
  if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$parsedAddress) -or
      $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "LanAddress must be an IPv4 address assigned to this PC. Received '$LanAddress'."
  }

  $bytes = $parsedAddress.GetAddressBytes()
  $isPrivate = ($bytes[0] -eq 10) -or
    (($bytes[0] -eq 172) -and ($bytes[1] -ge 16) -and ($bytes[1] -le 31)) -or
    (($bytes[0] -eq 192) -and ($bytes[1] -eq 168))
  if (-not $isPrivate) {
    throw 'LAN mode accepts only RFC1918 private IPv4 addresses (10/8, 172.16/12, or 192.168/16).'
  }

  $owner = $null
  foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
    foreach ($unicast in $adapter.GetIPProperties().UnicastAddresses) {
      if ($unicast.Address.Equals($parsedAddress)) { $owner = $adapter; break }
    }
    if ($owner) { break }
  }
  if (-not $owner) {
    throw "'$LanAddress' is not assigned to an active network interface on this PC. Check ipconfig and choose the Wi-Fi/LAN IPv4 address."
  }

  $webBindAddress = $parsedAddress
  $allowedOrigins = "http://${LanAddress}:5173"
  $modeLabel = "LAN only on $LanAddress ($($owner.Name); $($owner.NetworkInterfaceType))"
  Write-Host "Selected interface: $($owner.Name) — $($owner.Description)"
  if ($owner.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel -or
      $owner.Description -match 'VPN|Virtual|Hyper-V|VMware|VirtualBox|WSL') {
    Write-Warning 'This interface looks virtual or tunneled; a phone on Wi-Fi may not be able to reach it. Select the PC Wi-Fi/LAN IPv4 address if different.'
  }
}

function Assert-PortAvailable([System.Net.IPAddress]$Address, [int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)
  try { $listener.Start() }
  catch { throw "Cannot bind $($Address):$Port. Check whether another process is using the port. $($_.Exception.Message)" }
  finally { $listener.Stop() }
}

Assert-PortAvailable -Address ([System.Net.IPAddress]::Loopback) -Port 3001
Assert-PortAvailable -Address $webBindAddress -Port 5173

$requiredFiles = @(
  (Join-Path $repoRoot 'node_modules\tsx\dist\cli.mjs'),
  (Join-Path $repoRoot 'node_modules\vite\bin\vite.js'),
  (Join-Path $repoRoot 'node_modules\typescript\bin\tsc')
)
$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missing.Count -gt 0) {
  throw "Dependencies are missing. With the verified runtime active, run 'npm ci --no-audit --no-fund' first. Missing: $($missing -join ', ')"
}

$environmentNames = @('PATH', 'HOST', 'PORT', 'ALLOWED_ORIGINS', 'OMOK_VITE_HOST', 'OMOK_COMPILED_SERVER')
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  $env:PATH = "$nodeDir;$env:PATH"
  $env:HOST = '127.0.0.1'
  $env:PORT = '3001'
  $env:ALLOWED_ORIGINS = $allowedOrigins
  $env:OMOK_VITE_HOST = $webBindAddress.ToString()
  $env:OMOK_COMPILED_SERVER = '1'

  Write-Host "Runtime: Node.js $nodeVersion / npm $npmVersion"
  Write-Host "Mode: $modeLabel"
  Write-Host "Web: http://${webBindAddress}:5173"
  Write-Host 'API and WebSocket server: 127.0.0.1:3001 (loopback only)'
  Write-Host "Allowed browser Origin: $allowedOrigins"
  if ($LanAddress) {
    Write-Host 'Windows Firewall was not changed. If the private-network firewall blocks this port, configure it manually for this app/port only.'
  }
  Write-Host 'Press Ctrl+C to stop both development services.'

  & $nodeExe $npmCli run build --workspace @danpan/shared
  if ($LASTEXITCODE -ne 0) { throw "Shared package build failed (exit $LASTEXITCODE)." }
  & $nodeExe $npmCli run build --workspace @danpan/server
  if ($LASTEXITCODE -ne 0) { throw "Server build failed (exit $LASTEXITCODE)." }

  & $nodeExe (Join-Path $repoRoot 'scripts\dev.mjs')
  $devExitCode = $LASTEXITCODE
  if ($null -eq $devExitCode) { $devExitCode = 0 }
  if ($devExitCode -ne 0) { throw "Development services exited with code $devExitCode." }
}
finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
}
