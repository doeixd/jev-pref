# Creates explainer/.venv (Python 3.13) and installs Manim in it.
# srt==3.5.3 (pure Python) fails to build under modern setuptools, so we pin
# setuptools==68 and build with --no-build-isolation.
# Usage: powershell -ExecutionPolicy Bypass -File explainer/setup-venv.ps1
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot ".")
if (-not (Test-Path ".venv")) {
  uv venv --python 3.13 .venv
}
uv pip install --python .venv "setuptools==68" wheel
uv pip install --python .venv --no-build-isolation manim
.\.venv\Scripts\python.exe -c "import manim; print('manim', manim.__version__)"
Write-Host "OK: explainer/.venv ready"
