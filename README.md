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

## Connexion SolarEdge OAuth2

La connexion SolarEdge utilise le flux OAuth2 Authorization Code. Avant de
l'activer :

1. Dans les propriétés du script Apps Script, définissez
   `SOLAREDGE_CLIENT_ID`, `SOLAREDGE_CLIENT_SECRET` et le `SITE_ID` existant.
   Les identifiants OAuth ne sont pas enregistrés par le formulaire de
   paramètres.
2. Dans les paramètres, renseignez `SOLAREDGE_REDIRECT_URI` avec l'URI exacte
   enregistrée dans l'application SolarEdge et présente dans la requête
   d'autorisation qui a généré le code.
3. Collez l'authorization code dans les paramètres et cliquez sur
   **Enregistrer le code**. Apps Script envoie le même `redirect_uri` lors de
   l'échange. Le code d'autorisation est à usage unique et n'est pas conservé
   après l'échange. Le refresh token est valide 14 jours et est renouvelé à
   chaque rafraîchissement réussi; tant que le script le rafraîchit
   régulièrement et enregistre le nouveau token, il ne finit pas par expirer.
   Le paramètre d'autorisation `access_duration=24` accorde un consentement de
   24 mois; il ne change pas la durée de vie du code lui-même. Si l'échange
   échoue, vérifiez d'abord que le `redirect_uri` correspond caractère par
   caractère à celui utilisé pour générer le code; sinon, relancez
   l'autorisation et échangez le nouveau code sans délai.
4. Cliquez sur **Activer l'actualisation toutes les 15 min**. Les lectures
   utilisent l'API Basic Monitoring V2 de télémétrie `QUARTER_HOUR`, entre 10 h
   inclus et 17 h exclu (fuseau du projet Apps Script).

Le rafraîchissement est limité à un appel API par tranche de 15 minutes, même
en cas d'erreur. Cela représente au plus 28 lectures par jour, soit 868 appels
sur un mois de 31 jours, hors échanges OAuth. La boucle de commande lit une
valeur mise en cache; le surplus net est calculé à partir de la télémétrie
compteur (`exportPower - importPower`). Une mesure de plus de 30 minutes est
considérée comme périmée et vaut zéro. Le flux de puissance live V2 n'est pas
utilisé car il requiert Business Pro ou Enterprise.

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
