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
- Aucun hébergement de l'avatar connecté, secret d'accès testeur ou budget réel n'est choisi.
  Le backend catalogue Infomaniak existant et son référentiel HTTP ont depuis été
  vérifiés ; cela ne constitue pas un raccordement de l'avatar.

## Préparation du raccordement serveur — 18 octobre 2026

`pathway-session.mjs` réutilise le lecteur de référentiels, l'adaptateur et le
garde-fou de quotas existants. C'est une fabrique **désactivée par défaut**, sans
route HTTP, commande de démarrage, lecture d'environnement ou destination implicite.
Elle n'est importée ni par la page, ni par le simulateur, ni par le service de test.
Les essais de cette préparation utilisent uniquement des transports injectés.

Lors d'une activation ultérieure, la configuration devra donner explicitement :

| Paramètre | Règle de préparation |
| --- | --- |
| Destinations | HTTPS `/api/profile-references` et `/api/pathway`, même origine explicitement autorisée ; aucun secret dans les URL |
| Instance | Un seul processus et une seule session de raccordement ; `singleInstance: true` reconnaît cette contrainte, sans créer de verrou interprocessus |
| Compteur | Fichier privé absolu et persistant, hors dépôt ; quotas quotidien et total explicites, sans reprendre automatiquement ceux de la simulation |
| Accès | Appel serveur uniquement ; contrôle d'identité à prévoir avant toute future route distante ; le compteur ne fournit pas d'authentification utilisateur |
| Délai parcours | Obligatoire pour la session, entre 1 et 210 000 ms ; aucun délai réel choisi silencieusement |
| Interruption | `stop()` bloque les nouvelles demandes, persiste l'arrêt et annule le transport actif ; une erreur du contrôle d'activation bloque l'accès |

Le backend existant, examiné dans `server/pathwayEngine.mjs`, utilise jusqu'à deux
passes de 90 secondes chacune. Le défaut de 10 secondes de l'adaptateur isolé est
donc un repère historique impropre à une activation sans réglage. La session exige
son propre délai explicite ; l'adaptateur accepte désormais jusqu'à 210 secondes.
**200 secondes pour le POST** est une proposition à vérifier, pas une mesure ni
une configuration déployée. La lecture du référentiel est bornée séparément à
5 secondes par défaut. Avant activation, aligner aussi le navigateur (actuellement
10 secondes pour la seule simulation), le serveur HTTP et les éventuels proxies.
La durée admissible des proxies Infomaniak et du réseau institutionnel n'est pas
établie ici. Aucun délai du moteur de production n'a été changé.

### Déroulement préparé et garanties limitées

1. Le serveur reçoit un profil confirmé, sa révision et un identifiant de demande
   généré côté serveur. Une seule opération est admise à la fois, sans file d'attente.
2. Le profil est copié avant toute attente réseau. Le lecteur revalide le contrat ;
   une révision changée, une valeur retirée ou un profil invalide bloque le POST
   sans consommer de tentative. Les réponses du formulaire restent à conserver.
3. Une tentative est réservée durablement avant le POST. Une erreur de stockage
   bloque l'envoi. Le compteur n'est pas remboursé sur erreur HTTP, annulation ou
   délai : le backend peut déjà traiter la demande. Un délai ou une annulation
   côté consommateur ne garantit pas l'arrêt des appels OpenAI du backend.
4. Un identifiant déjà tenté est refusé par cette instance, même après échec. Il
   n'y a ni relance automatique ni cache de réponses. Cette détection est en mémoire
   et ne survit pas au redémarrage ; seul le compteur et l'arrêt persistent.
   L'API catalogue ne fournit pas d'idempotence ou de transaction de révision :
   ne pas présenter cette préparation comme une garantie de traitement unique
   entre redémarrages, plusieurs processus ou plusieurs clients du backend.
5. Le profil seul est envoyé à l'API existante, sans clé OpenAI ni jeton testeur.
   Les catégories, liens officiels, limites du catalogue, durées et mesures de
   consommation sont contrôlés et conservés. La réponse est bornée à 256 Kio
   par défaut (maximum configurable 1 Mio), UTF-8 et JSON ; redirections refusées.

Les plafonds portent sur des **tentatives de parcours**, potentiellement deux
appels OpenAI chacune. Ils ne constituent pas un plafond en USD, une limite par
testeur ou un quota couvrant les autres consommateurs du backend partagé. Le
contrôle de concurrence et le débit du catalogue restent indépendants et partagés.
Ne pas effacer le compteur pour débloquer une session sans décision explicite.

### Vérifications et prochaine décision

Les tests couvrent le fonctionnement désactivé, les configurations incomplètes,
le profil figé, la révision changée, la concurrence, les doublons, les erreurs,
les quotas persistants, l'arrêt, l'annulation, les délais et les réponses bornées.
La suite locale complète compte 72 tests réussis, sans échec ni test ignoré.
Un contrôle croisé hors ligne a relu la réponse de développement enregistrée dans
`catalogue-formations/reports/pathway-functional-check-2026-10-18.json` : acceptée
sans modification par l'adaptateur renforcé. Ce n'est pas un nouvel essai réel,
une mesure indépendante ou une preuve de compatibilité future de l'hébergement.
Coût OpenAI API de cette préparation : 0 token / 0 $.

Le premier essai réel reste à cadrer : hébergement et accès privés, cas fictif,
nombre maximal de tentatives et suivi de coût, délais de bout en bout, traitement
des résultats dans l'avatar et retour à la simulation. Le mode recherche Luna
reste hors de ce raccordement de parcours. Aucun appel payant ni déploiement
ne découle de ce document ; conserver les validations explicites de la section suivante.

## Point de contrôle

Ne pas activer de déploiement public, de passerelle distante, de connexion au backend de production ou d'appel OpenAI API sans validation explicite du périmètre correspondant.
