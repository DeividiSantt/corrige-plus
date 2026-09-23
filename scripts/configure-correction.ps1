$ErrorActionPreference = "Stop"

$repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$webEnvironment = Join-Path $repository "apps\web\.env.local"
$serviceEnvironment = Join-Path $repository "services\correction-api\.env"
$serviceExample = Join-Path $repository "services\correction-api\.env.example"

function Read-EnvValue([string]$path, [string]$name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $line = Get-Content -LiteralPath $path |
    Where-Object { $_ -match "^$([Regex]::Escape($name))=" } |
    Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($name.Length + 1)
}

function Set-EnvValue([string]$path, [string]$name, [string]$value) {
  $lines = if (Test-Path -LiteralPath $path) {
    @(Get-Content -LiteralPath $path)
  } else {
    @()
  }
  $replacement = "$name=$value"
  $updated = $false
  $next = foreach ($line in $lines) {
    if ($line -match "^$([Regex]::Escape($name))=") {
      if (-not $updated) { $replacement }
      $updated = $true
    } else {
      $line
    }
  }
  if (-not $updated) { $next += $replacement }
  Set-Content -LiteralPath $path -Value $next -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $webEnvironment)) {
  throw "apps\web\.env.local não foi encontrado. Configure primeiro as variáveis públicas do Supabase."
}
if (-not (Test-Path -LiteralPath $serviceEnvironment)) {
  Copy-Item -LiteralPath $serviceExample -Destination $serviceEnvironment
}

$key = Read-EnvValue $webEnvironment "CORRECTION_API_KEY"
if (-not $key -or $key -like "generate-*" -or $key -like "replace-*") {
  $key = Read-EnvValue $serviceEnvironment "CORRECTION_API_KEY"
}
if (-not $key -or $key -like "generate-*" -or $key -like "replace-*") {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  $generator.GetBytes($bytes)
  $generator.Dispose()
  $key = (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

Set-EnvValue $webEnvironment "CORRECTION_API_URL" "http://127.0.0.1:8000"
Set-EnvValue $webEnvironment "CORRECTION_API_KEY" $key
Set-EnvValue $serviceEnvironment "CORRECTION_API_KEY" $key

Write-Output "Configuração interna sincronizada sem exibir a chave."
