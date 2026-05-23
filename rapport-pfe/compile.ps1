# =============================================================
#  Script de compilation — Rapport PFE Adem Hmercha
#  Usage : .\compile.ps1
# =============================================================

$env:PATH += ";C:\Program Files\MiKTeX\miktex\bin\x64"
$main = "main"

Write-Host "==> Passe 1 : pdflatex (installe les paquets manquants)..." -ForegroundColor Cyan
pdflatex -interaction=nonstopmode $main
if ($LASTEXITCODE -ne 0) { Write-Warning "Passe 1 : erreurs (normal en 1re compilation)." }

Write-Host "==> BibTeX (bibliographie)..." -ForegroundColor Cyan
bibtex $main

Write-Host "==> Glossaires & acronymes..." -ForegroundColor Cyan
makeglossaries $main

Write-Host "==> Passe 2 : pdflatex..." -ForegroundColor Cyan
pdflatex -interaction=nonstopmode $main

Write-Host "==> Passe 3 : pdflatex (TOC + refs finales)..." -ForegroundColor Cyan
pdflatex -interaction=nonstopmode $main

Write-Host ""
if (Test-Path "$main.pdf") {
    Write-Host "==> Succes : $main.pdf genere !" -ForegroundColor Green
    Start-Process "$main.pdf"
} else {
    Write-Host "==> ECHEC : consulter $main.log pour les erreurs." -ForegroundColor Red
}
