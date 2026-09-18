# Renders the v3 cold-viewer cut.
# Usage: powershell -ExecutionPolicy Bypass -File explainer/render-v3.ps1 [-Quality qh]
param([string]$Quality = "qh")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot ".")
.\.venv\Scripts\python.exe -m manim -$Quality jev_pref_story_v3.py JevPrefStoryV3
