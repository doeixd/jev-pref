# One-off: extract v2 verification frames.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot ".")
$Video = "media/videos/jev_pref_story/1080p60/JevPrefStory.mp4"
$OutDir = "media/frames2"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Times = @(4, 8, 12, 16, 18, 20, 22, 26, 30)
foreach ($sec in $Times) {
  ffmpeg -y -v error -ss $sec -i $Video -frames:v 1 "$OutDir/v2_$sec.png"
}
ffprobe -v error -show_entries format=duration -of csv=p=0 $Video
Write-Host "done"
