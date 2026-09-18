# Diagnoses the Python environment: version, PATH, pip, compiler, manim support.
$ErrorActionPreference = "Continue"

Write-Host "=== python ==="
python --version
Write-Host "exe: $((Get-Command python).Source)"

Write-Host "`n=== PATH entries with Python ==="
$env:Path -split ";" | Where-Object { $_ -like "*Python*" }

Write-Host "`n=== Scripts dir on PATH? ==="
$scripts = Join-Path (Split-Path (Get-Command python).Source) "Scripts"
Write-Host "Scripts dir: $scripts (exists: $(Test-Path $scripts))"
Write-Host "manim.exe present: $(Test-Path (Join-Path $scripts 'manim.exe'))"

Write-Host "`n=== pip ==="
python -m pip --version

Write-Host "`n=== C compiler (needed only for source builds) ==="
Get-Command cl.exe, gcc.exe -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { Write-Host "(no MSVC cl.exe found)" }

Write-Host "`n=== manim import ==="
python -c "import manim; print('manim', manim.__version__)" 2>&1 | Select-Object -First 3
