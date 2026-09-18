# Installs Manim via uv (isolated tool env, uv-managed Python 3.13).
# Ignores the broken system Pythons entirely.
# Usage: powershell -ExecutionPolicy Bypass -File explainer/setup-uv.ps1
$ErrorActionPreference = "Stop"

uv tool install manim --python 3.13
uv tool run --from manim manim --version
Write-Host "OK: manim ready via uv (Text uses Pango; no LaTeX needed)"
