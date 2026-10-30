# Accès individuel du pilote avatar — préparation du 18 octobre 2026

> État courant au 30 octobre 2026 : voir [Assistant formation — référence avant pilote](../GUIDE_REPRISE.md). Assistant installé `13fd45b`, affinement RH/absences + OPE sans entité DIP-SEM vérifié par l’opérateur, quatre accès préparés et zéro testeur activé. Les étapes datées ci-dessous restent historiques ; le pilote du groupe n’est pas ouvert.

> Jalon historique : les constats ci-dessous décrivent cette étape. La page et le serveur HTTPS local ont depuis été assemblés en simulation ; voir [SERVEUR_PRIVE_SIMULATION.md](SERVEUR_PRIVE_SIMULATION.md). Aucun déploiement distant ni raccordement réel n’en découle.

Statut : préparé sur la branche d’essai, désactivé par défaut et non déployé.
Aucun compte réel créé, aucun achat, aucun changement Infomaniak, aucun appel OpenAI.

## Constat et choix de préparation

Le Manager montré par l’utilisateur affiche un site Node.js et une option grisée
« Protection des dossiers ». Au survol, l’infobulle indique « Vous n’avez aucun site ».
La protection n’est donc pas utilisable dans la configuration observée. Ce constat
ne démontre pas une impossibilité pour toutes les offres Infomaniak.

| Solution examinée | Bénéfice | Limite et décision de préparation |
| --- | --- | --- |
| Protection gérée par l’hébergeur | Peu de code d’authentification à maintenir | Indisponible dans le Manager observé ; ne pas supposer qu’elle protège les routes Node.js |
| Connexion institutionnelle ou fournisseur OIDC externe | Identités et mécanismes de connexion gérés par un fournisseur | Aucun fournisseur, tenant ou compte de service établi pour ce projet ; cadrage supplémentaire avant un accès élargi |
| HTTP Basic individuel sous HTTPS, vérifié côté serveur | Protocole navigateur standard, aucune dépendance ni service supplémentaire, réutilise la frontière d’accès préparée | Retenu pour préparer un petit pilote ; limites ci-dessous, aucune activation ni certification de sécurité de production |
| Simulation locale sans accès distant | Déjà disponible et sans nouveau risque de déploiement | Conservée comme solution de repli ; ne répond pas seule à un essai distant |

Il s’agit d’un choix pour la préparation du pilote, pas d’un choix définitif pour
un service public ou institutionnel. L’hébergement cible privilégié reste un site
d’essai Node.js distinct du catalogue sur Infomaniak ; sa disponibilité dans l’offre,
son prix éventuel et ses garanties restent à vérifier avant toute création.
Aucun sous-domaine n’est réservé, aucun site n’est créé, aucun coût n’est présumé nul.

## Composants préparés

- `pilot-auth.mjs` : génération en mémoire d’un enregistrement de compte salé et
  vérification des identifiants HTTP Basic. Désactivé par défaut. Pas de lecture
  d’environnement, de fichier ou de serveur lancé par import.
- `pilot-private.mjs` : assemblage avec les routes privées et la session existantes.
  Il n’est importé par aucun serveur démarrable. La désactivation n’exige ni compte
  ni fichier et ne provoque aucune authentification ou requête moteur.
- Le vérificateur d’identité existant reçoit désormais `(req, res)` ; le second
  argument permet le défi HTTP `WWW-Authenticate`. Les vérificateurs précédents
  à un argument restent compatibles. Les routes et leurs confirmations sont conservées.

Le navigateur utilisera son dialogue standard d’identification. Le code de l’avatar
ne contient ni identifiant réel, ni mot de passe, ni jeton partagé. Les en-têtes
Authorization ne sont jamais transférés au backend catalogue par l’adaptateur.
Le futur serveur devra protéger aussi la page et ses modules avant leur exposition :
le présent assemblage ne sert encore que les deux routes privées déjà préparées.

## Protections et limites exactes

Les comptes sont individuels (10 au maximum par fabrique) et figés au chargement.
Chaque enregistrement contient un identifiant stable, un nom de connexion,
un sel aléatoire de 16 octets et une empreinte scrypt de 32 octets. Le mot de passe
n’est pas conservé dans l’enregistrement. Le coût scrypt est fixé à `N=32768, r=8,
p=3`, mémoire maximale de 64 Mio : variante OWASP d’environ 32 Mio, à mesurer sur
l’hébergement cible. Une comparaison de longueur fixe utilise `timingSafeEqual`.
Le générateur exige au moins 16 caractères, au plus 1 024 octets UTF-8 et refuse les
caractères de contrôle ; aucune troncature silencieuse du mot de passe.

L’activation exige un prédicat `isSecureRequest(req)` attestant TLS. Le seul en-tête
`X-Forwarded-Proto` fourni par un client ne constitue pas une preuve. En terminaison
TLS par proxy, vérifier la chaîne de confiance, le comportement des en-têtes et
l’absence de contournement direct avant déploiement. Un prédicat constant `true`
est réservé aux tests simulés et ne doit jamais être copié dans le déploiement.
HTTP Basic encode les identifiants en Base64, sans chiffrement : HTTPS doit couvrir
tout l’accès et le port interne ne doit pas être directement exposé. Cette solution
reste moins appropriée qu’un fournisseur d’identité pour un service élargi.

Les vérifications ont une limite globale d’instance, explicitement configurée par
`maxAttempts` et `windowMs` : les succès consomment aussi cette limite. Une seule
vérification scrypt est exécutée à la fois ; des demandes simultanées avec les mêmes
identifiants partagent cette vérification, les autres sont refusées sans file.
Un nom inconnu subit une dérivation comparable. Les en-têtes sont bornés et les
formats Base64/UTF-8 ambigus sont refusés. Aucun cache de succès, mot de passe,
profil ou réponse métier n’est créé par l’authentification. Les refus utilisent le
même statut 401 ; un refus de capacité ajoute `Retry-After`. La limite globale peut
gêner les autres testeurs sous attaque : ce n’est pas une protection distribuée.
Aucune confiance dans une IP issue d’un en-tête n’est nécessaire au compteur.

`revoke(id)` bloque ce compte, y compris une vérification en cours. `stop()` bloque
l’authentification et arrête la session de parcours. Révocations, confirmations et
limites d’authentification sont en mémoire et ne survivent pas au redémarrage ;
les compteurs de **parcours** restent persistants dans la session existante.
Avant un déploiement, retirer un compte révoqué de la configuration privée durable
et recharger le processus ; ne pas présenter la révocation mémoire comme durable.

Il n’y a ni MFA, ni récupération de mot de passe, ni gestion d’inscriptions publiques.
Le navigateur peut garder les identifiants en mémoire : la déconnexion immédiate
universelle n’est pas garantie par HTTP Basic. Pour un pilote, la révocation serveur
reste la référence. Les mots de passe individuels sont à générer et remettre hors
Git, hors URL, hors chat et hors journaux. Le fichier de comptes futur doit rester
hors racine Web et dépôt ; aucune procédure de provisionnement n’est encore activée.

Ce contrôle côté application remplace, pour la préparation de ce petit pilote,
l’hypothèse initiale d’un proxy d’identité extérieur au processus. Il intervient
avant les référentiels et les parcours, mais ne remplace pas la protection du
reverse proxy, ses limites de débit, TLS ou l’isolation de l’hébergement.

## Tests

93 tests Node passent localement, y compris les 84 tests existants. Les neuf cas
supplémentaires couvrent comptes/empreintes, refus, mauvais identifiants, formats,
TLS attesté, débit, concurrence, révocation, arrêt et assemblage HTTP avec moteur
simulé. Aucun compte réel ni appel au backend catalogue n’est utilisé.

Les [93 tests Node de la CI](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39157868026)
et le [contrôle Chromium](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39157868062)
réussissent au commit `fcaab9d030e541e1cd9f3113c0368e13ebdfb03b`.
Le rapport de l’artefact `avatar-browser-simulation` a été relu : Chromium
151.0.7922.34, TLS local réel, anonyme 401, authentifié 200, doublon 409,
révoqué 401, arrêté 503 ; un parcours simulé seulement pour cet essai d’accès.
L’acceptation du certificat auto-signé est limitée au contexte local de test et
ne sera pas une option de déploiement. Aucun appel distant ni erreur navigateur.
Les scénarios de l’interface passent en régression : cinq simulations, brouillon,
confirmation, correction et choix retiré ; aucun débordement horizontal à 1280 × 900
et 390 × 844. Artefact conservé 14 jours. Les captures de ce jalon n’ont pas été
réexaminées visuellement ; le dernier examen détaillé reste celui du jalon précédent.
Ces résultats ne valident ni le proxy Infomaniak, ni les appareils physiques,
ni le réseau institutionnel, ni une connexion à un moteur ou compte réels.

Coût OpenAI API : 0 token / 0 $. Le quota Codex est distinct.

## Avant activation — point de reprise

1. Préparer le serveur d’essai et les échanges du navigateur en simulation avec
   accès individuel ; protéger page, modules et API sur une même origine.
2. Vérifier dans l’offre Infomaniak un site Node.js séparé et les coûts éventuels,
   TLS, le proxy de confiance, les délais et la persistance privée des fichiers.
3. Préparer le provisionnement et la révocation durable hors dépôt, désigner les
   testeurs, fixer les plafonds, limiter le débit et vérifier l’isolation des ressources.
4. Autoriser séparément le déploiement, puis le premier appel réel avec cas fictif,
   plafond de tentatives, suivi de coût et procédure de coupure.

Aucun identifiant ni délai réel d’hébergement n’est déduit des tests locaux.
Le catalogue de production, sa configuration privée et le moteur restent inchangés.

## Sources consultées le 18 octobre 2026

- [Infomaniak — protection des dossiers](https://www.infomaniak.com/fr/support/faq/68/securiser-lacces-web-par-mot-de-passe) : décrit la protection Web ; ne prouve pas sa disponibilité pour notre site Node.js.
- [Infomaniak — sites Node.js](https://www.infomaniak.com/fr/support/faq/2537/creer-un-site-nodejs-chez-infomaniak) : création et gestion de sites, sans preuve du contenu ou du prix de notre offre.
- [RFC 7617 — HTTP Basic](https://www.rfc-editor.org/rfc/rfc7617) : protocole et limites de confidentialité.
- [Node.js 24 — crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) : scrypt, génération aléatoire et comparaison.
- [OWASP — stockage des mots de passe](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) : variantes scrypt et compromis mémoire/calcul.


## Mise à jour du 30 octobre — quatre accès individuels préparés

Les composants sont désormais utilisés par l’Assistant hébergé. Le plan de préparation du 18 octobre ci-dessus reste historique. `provision-testers.mjs --create` a été exécuté sur l’hébergement ; le contrôle opérateur constate « préparation présente » et **zéro testeur activé**. Les comptes existants restent conservés. Aucun accès anonyme ni inscription par mail n’est ouvert.

La préparation crée `pilote-01` à `pilote-04`, quatre mots de passe distincts générés localement, une sauvegarde des comptes et leur version future, dans un dossier privé 0700/fichiers 0600. Le marqueur `tester-batch.json` indique ce dossier. Ne pas refaire `--create` pour retrouver la sortie du terminal ; ne pas exposer le contenu des fiches. `--activate` reste distinct et requiert ensuite un redémarrage. Une modification intervenant entre préparation et activation provoque un refus, sans écraser les comptes. `--disable` vise seulement un compte marqué testeur et doit être suivi d’un redémarrage ; historique et compteurs ne sont pas effacés.

La concurrence actuelle de l’authentification utilise au plus deux dérivations scrypt simultanées, avec huit empreintes de demandes en attente au maximum et coalescence des identifiants identiques. Elle remplace la limite historique d’une seule dérivation sans file. La limite de tentatives d’authentification, les refus de transport et les protections scrypt restent appliqués.

Par testeur : dix messages IA et trois recherches/parcours combinés par jour Europe/Paris par défaut, réservations durables avant appel. Le mode opérateur sans plafond et son suivi restent distincts. Ces limites ne sont pas un plafond de dépense en USD. Voir le [guide actuel](../GUIDE_REPRISE.md) pour le jalon, la sauvegarde, la remise individuelle et les conditions avant activation.


## Activation confirmée et consigne à installer

L’opérateur a activé les quatre comptes, redémarré le service et confirmé le contrôle HTTPS puis la connexion de pilote-01. Le rapport privé constate les limites 10 messages IA et 3 recherches/parcours par jour et l’ouverture sans tentative IA consommée. Les trois autres connexions individuelles restent à vérifier. Les anciennes mentions « non activé » décrivent les étapes antérieures.

Le lot suivant ajoute la validation obligatoire de la consigne de confidentialité par compte testeur avant les échanges. Il autorise les besoins réels de formation et remplace pour ces comptes l’ancienne demande de données uniquement fictives. L’accord persistant, séparé des quotas et protégé en 0600 dans un dossier 0700, est contrôlé côté serveur ; voir le guide actuel. L’installation de ce lot est distincte de l’activation des comptes déjà réalisée. Ne pas relancer la préparation ni réactiver le lot pour installer ce changement.
