# CI status

[![CI](https://github.com/cedpec/gscript/actions/workflows/ci.yml/badge.svg)](https://github.com/cedpec/gscript/actions/workflows/ci.yml)

# Tests unitaires (Jest) pour le script Apps Script

Ce petit harness permet d'exécuter des tests unitaires sur `Code.js` en local avec des mocks minimes pour l'environnement Google Apps Script.

Installation

```bash
cd /Users/ced/projets/gscript
npm install
```

Lancer les tests

```bash
npm test
```

Notes

Pre-push check

Un script de vérification pré-push a été ajouté pour empêcher d'envoyer des fichiers de test/dev contenant des appels Node-specific (ex: `global`) vers Google Apps Script.

Pour installer le hook localement :

```bash
# depuis la racine du projet
mkdir -p .git/hooks
cp scripts/prepush-check.js .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Ou exécute simplement le check manuellement avant le push :

```bash
npm run check:clasp
```

Ou automatiquement via npm :

```bash
npm run install-hooks
```

Pour désinstaller :

```bash
npm run uninstall-hooks
```

## How to push to GitHub

1. Create a repository on GitHub (via the website or `gh repo create`).
2. Add the remote and push from this folder:

   git remote add origin <your-repo-url>
   git branch -M main
   git push -u origin main

Make sure `.gitignore` is correct before pushing (it includes `node_modules/` and `dev_backup/`).

# CI status

> Remplace `OWNER` et `REPO` par tes valeurs GitHub pour activer le badge.

![CI](https://github.com/cedpec/gscript/actions/workflows/ci.yml/badge.svg)

# Tests unitaires (Jest) pour le script Apps Script

Ce petit harness permet d'exécuter des tests unitaires sur `Code.js` en local avec des mocks minimes pour l'environnement Google Apps Script.

Installation

```bash
cd /Users/ced/projets/gscript
npm install
```

Lancer les tests

```bash
npm test
```

Notes

Pre-push check

Un script de vérification pré-push a été ajouté pour empêcher d'envoyer des fichiers de test/dev contenant des appels Node-specific (ex: `global`) vers Google Apps Script.

Pour installer le hook localement :

```bash
# depuis la racine du projet
mkdir -p .git/hooks
cp scripts/prepush-check.js .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Ou exécute simplement le check manuellement avant le push :

```bash
npm run check:clasp
```

Ou automatiquement via npm :

```bash
npm run install-hooks
```

Pour désinstaller :

```bash
npm run uninstall-hooks
```

## How to push to GitHub

1. Create a repository on GitHub (via the website or `gh repo create`).
2. Add the remote and push from this folder:

   git remote add origin <your-repo-url>
   git branch -M main
   git push -u origin main

Make sure `.gitignore` is correct before pushing (it includes `node_modules/` and `dev_backup/`).
