# =============================================================
#  Makefile — Compilation du rapport PFE (LaTeX)
#  Nécessite : pdflatex, bibtex, makeglossaries
# =============================================================

MAIN     = main
PDFLATEX = pdflatex
BIBTEX   = bibtex
GLOSSARY = makeglossaries
FLAGS    = -interaction=nonstopmode -halt-on-error

.PHONY: all clean distclean view

## Compilation complète (4 passes pour TOC, bib, glossaires)
all: $(MAIN).pdf

$(MAIN).pdf: $(MAIN).tex
	$(PDFLATEX) $(FLAGS) $(MAIN)
	$(BIBTEX) $(MAIN)
	$(GLOSSARY) $(MAIN)
	$(PDFLATEX) $(FLAGS) $(MAIN)
	$(PDFLATEX) $(FLAGS) $(MAIN)
	@echo "==> Compilation terminée : $(MAIN).pdf"

## Compilation rapide (une seule passe, sans bibliographie)
quick:
	$(PDFLATEX) $(FLAGS) $(MAIN)

## Ouvrir le PDF (Windows)
view: $(MAIN).pdf
	start $(MAIN).pdf

## Nettoyer les fichiers auxiliaires
clean:
	del /Q /F $(MAIN).aux $(MAIN).log $(MAIN).toc \
	          $(MAIN).lof $(MAIN).lot $(MAIN).bbl \
	          $(MAIN).blg $(MAIN).glo $(MAIN).gls \
	          $(MAIN).acn $(MAIN).acr $(MAIN).alg \
	          $(MAIN).glg $(MAIN).ist $(MAIN).out \
	          $(MAIN).fls $(MAIN).fdb_latexmk 2>NUL
	@echo "==> Fichiers auxiliaires supprimés."

## Nettoyer tout y compris le PDF
distclean: clean
	del /Q /F $(MAIN).pdf 2>NUL
	@echo "==> PDF supprimé."
