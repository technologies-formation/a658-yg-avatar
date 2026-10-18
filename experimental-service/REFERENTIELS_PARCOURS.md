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
anciens résultats sans lancer un nouvel envoi.

### Brouillon, actualisation et confirmation : second jalon du 18 octobre

Le mode référencé attend désormais le bouton **Confirmer le profil et simuler**
après la dernière réponse. Une correction, une actualisation ou un rechargement
annule toute confirmation antérieure ; aucun de ces événements ne simule automatiquement.
Une simulation en cours ne peut pas être confirmée une seconde fois ; sa réponse
est ignorée si le profil a changé entre-temps.

Le brouillon est sauvegardé dans `sessionStorage`, pour cet onglet et cette origine
locale seulement : réponses, codes des choix, étape et saisie en cours. Les résultats,
jetons et confirmations ne sont jamais sauvegardés. **Recommencer** ou **Nouvelle demande**
efface le brouillon. Un stockage indisponible laisse le formulaire utilisable avec
un message explicite. Une correction non enregistrée n'est pas restaurée ; les
réponses précédemment enregistrées et la saisie interrompue sont conservées.

**Actualiser les choix** relit uniquement le document du serveur local, avec un délai
de cinq secondes. Le serveur valide version, empreinte et taille du fichier configuré
avant de le fournir. Il n'appelle pas Infomaniak. Les valeurs sont conservées sous
leur code, ce qui permet un changement de libellé sans perdre la sélection. Une
valeur retirée ou une limite réduite reste visible avec **À revérifier** ; la
confirmation est bloquée jusqu'à correction. Les champs facultatifs laissés vides
restent modifiables depuis le récapitulatif. Un échec d'actualisation garde les
réponses mais bloque la confirmation jusqu'à une actualisation réussie.

Le serveur relit le document avant chaque simulation. Une révision divergente (409),
un référentiel indisponible (503) ou une confirmation manquante sont refusés avant
quota. Les quotas restent ceux du même garde-fou, sans remise à zéro lors d'une
actualisation. Le booléen de confirmation est un contrôle de flux de simulation,
pas un mécanisme d'authentification ni une activation de l'adaptateur réel.

## Validation effectuée

- **60 tests réussis**, aucun échec ni test ignoré, avec
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
- Le contrôle navigateur du 18 octobre a ensuite réussi sur le runner GitHub :
  [exécution 39140642621](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39140642621),
  commit `9670b6fd58b9b196205d25c4178b9ffffbaa9053`, Chromium 151.0.7922.34.
  Les quatre captures initiales/finales ont été examinées en formats 1280 × 900
  et 390 × 844 : aucun débordement horizontal ni problème bloquant observé.
  Le questionnaire, les champs facultatifs, l'entité libre et sa correction
  fonctionnent ; une correction invalide la simulation sans nouvel envoi automatique.
  Trois requêtes de simulation, quota de trois, aucune erreur navigateur et aucune
  requête externe ont été relevés. Le moteur réel reste déconnecté.
  Les captures et mesures sont dans l'artefact `avatar-browser-simulation`, conservé
  14 jours. Ce contrôle Chromium ne couvre pas Safari, les appareils physiques,
  le clavier tactile ni le réseau institutionnel.

Ces contrôles sont techniques, fonctionnels simulés et de régression. Ils ne sont
pas un benchmark indépendant du moteur. Aucun appel OpenAI : 0 token / 0 $.

Le second jalon ajoute huit cas : confirmation, brouillon restauré ou corrompu,
stockage indisponible, changement de libellé, retrait de choix, contraintes réduites,
échec d’actualisation, réponse tardive, 409 et conservation des quotas.

Le contrôle du nouveau flux a réussi au commit `045a0c48b5ca77831a0c6316f64de09fe8071dc7` :
[Chromium 39142566949](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39142566949)
et [60 tests Node 39142566897](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39142566897).
Les sept captures ont été examinées en 1280 × 900 et 390 × 844 : saisie, confirmation,
restauration, retrait de choix, correction et fin de simulation sont utilisables.
Le défilement mobile garde la fin de l'échange visible quand le récapitulatif s'ouvre.
Cinq simulations explicitement confirmées, quota de cinq, aucune erreur navigateur,
aucune requête externe et aucun débordement horizontal. La zone de saisie est masquée
pendant la vérification du profil et les réponses facultatives vides sont affichées
« Non renseigné ». Les captures et mesures sont dans `avatar-browser-simulation`,
rétention de 14 jours. Les limites Chromium du premier jalon restent applicables :
pas de test Safari, appareil physique, clavier tactile ou réseau institutionnel.

## Suite à cadrer

1. Le nouveau flux de confirmation et de reprise est vérifié dans Chromium ordinateur/mobile.
2. Le référentiel Infomaniak est déjà opérationnel : relevé SSH et contrôles HTTP
   200/304/CORS vérifiés le 18 octobre ; voir le guide de reprise du catalogue.
   Le mode local reste hors ligne et consomme son fichier explicitement configuré.
3. Le raccordement serveur est préparé dans `pathway-session.mjs`, sans activation,
   route ou import par le simulateur ; voir [le plan](PLAN_ENVIRONNEMENT_TEST.md).
   Délai et quotas explicites, profil figé, revalidation avant réservation, instance
   unique et compteurs persistants sont testés avec des transports simulés.
4. Valider la destination, l'accès, les quotas/budget, la concurrence, les délais,
   les réponses et le réseau avant tout essai réel.

La publication de la branche d'essai ne remplace pas `main` et ne rend pas ce mode
disponible dans la démonstration publique. Aucun hébergement ou raccordement de
production supplémentaire n'est créé par cette préparation.
