# A658-YG Avatar — préparation de l'environnement d'essai

Statut : **préparation uniquement, aucun déploiement autorisé par ce document**.

## État vérifié

- Avatar public : GitHub Pages, fichier `index.html`, sans appel au moteur.
- Service de simulation : `experimental-service/server.mjs`, Node.js, aucune dépendance externe.
- Tests automatiques : `experimental-service/server.test.mjs`, workflow `avatar-tests.yml`. Le workflow du commit `c5b6872` a réussi.
- Route locale unique : `POST /test/request`. Aucune route de recherche ou de parcours réelle.
- Démarrage par défaut : liaison `127.0.0.1`, accès désactivé tant que `AVATAR_TEST_ENABLED` n'est pas `true`.

## Architecture de test recommandée

**Phase 1 (sans exposition réseau)** : une seule instance Node.js, lancée sur une machine de test, avec le port lié à `127.0.0.1`. Les demandes sont envoyées par un client local contrôlé, jamais depuis la page GitHub Pages. Le jeton est une variable d'environnement côté serveur et ne doit pas figurer dans Git, dans l'URL, dans un navigateur public ou dans les journaux.

**Phase 2 (à valider séparément)** : pour des testeurs distants, placer le service derrière un contrôle d'identité géré côté serveur (par exemple proxy d'authentification / accès réseau privé), avec HTTPS et journalisation limitée. Ne pas ouvrir directement le port Node.js sur Internet. L'hébergement reste **à choisir** après vérification des capacités de l'environnement institutionnel.

## Paramètres de la phase locale

- `AVATAR_TEST_TOKEN` : secret aléatoire d'au moins 32 caractères, fourni hors dépôt.
- `AVATAR_TEST_STATE_FILE` : chemin absolu d'un fichier de quotas dans un répertoire privé, persistant et sauvegardé.
- `AVATAR_TEST_ENABLED` : `true` uniquement pendant une session autorisée ; toute autre valeur bloque les demandes.
- `AVATAR_TEST_PORT` : facultatif, 8799 par défaut.
- Quotas par défaut : 5 demandes par jour, 20 au total **par instance**, et non par testeur.

## Vérifications obligatoires avant essai distant

1. Définir la population de testeurs et l'identité de chaque testeur, sans jeton partagé exposé.
2. Garantir une seule instance ou remplacer le stockage fichier par un compteur transactionnel partagé. Le fichier actuel n'est **pas** sûr contre des écritures concurrentes multi-processus.
3. Garantir la conservation du fichier de quotas lors des redémarrages et des déploiements. Tester le refus d'accès si le stockage échoue.
4. Mettre en place TLS, contrôle d'accès avant Node.js, limitation de débit en périphérie, supervision et procédure de coupure.
5. Vérifier les données transmises : pas de secrets ni d'informations personnelles inutiles dans les journaux.
6. Ajouter les tests de sécurité du déploiement choisi : redémarrage, coupure, authentification, accès refusé, quota épuisé.
7. Ne connecter Luna qu'après validation distincte du plafond budgétaire, de la facturation et de la séparation des ressources avec la production.

## Limites connues et décisions non prises

- Le jeton Bearer actuel est un mécanisme **local de démonstration**, pas une solution de connexion pour un navigateur public.
- Les quotas actuels ne sont pas individualisés par utilisateur et ne constituent pas un plafond de dépense API.
- L'arrêt d'urgence via `AVATAR_TEST_ENABLED` nécessite la modification de l'environnement du processus ; une coupure distante immédiate n'est pas encore implémentée.
- Le service n'effectue aucun appel Luna. L'existence de tests verts ne prouve ni la sécurité d'un hébergement futur ni une intégration fonctionnelle au moteur.
- Aucun fournisseur d'hébergement, URL, secret, compte testeur ou budget n'est défini à ce stade.

## Point de contrôle

Ne pas activer de déploiement public, de passerelle distante, de connexion au backend de production ou d'appel OpenAI API sans validation explicite du périmètre correspondant.
