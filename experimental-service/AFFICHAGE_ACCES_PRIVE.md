# Avatar — affichage du parcours et accès privé préparés

Jalon du 18 octobre 2026. Branche existante `feat/avatar-interactive-local`.
Statut : préparation et essais hors ligne uniquement ; aucun hébergement ni appel
au backend catalogue ou à OpenAI activé par ce jalon.

## Affichage

`pathway-result.mjs` partage le contrôle des réponses entre l’adaptateur serveur
et `pathway-result-view.mjs`. Le rendu conserve les étapes recommandées (et l’ancien
champ `steps`), les compléments et les formations pour information dans des rubriques
distinctes, dans l’ordre reçu. Il présente justifications, durées, publics, liens
HTTPS officiels, limites du catalogue, abstention et résultat vide. Les durées et
mesures de consommation disponibles sont affichées sans recalcul de coût ni
réinterprétation des recommandations. Une absence de coût reste signalée.

Les textes utilisent `textContent`. Les liens sont contrôlés avant rendu et ouverts
avec `noopener noreferrer`. Les conditions d’accès restent à vérifier sur la fiche
officielle : l’affichage ne déduit pas l’éligibilité de la pertinence.

La simulation locale peut recevoir un paramètre **explicite** `pathwayPreview` à
`createLocalDemo()`. Aucun aperçu n’est configuré par la commande habituelle. Il
n’apparaît qu’après validation d’un parcours et consomme seulement le quota de
simulation existant. L’aperçu indique qu’il s’agit de données de test sans rapport
avec le profil confirmé ; aucune formation synthétique n’est une recommandation
réelle. La recherche ne reçoit pas cet aperçu. Les résultats ne sont pas persistés,
et une modification, actualisation ou nouvelle demande retire le résultat précédent.

Les modules d’affichage sont servis sur deux chemins locaux exacts uniquement
lorsqu’un aperçu est configuré ; aucun accès arbitraire aux fichiers n’est ajouté.
`index.html` public ne charge pas ces modules et conserve son fonctionnement simulé.

## Frontière d’accès privée, désactivée par défaut

`createPrivatePathwayHandler()` n’est importé par aucun serveur démarrable,
ne lit aucune variable d’environnement et n’écoute aucun port. Le mode par défaut
répond 503 sans authentification ni session. Aucun choix d’hébergement n’est implicite.

Une future intégration devra fournir explicitement :

- une origine HTTPS exacte et un proxy conservant le `Host` attendu ;
- un vérificateur d’identité `authenticate(req)` exécuté côté serveur, retournant
  une identité vérifiée ou un refus ; aucun en-tête utilisateur n’est considéré
  comme une preuve d’identité par le module ;
- une session unique déjà configurée selon `PLAN_ENVIRONNEMENT_TEST.md` : destinations,
  délais, activation, compteur privé persistant et plafonds de tentatives.

Le module prépare deux routes **non exposées à ce jour** :

- `GET /private/profile-references`, après authentification : référentiel et
  identifiant aléatoire généré côté serveur, lié à l’identité et à la révision,
  valable cinq minutes ; maximum de 32 confirmations en attente par instance ;
- `POST /private/pathway` : origine exacte, JSON limité à 16 000 octets,
  confirmation explicite et identifiant valide requis. L’identifiant est consommé
  avant le traitement et ne permet aucune relance automatique, même après erreur.

Pas de CORS ouvert, aucune identité/jeton/réponse mise en cache ou journalisée,
messages d’erreur génériques. L’arrêt bloque les entrées, invalide les confirmations
et appelle l’arrêt de la session. Une déconnexion HTTP annule le signal du consommateur
sans garantir l’arrêt du backend. Les identifiants sont en mémoire et perdus au
redémarrage ; le quota persiste dans la session. Ce mécanisme ne constitue pas une
idempotence du backend ni un plafond de dépense en USD.

Le module ne fournit **pas** de système de connexion : l’authentification réelle,
les testeurs autorisés, TLS, le débit en périphérie et les délais du proxy restent
à établir pour l’hébergement choisi. Aucun jeton partagé ne doit être ajouté à la
page. Le navigateur de l’avatar n’appelle pas ces routes privées à ce jalon.

## Vérification

84 tests Node réussis localement, aucun ignoré. Ils couvrent les 72 tests existants,
le rendu avec contenu hostile/liens dangereux, les formats historiques, les valeurs
inconnues, l’aperçu local explicite, l’accès refusé, les en-têtes usurpés, l’identité,
l’expiration, la capacité, les doublons, les erreurs, l’arrêt et un essai HTTP avec
la vraie session utilisant exclusivement un transport simulé.

Les [84 tests Node de la CI](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39156186306)
et le [contrôle Chromium](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39156186284)
réussissent au commit `d838d06894b49cfe21ba104849e6cf23f379caa5`.
Chromium 151.0.7922.34 a exercé cinq simulations confirmées, avec aperçu de résultat,
actualisation, correction, choix retiré et brouillon restauré, sans erreur navigateur
ni requête distante. Aucun débordement horizontal à 1280 × 900 et 390 × 844.
Neuf captures sont produites dans l’artefact `avatar-browser-simulation`
(rétention 14 jours). Les quatre captures de résultat/d’état final sur ordinateur
et mobile ont été examinées : rendu lisible, sans problème bloquant observé.
Ce contrôle ne couvre pas Safari, les appareils physiques, le clavier tactile,
un accès authentifié réel, le réseau institutionnel ou le moteur de production.

Coût OpenAI API : 0 token / 0 $.

## Prochaine étape

Choisir l’hébergement et son contrôle d’identité privé, puis préparer le navigateur
pour les échanges privés (délais longs, erreurs et conservation du brouillon).
Le premier appel réel nécessite un cas fictif, un plafond de tentatives, un suivi
de coût et une autorisation dédiée. Aucun déploiement ou changement Infomaniak ici.
