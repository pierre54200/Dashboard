# Dashboard

Application web permettant à chaque utilisateur de construire son propre tableau de bord à partir de widgets connectés à des services externes (météo, GitHub, RSS, etc.). Les widgets sont configurables, se rafraîchissent automatiquement et peuvent être ajoutés, déplacés, reconfigurés ou supprimés.

Interface en thème sombre aux couleurs de Discord.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Services et widgets](#services-et-widgets)
- [Installation et lancement](#installation-et-lancement)
- [Utilisation](#utilisation)

## Fonctionnalités

- Inscription avec confirmation, connexion par identifiants et par OAuth 2.0 (compte tiers lié à un utilisateur existant)
- Section d'administration des utilisateurs (Django admin)
- Abonnement aux services, certains disponibles par défaut (météo), d'autres après connexion du compte
- Dashboard personnel : ajouter, reconfigurer, déplacer et supprimer des instances de widgets
- Plusieurs instances d'un même widget avec des configurations différentes
- Rafraîchissement automatique de chaque widget selon son propre intervalle
- Interface responsive et accessible
- Route `GET /about.json` décrivant les services et widgets disponibles

## Services et widgets

| Service | Widget | Paramètres | Authentification |
| --- | --- | --- | --- |
| weather | city_temperature | `city` (string) | Aucune |
| _à compléter_ | | | |

Pour un groupe de X étudiants, le sujet impose au moins 1 + X services et 3 × X widgets. Chaque widget doit avoir au moins un paramètre configurable.

## Installation et lancement

### Prérequis

- Docker
- Docker Compose

### Configuration

Copier le fichier d'exemple et renseigner les clés d'API :

```bash
cp .env.example .env
```

Le fichier `.env` n'est jamais versionné : aucune clé ni mot de passe ne doit apparaître dans le dépôt.

### Build et lancement

```bash
docker-compose build
docker-compose up
```

La base SQLite est stockée dans un volume Docker : les données sont conservées entre deux redémarrages et deux rebuilds.

| Service | Adresse |
| --- | --- |
| Client (Angular) | http://localhost:8081 |
| Serveur (API Django) | http://localhost:8080 |
| Administration | http://localhost:8080/admin |
| about.json | http://localhost:8080/about.json |

Créer un compte administrateur :

```bash
docker-compose exec server python manage.py createsuperuser
```

## Utilisation

1. Créer un compte puis confirmer l'inscription.
2. Se connecter.
3. Depuis le profil, s'abonner aux services voulus (connexion OAuth si nécessaire).
4. Sur le dashboard, cliquer sur **Ajouter un widget** : choisir le type, le configurer, régler l'intervalle de rafraîchissement, valider.
5. Glisser-déposer un widget pour le déplacer, utiliser son menu pour le reconfigurer ou le supprimer.