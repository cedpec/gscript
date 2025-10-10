# CI status

> Remplace `OWNER` et `REPO` par tes valeurs GitHub pour activer le badge.

![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

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

- Les mocks sont volontairement basiques. Pour des tests plus complets il faudra enrichir `lib/gas-mock.js` (simuler responses SolarEdge, différents codes Tuya, erreurs réseau, etc.).
- `Code.js` est évalué dans le contexte Node : attention aux APIs non mockées.

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
