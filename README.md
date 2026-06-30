# Fetchr Server Manager

> **Outil de gestion tout-en-un pour Fetchr** : Serveur, Git, Docker, Stripe, Cloudflare.

---

## Fonctionnalités

- **Tableau de bord** : Affichage des statistiques en temps réel (CPU, RAM, Disk, Uptime).
- **Statistiques Business** : Nombre de ventes, revenus, abonnements (Stripe) et visites (Cloudflare).
- **Déploiement Git** : Push/Pull automatique vers GitHub.
- **Gestion Docker** : Recomposer, redémarrer, arrêter les conteneurs.
- **Terminal SSH** : Exécuter des commandes directement sur le serveur.
- **Configuration** : Gérer les clés API (SSH, Stripe, Cloudflare).

---

## Installation

### 1. Prérequis
- Node.js (v16 ou supérieur)
- npm ou yarn
- Une **clé SSH privée** pour se connecter à ton serveur (`fetchr.fr`)
- Une **clé API Stripe** (pour les statistiques de ventes)
- Un **token API Cloudflare** + **Zone ID** (pour les statistiques de visites)

### 2. Cloner le dépôt
```bash
git clone git@github.com:Horzyon/fetchr-server-manager.git
cd fetchr-server-manager
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Configurer l'application

Copie le fichier `config.example.json` en `config.json` :
```bash
cp config.example.json config.json
```

Édite `config.json` avec tes identifiants :
```json
{
  "server": {
    "host": "fetchr.fr",
    "port": 22,
    "username": "root",
    "privateKeyPath": "~/.ssh/id_rsa"
  },
  "stripe": {
    "apiKey": "sk_live_..."
  },
  "cloudflare": {
    "apiToken": "ton_api_token_cloudflare",
    "zoneId": "0da42c8d2132a9ddaf714f9e7c920711"
  }
}
```

---

## Lancement

### Mode Développement (Navigateur)

1. Démarre le backend :
```bash
node main.js
```
2. Ouvre `index.html` dans un navigateur.

### Mode Electron (App Desktop)

```bash
npm run electron
```

---

## Endpoints API (Backend)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/stats | Récupère toutes les statistiques |
| POST | /api/ssh | Exécute une commande SSH |
| POST | /api/git | Exécute une action Git (push/pull) |
| POST | /api/docker | Gère Docker (recomposer, redémarrer) |

---

## Sécurité

- Ne partage jamais ton fichier `config.json` (il contient tes clés privées !).
- `config.json` est dans le `.gitignore`.
- Utilise des variables d'environnement en production :
```bash
export STRIPE_API_KEY="sk_live_..."
export CLOUDFLARE_API_TOKEN="ton_api_token"
export CLOUDFLARE_ZONE_ID="0da42c8d2132a9ddaf714f9e7c920711"
```

---

## Licence

MIT
