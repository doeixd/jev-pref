# One-off: extract v3 verification frames.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot ".")
$Video = "media/videos/jev_pref_story_v3/1080p60/JevPrefStoryV3.mp4"
$OutDir = "media/frames3"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Probe = & ffprobe -v error -show_entries format=duration -of csv=p=0 $Video
Write-Host "duration: $Probe"
$Times = @(4, 9, 14, 20, 26, 32, 38, 44, 50, 56, 62, 68, 73)
foreach ($sec in $Times) {
  ffmpeg -y -v error -ss $sec -i $Video -frames:v 1 "$OutDir/v3_$sec.png"
}
Write-Host "done"
