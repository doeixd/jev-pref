# Extracts still frames from the rendered explainer for visual review.
# Usage: powershell -ExecutionPolicy Bypass -File explainer/extract-frames.ps1
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot ".")
$Video = "media/videos/jev_pref_explainer/1080p30/JevPrefExplainer.mp4"
$OutDir = "media/frames"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
foreach ($t in @(4, 12, 20, 30, 40, 50, 56)) {
  ffmpeg -y -v error -ss $t -i $Video -frames:v 1 "$OutDir/frame_$t.png"
}
Write-Host "frames in $OutDir"
