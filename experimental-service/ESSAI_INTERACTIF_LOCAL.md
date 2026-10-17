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

Ouvrir **http://127.0.0.1:8799/** sur le meme ordinateur. Remplir le questionnaire et verifier la reponse « Service local : Requete validee sans appel API ».

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

## Jalon 1 : adaptateur historique prepare, non active

`pathway-adapter.mjs` prepare un appel serveur `POST /api/pathway` avec le profil
JSON directement dans le corps. Il n'est importe ni par `local-demo.mjs`, ni par
`server.mjs`, ni par la page. Le simulateur reste le seul fonctionnement expose.
La presence de ce module ne permet donc pas d'appeler le moteur depuis l'interface.

Reference du contrat etudie : `technologies-formation/catalogue-formations`, commit
`3efb6c40ec8c42229ccb30611d489aeb9f25fbd1`, interfaces `server/pathwayAssistant.mjs`,
`server/searchApi.mjs` et `src/components/PathwayAssistant.jsx`. L'implementation
Luna n'a pas ete reprise. Aucun catalogue ni moteur n'est duplique.

La fabrique `createPathwayAdapter()` est desactivee par defaut, sans URL ni secret.
Elle ne lit aucune variable d'environnement et n'effectue rien a l'import.
Une activation ulterieure exige un GO distinct puis une integration serveur avec :

- `enabled: true`, une URL HTTPS explicite dont le chemin est `/api/pathway`, sans
  identifiants, parametres ni fragment ; aucune adresse de production par defaut ;
- des listes `allowedPersonnelCategories`, `allowedEntities` et
  `allowedManagerStatuses` validees par le metier ; aucune conversion automatique
  entre `PU Police` et `POL`, par exemple. La liste des categories doit etre non vide.
  Les deux autres listes peuvent rester vides : une valeur renseignee sera alors refusee ;
- un transport HTTP, `fetchImpl` (fetch Node par defaut), et un delai `timeoutMs`
  compris entre 1 et 120 000 ms (10 000 ms par defaut) ;
- un appel `buildPathway(profile, { confirmed: true, signal })` uniquement apres
  confirmation explicite du profil. La confirmation est une precondition logicielle,
  pas une authentification ni une preuve de consentement cote serveur.

Les huit champs prepares sont `personnelCategory`, `entity`, `managerStatus`,
`role`, `objective`, `existingSkills`, `timeAvailable` et `constraints`. La categorie,
la fonction (minimum 2 caracteres) et l'objectif (minimum 10) sont obligatoires.
Les limites de longueur sont partagees avec le simulateur dans `profile-validation.mjs`.
Les champs inconnus, types invalides et valeurs de nomenclature non autorisees sont refuses
avant tout transport. Les champs optionnels vides sont omis, sans modifier le profil fourni.

Le resultat conserve les rubriques historiques : `recommendedSteps` ou `steps`,
`optionalSteps`, `informationalCourses`, les justifications, les liens et les limites.
Le module retourne `{ mode: 'historical-pathway', empty, result }` sans inventer
ni fusionner de cours. Un parcours valide sans cours donne `empty: true` ; une reponse
absente, non JSON ou mal formee est une erreur. Les liens fournis doivent etre HTTPS,
sans identifiants, sous `outils.ge.ch/referentiel/formation/` ; une absence de lien
reste autorisee comme dans l'interface historique. Ce controle ne prouve ni l'existence
actuelle d'une fiche ni l'eligibilite metier du cours : ces garanties restent au moteur.

Les erreurs `PathwayAdapterError` distinguent configuration, desactivation, profil
non confirme/invalide, nomenclature, annulation, delai, HTTP et reponse invalide.
Le statut HTTP est conserve, mais pas le corps d'erreur distant. Aucune relance ni
redirection automatique. Le delai couvre la reception et la lecture JSON ; le signal
d'annulation permet d'ignorer une reponse tardive. Une annulation ne garantit pas que
le serveur distant arrete un traitement deja lance ni qu'un cout soit evite.

Avant toute activation reelle restent a valider : nomenclatures, URL et politique de
liens, authentification, budgets/quotas, concurrence partagee avec le moteur, delai
compatible avec ses traitements, schema complet de reponse et presentation utilisateur.
L'integration devra conserver `requestRevision` : toute modification du profil invalide
la confirmation et les anciens resultats ; aucune correction ne doit lancer une recherche.
Le jalon actuel laisse ces mecanismes et l'interface entierement inchanges.

Les tests de l'adaptateur utilisent exclusivement des transports injectes et des
reponses synthetiques, avec un domaine `.invalid`. Ils n'appellent jamais le backend.
