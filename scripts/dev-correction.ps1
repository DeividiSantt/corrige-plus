$ErrorActionPreference = "Stop"

$repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$service = Join-Path $repository "services\correction-api"
$python = Join-Path $service ".venv\Scripts\python.exe"
$bundledPython = "C:\Users\janaina\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
  if (Test-Path -LiteralPath $bundledPython) {
    $python = $bundledPython
  } else {
    throw "Ambiente Python nao encontrado. Execute: py -3.12 -m venv services\correction-api\.venv"
  }
}

$arguments = @(
  "-m", "uvicorn", "app.main:app",
  "--host", "127.0.0.1",
  "--port", "8000",
  "--reload"
)

if (Test-Path -LiteralPath (Join-Path $service ".env")) {
  $arguments += @("--env-file", ".env")
}

Push-Location $service
try {
  & $python @arguments
} finally {
  Pop-Location
}
