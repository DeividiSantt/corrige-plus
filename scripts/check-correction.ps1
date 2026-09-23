$ErrorActionPreference = "Stop"

$repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$service = Join-Path $repository "services\correction-api"
$python = Join-Path $service ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
  throw "Ambiente Python não encontrado. Configure services\correction-api\.venv antes da validação."
}

Push-Location $service
try {
  & $python -m compileall app scripts tests
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $python -m pytest -q -rs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
