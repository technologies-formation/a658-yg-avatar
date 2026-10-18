# Référentiels du parcours : préparation du consommateur avatar

État au 18 octobre 2026, sur la branche `feat/avatar-interactive-local`.
Référence de départ avatar : `314123377070640f87a0b3f5d603fbf0f127b926`.
Source contractuelle : `technologies-formation/catalogue-formations`, contrat
`docs/PROFILE_REFERENCES.md` introduit par `bbc7ed9`.

## Réalisé et limites

- `profile-references.mjs` valide le contrat v1 et normalise les huit champs.
  Il vérifie le périmètre `pathway`, les types, les contraintes, la révision
  SHA-256 et les propriétés de validation qu'il sait appliquer.
- Le lecteur HTTP exige une URL HTTPS explicite `/api/profile-references` et une
  origine autorisée. Il ne lit aucune configuration privée à l'import et ne fournit
  aucune adresse par défaut. Le transport est injectable pour les tests.
- Le mode local peut charger un document généré par le code du catalogue, hors
  ligne et hors dépôt. Le questionnaire utilise alors ses choix, libellés,
  suggestions et limites. Les données métier ne sont pas recopiées dans le lecteur.
- Le rôle et l'objectif acceptent une chaîne non vide après trim. L'entité reste
  libre ; les options du formulaire ne sont pas transformées en liste fermée de l'API.
- Le simulateur, ses quotas et l'adaptateur de parcours utilisent cette validation
  dans le mode référencé. La simulation historique reste disponible séparément.
- L'adaptateur reste désactivé par défaut et n'est pas relié à la page ou au serveur
  de simulation. Il exige un référentiel revalidé et une révision confirmée avant
  un éventuel POST. Ce jalon n'envoie aucune demande à Luna ou à OpenAI.

La catégorie et la situation managériale sélectionnées doivent appartenir aux
options courantes du formulaire. Une valeur retirée provoque un refus et une
nouvelle sélection, sans conversion automatique entre catégories. Les propriétés
additives inconnues sont ignorées conformément au contrat ; une nouvelle version
majeure ou une sémantique inconnue est refusée.

## Cache, transport et confirmation

Le lecteur demande une revalidation à chaque `refresh()` et conserve en mémoire
le dernier document validé. Une réponse 304 n'est acceptée qu'avec un document et
un ETag cohérents ; une réponse 200 doit présenter un ETag égal à la révision.
L'empreinte est calculée sur `JSON.stringify({ schemaVersion: 1, pathway })`.
Elle vérifie la cohérence du document et n'est pas une authentification du serveur.

La taille est limitée à 128 Kio, avec contrôle du flux réel même sans Content-Length.
Le délai de lecture est de 5 secondes par défaut et borne aussi la lecture du corps.
Le lecteur refuse les redirections, n'envoie pas d'identifiants et gère l'annulation.
Une réponse ancienne ne peut pas remplacer la demande de rafraîchissement la plus récente.

Un échec laisse le document précédent en mémoire, mais le rend impropre à un envoi
réel (`getCurrent()` refuse cet état). Aucun âge de cache hors ligne n'est choisi
implicitement. L'adaptateur revalide avant une soumission confirmée et refuse une
révision différente. Cela ne crée pas de transaction avec le moteur : le serveur
ne négocie pas de révision attendue sur `POST /api/pathway` à ce jour.

Dans la simulation locale, une révision divergente est refusée avant quota. Les
réponses du questionnaire restent dans l'onglet et les corrections invalident les
anciens résultats sans lancer un nouvel envoi. La récupération automatique du
brouillon après rechargement de page et la mise à jour à chaud des choix ne sont
pas implémentées. Il faut conserver le brouillon avant un rechargement manuel.

## Validation effectuée

- **52 tests réussis**, aucun échec ni test ignoré, avec
  `node --test experimental-service/*.test.mjs`.
- Les 35 tests du jalon précédent restent couverts, notamment corrections,
  annulation, résultats obsolètes, quotas et protections du simulateur.
- Les nouveaux cas couvrent le contrat, les révisions, 200/304, taille, délais,
  annulation, demandes concurrentes, valeurs retirées, entités libres et les deux
  modes de validation formulaire/API.
- Le vrai script du questionnaire est exécuté dans un DOM de test, y compris les
  huit champs, les contraintes dynamiques, les valeurs optionnelles et la correction.
- Un contrôle croisé hors ligne a utilisé `buildProfileReferences()` du code du
  catalogue : huit champs acceptés, révision
  `68da05c1b2668874873373762cd10897b6cd26e31422c9c300ecedab5845a60d`.
  Cette révision est une observation datée, pas une constante exigée par le lecteur.
- Le lancement de Chromium a échoué, le binaire n'étant pas installé. Son
  téléchargement n'a pas fourni une archive exploitable. Aucune validation visuelle
  dans un navigateur réel n'est donc revendiquée pour ce jalon.

Ces contrôles sont techniques, fonctionnels simulés et de régression. Ils ne sont
pas un benchmark indépendant du moteur. Aucun appel OpenAI : 0 token / 0 $.

## Suite à cadrer

1. Vérifier visuellement ce questionnaire sur ordinateur et mobile dans un navigateur.
2. Préparer séparément la mise en service de l'endpoint de référentiels Infomaniak :
   le déploiement du 18 octobre n'a remplacé que `pathwayEngine.mjs`.
3. Définir le flux utilisateur d'actualisation des choix, la conservation du brouillon
   et la confirmation, puis le raccordement serveur de l'adaptateur existant.
4. Valider la destination, l'accès, les quotas/budget, la concurrence, les délais,
   les réponses et le réseau avant tout essai réel.

La publication de la branche d'essai ne remplace pas `main` et ne rend pas ce mode
disponible dans la démonstration publique. Aucun hébergement ou raccordement de
production supplémentaire n'est créé par cette préparation.
