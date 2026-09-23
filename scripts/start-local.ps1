param(
  [string]$NodePath = "C:\Users\janaina\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  [string]$PythonPath = "C:\Users\janaina\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webDirectory = Join-Path $repositoryRoot "apps\web"
$apiDirectory = Join-Path $repositoryRoot "services\correction-api"
$apiEnvPath = Join-Path $apiDirectory ".env"

function Get-EnvFileValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^\s*$Name=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  return ($line -replace "^\s*$Name=", "").Trim()
}

$occupiedPorts = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(3000, 8000) }
if ($occupiedPorts) {
  $ports = ($occupiedPorts.LocalPort | Sort-Object -Unique) -join ", "
  throw "As portas $ports ja estao em uso. Encerre os servidores anteriores antes de iniciar o ambiente completo."
}

$configuredApiKey = Get-EnvFileValue -Path $apiEnvPath -Name "CORRECTION_API_KEY"
if ($configuredApiKey) {
  $env:CORRECTION_API_KEY = $configuredApiKey
} else {
  $secretBytes = New-Object byte[] 32
  $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $randomGenerator.GetBytes($secretBytes)
  $randomGenerator.Dispose()
  $env:CORRECTION_API_KEY = [Convert]::ToBase64String($secretBytes)
}

$env:ALLOWED_ORIGINS = "http://127.0.0.1:3000"
$env:APP_ENV = "development"
$env:NEXT_PUBLIC_CORRECTION_API_URL = "http://127.0.0.1:8000"
$env:CORRECTION_API_URL = "http://127.0.0.1:8000"

function Start-DetachedCommand {
  param(
    [string]$WorkingDirectory,
    [string]$CommandLine
  )

  Push-Location $WorkingDirectory
  try {
    & "C:\Windows\System32\cmd.exe" /c $CommandLine | Out-Null
  } finally {
    Pop-Location
  }
}

$webCommand = 'start "" /b "' + $NodePath + '" ".\node_modules\next\dist\bin\next" dev --hostname 127.0.0.1 --port 3000'
$apiCommand = 'start "" /b "' + $PythonPath + '" -m uvicorn app.main:app --app-dir "' + $apiDirectory + '" --host 127.0.0.1 --port 8000 --env-file "' + (Join-Path $apiDirectory ".env") + '"'

Start-DetachedCommand -WorkingDirectory $webDirectory -CommandLine $webCommand
Start-DetachedCommand -WorkingDirectory $repositoryRoot -CommandLine $apiCommand

Write-Output "CORRIGE+ iniciado."
Write-Output "Web: http://127.0.0.1:3000"
Write-Output "API: http://127.0.0.1:8000/health"
Write-Output "A chave interna foi reutilizada do .env quando disponivel."
