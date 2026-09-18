# Renders the jev-pref explainer video.
# Usage: powershell -ExecutionPolicy Bypass -File explainer/render.ps1 [-Quality qh]
param([string]$Quality = "qh")
$ErrorActionPreference = "Stop"

# Project venv (Python 3.13): isolated from the system Pythons.
Set-Location (Join-Path $PSScriptRoot ".")
.\.venv\Scripts\python.exe -m manim -$Quality jev_pref_explainer.py JevPrefExplainer
