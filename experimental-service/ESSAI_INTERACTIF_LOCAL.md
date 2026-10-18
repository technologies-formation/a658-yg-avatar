# Essai interactif local de l'avatar V5

Ce mode est independant de Luna et de l'API OpenAI. Il sert l'interface V5 sur une adresse locale et valide les demandes avec le garde-fou de simulation existant. Le secret est genere en memoire par le serveur et n'est jamais transmis au navigateur.

## Preconditions

- Node.js 22 ou version plus recente installe sur l'ordinateur de test.
- Depot `a658-yg-avatar` recupere localement, branche `feat/avatar-interactive-local`.
- Aucun abonnement ni hebergement supplementaire.

## Demarrage

Depuis la racine du depot, dans un terminal :

- macOS / Linux : `AVATAR_TEST_ENABLED=true node experimental-service/local-demo.mjs`
- Windows PowerShell : `$env:AVATAR_TEST_ENABLED='true'; node experimental-service/local-demo.mjs`

Ouvrir **http://127.0.0.1:8799/** sur le meme ordinateur. Remplir le questionnaire ; en mode référencé, vérifier le récapitulatif et cliquer sur **Confirmer le profil et simuler**. Verifier ensuite la reponse « Service local : Requete validee sans appel API ».

Le service refuse toute validation si `AVATAR_TEST_ENABLED` n'est pas `true`. Pour l'arreter, utiliser Ctrl+C dans le terminal. Les quotas de simulation sont limites par defaut a **5 demandes par jour et 20 au total** et sont enregistres dans `~/.a658-yg-avatar-local-quotas.json`. Ce fichier reste prive sur l'ordinateur ; ne pas le publier dans Git.

## Limites

- La page publique GitHub Pages reste inchangée.
- L'essai est limite a l'ordinateur local ; pas d'acces depuis un autre poste.
- Aucune formation reelle n'est recherchee, aucun parcours reel n'est genere.
- Le mode local n'utilise pas le jeton Bearer du service experimental expose sur `/test/request` : il utilise un jeton genere cote serveur uniquement.
- Le controle d'origine bloque les requetes provenant d'autres sites. Ce mode n'est **pas** destine a etre publie sur Internet.
- Les quotas sont globaux au processus, pas par utilisateur. Ils ne constituent pas un plafond de depense API.
- Si le port 8799 est deja utilise, arreter le service qui l'utilise avant le demarrage.

## Verification automatique

`node --test experimental-service/*.test.mjs`

Aucune connexion externe n'est necessaire pour ces tests.

## Jalon du 18 octobre : contrat des référentiels

Le mode avec référentiel est décrit dans [REFERENTIELS_PARCOURS.md](REFERENTIELS_PARCOURS.md).
Il charge un document produit par le catalogue, valide sa version et son empreinte,
puis en déduit les choix, contraintes et huit champs du questionnaire. Il n'utilise
pas les listes historiques du simulateur comme référentiel métier.

Pour préparer le fichier **hors ligne**, depuis le dépôt catalogue, à une révision
contenant `server/profileReferences.mjs` :

```bash
node --input-type=module -e "import {writeFileSync} from 'node:fs'; import {buildProfileReferences} from './server/profileReferences.mjs'; writeFileSync('../avatar-profile-references.json', JSON.stringify(buildProfileReferences()))"
```

Conserver ce fichier de session hors des dépôts et ne pas le modifier à la main.
Depuis le dépôt avatar, activer ce mode avec le chemin du fichier :

```bash
AVATAR_PROFILE_REFERENCES_FILE=../avatar-profile-references.json AVATAR_TEST_ENABLED=true node experimental-service/local-demo.mjs
```

Sous PowerShell :

```powershell
$env:AVATAR_PROFILE_REFERENCES_FILE='../avatar-profile-references.json'
$env:AVATAR_TEST_ENABLED='true'
node experimental-service/local-demo.mjs
```

Le serveur local n'appelle aucune adresse distante. Un fichier absent, incompatible
ou incohérent provoque un refus de démarrage, sans retour silencieux aux anciennes
listes. Le questionnaire présente la catégorie, l'entité libre avec suggestions,
la situation managériale et les autres champs. Les champs facultatifs peuvent
rester vides ; les contraintes viennent du document chargé. Une révision de
simulation différente de celle du serveur est refusée avant consommation du quota.
Le bouton **Actualiser les choix** relit le même fichier côté serveur sans
rechargement de page ni appel distant. Régénérer ce fichier avec le générateur
canonique pour tester une évolution ; ne pas le modifier à la main. Le serveur
vérifie aussi ce fichier avant chaque simulation et refuse un fichier devenu invalide.

Les réponses et la saisie en cours sont restaurées après rechargement dans le même
onglet (`sessionStorage`). Aucun résultat ni confirmation n'est restauré. Recommencer
efface le brouillon ; une correction non enregistrée n'est pas sauvegardée. Si le
stockage du navigateur est bloqué, un message invite à garder la page ouverte.

Après une actualisation, vérifier les réponses marquées **À revérifier**, corriger
les valeurs retirées ou devenues trop longues, puis confirmer explicitement. Une
entité libre et les autres réponses restent conservées. Une actualisation échouée
bloque la confirmation sans effacer le profil ; réessayer l'actualisation. Aucun
envoi de simulation ni quota n'est consommé par une correction ou une actualisation.

Sans `AVATAR_PROFILE_REFERENCES_FILE`, le mode de démonstration historique reste
accessible en simulation avec ses limites locales anciennes. Ce mode n'alimente
jamais l'adaptateur de parcours et ne constitue pas un repli pour un envoi réel.

## Adaptateur de parcours : toujours préparé et désactivé

`pathway-adapter.mjs` n'est importé ni par `local-demo.mjs`, ni par `server.mjs`,
ni par la page. Il ne connecte donc pas le questionnaire au moteur. Aucune
activation réelle n'est réalisée par ce jalon.

L'adaptateur conserve l'URL explicite HTTPS `/api/pathway`, l'interdiction des
redirections, l'annulation, le délai de réception et lecture JSON, ainsi que le
contrôle des catégories de résultats et des liens officiels. Aucun moteur ou
catalogue de cours n'est dupliqué et aucune destination de production n'est fournie.

Les anciennes listes `allowedPersonnelCategories`, `allowedEntities` et
`allowedManagerStatuses` sont remplacées par un `referencesClient` explicitement
fourni. Pour une activation future, il devra revalider le contrat avant chaque
soumission et vérifier que sa révision correspond au profil confirmé :

```js
const reader = createProfileReferencesClient({ endpoint, allowedOrigins })
const adapter = createPathwayAdapter({ enabled: true, endpoint: pathwayEndpoint, referencesClient: reader })
// Configuration et activation réelles à cadrer séparément.
await adapter.buildPathway(profile, { confirmed: true, referenceRevision, signal })
```

Une révision modifiée nécessite une nouvelle sélection/confirmation ; un cache
indisponible ou incompatible bloque l'envoi sans effacer le profil. Les suggestions
d'entités restent des suggestions et une entité libre est acceptée. La catégorie
est obligatoire dans le questionnaire ; l'API conserve sa validation propre.
Il n'y a pas de minimum local de 2 caractères pour le rôle ni de 10 pour l'objectif
dans le mode référencé ou l'adaptateur : des chaînes non vides après trim suffisent.

L'adaptateur conserve un délai parcours de 10 secondes par défaut, configurable
jusqu'à 210 secondes. Ce défaut reste à ajuster explicitement avant toute activation
réelle, car le moteur peut prendre plus de temps. Une annulation côté client ne
prouve pas l'arrêt d'un traitement serveur ni l'absence de coût.

Les tests de l'adaptateur utilisent uniquement des référentiels, transports et
réponses synthétiques. L'identité des testeurs, l'accès distant, la concurrence,
les quotas et le budget réels, et le schéma complet des résultats restent à cadrer avant raccordement. Le référentiel
Infomaniak a été vérifié accessible le 18 octobre ; cette disponibilité ne raccorde
pas automatiquement le simulateur local au backend.

La préparation serveur `pathway-session.mjs` est décrite dans
[PLAN_ENVIRONNEMENT_TEST.md](PLAN_ENVIRONNEMENT_TEST.md). Elle exige un délai et des
quotas explicites, réserve les tentatives dans un fichier privé persistant et
refuse concurrence et relances du même identifiant dans l'instance. Elle reste
désactivée par défaut, sans route ni import par ce simulateur. Aucune variable
d'environnement de ce mode local ne l'active.
