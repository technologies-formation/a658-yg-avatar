# Avatar — page et serveur privés en simulation

Jalon du 18 octobre 2026, branche `feat/avatar-interactive-local`.
Statut : implémenté pour essais locaux ; aucun déploiement Infomaniak ni appel au moteur réel.

## Ce qui est utilisable

`pilot-server.mjs` assemble l’accès individuel, une page issue du questionnaire
existant et les modules d’affichage existants sur une même origine HTTPS locale.
Il sert seulement `/`, `/private/`, deux modules explicitement autorisés et les
routes `/private/profile-references` / `/private/pathway`. Toutes ces ressources
passent par le contrôle d’identité, y compris la page et les modules JavaScript.
Il ne sert ni répertoire de fichiers, ni configuration, ni fichier de compte,
ni code d’authentification. Les réponses privées utilisent `no-store`.

Le pilote propose uniquement la construction d’un parcours. Il conserve le profil
et le brouillon après rechargement dans le même onglet, permet l’actualisation des
choix et exige une confirmation. Avant le POST, le navigateur obtient une confirmation
serveur liée à l’identité et à la révision ; une révision différente bloque l’envoi
et conserve les réponses. Une correction pendant l’échange invalide et annule le
consommateur ; un résultat tardif est ignoré. Après erreur ou quota, la page ne se
présente pas comme un succès et n’effectue aucune relance automatique. Le statut
reste affiché hors du défilement de la conversation ; sur mobile le récapitulatif
se replie après une réponse pour laisser davantage de place au résultat.

Les réponses proviennent de `pilot-simulation.mjs`, qui n’importe ni l’adaptateur
ni la session du moteur réel. Il relit un contrat local, valide un cliché du profil,
réserve le quota de simulation dans un fichier privé persistant, puis renvoie
l’aperçu explicitement fourni. Ce dernier indique qu’il s’agit de données de test
sans rapport avec le profil ; aucune recommandation réelle n’est déduite du test.
La simulation refuse concurrence, doublons en mémoire, arrêt, quota épuisé,
référentiel obsolète/invalide et stockage inaccessible. Les résultats ne sont pas
persistés. La seule navigation extérieure possible est un clic volontaire sur
une fiche officielle affichée ; aucun appel moteur ni OpenAI n’est ajouté.

## Mode de lancement préparé

Importer les modules ne lance aucun serveur. La fabrique est désactivée par défaut.
Le lanceur exige **à la fois** `AVATAR_PILOT_SIMULATION_ENABLED=true` et un chemin
absolu vers une configuration privée JSON. Il écoute exclusivement sur `127.0.0.1`,
en HTTPS natif ; un domaine distant ou une origine incohérente est refusé.
Ce lanceur n’est pas une configuration de reverse proxy Infomaniak et ne doit pas
y être déployé en supposant qu’il reconnaît les en-têtes du proxy.

Préparer hors dépôt et hors dossier Web les fichiers suivants :

| Paramètre JSON | Contenu attendu |
| --- | --- |
| `port` et `publicOrigin` | Port local supérieur ou égal à 1024 et origine exacte `https://127.0.0.1:PORT` |
| `keyFile` / `certFile` | Chemins absolus de la clé et du certificat TLS locaux ; certificat de confiance dans le navigateur |
| `usersFile` | Chemin absolu du tableau d’enregistrements individuels scrypt défini dans `ACCES_PILOTE.md` ; jamais de mot de passe en clair |
| `referencesFile` | Chemin absolu d’un contrat v1 généré par le catalogue ; aucun second référentiel métier maintenu à la main |
| `previewFile` | Chemin absolu d’une réponse synthétique ou archivée explicitement choisie pour l’aperçu ; JSON borné à 256 Kio |
| `stateFile` | Chemin absolu du compteur dans un répertoire privé existant, conservé au redémarrage |
| `singleInstance` | `true`, une seule instance ; aucun verrou multi-processus n’est créé |
| `maxDailyRequests` / `maxTotalRequests` | Plafonds explicites de simulations ; ne pas réutiliser un compteur de parcours réels |
| `maxAttempts` / `windowMs` | Limites explicites de vérifications d’authentification, succès compris |
| `timeoutMs` | Facultatif, 10 000 ms par défaut pour cette simulation, maximum 210 000 ms ; aucun délai réel Infomaniak n’en est déduit |

Exemple de commande **à adapter à une configuration privée préparée**, sans secret
sur la ligne de commande (PowerShell) :

```powershell
$env:AVATAR_PILOT_SIMULATION_ENABLED = 'true'
node .\experimental-service\pilot-server.mjs 'CHEMIN_ABSOLU_VERS_CONFIG_PRIVEE.json'
```

Le chemin ci-dessus est un emplacement à remplacer, pas un fichier fourni.
Aucun compte, mot de passe, certificat réel ou fichier privé du PC n’a été créé
pendant ce jalon. Le provisionnement sûr reste à préparer avant un essai utilisateur.
Ne pas accepter les certificats invalides dans un déploiement ; l’exception utilisée
en CI concerne exclusivement un certificat éphémère de test local.

L’arrêt `SIGINT`/`SIGTERM` ferme les connexions et persiste l’arrêt du compteur.
Une relance avec ce même compteur reste bloquée : ce comportement est intentionnel.
Ne pas effacer ou remettre à zéro un compteur pour débloquer le service sans décision
explicite. L’identité et la révocation d’un compte restent celles du jalon précédent.

## Vérification

99 tests Node réussis localement, dont les 93 tests précédents. Ils couvrent la
simulation persistante, les refus avant quota, le profil figé, la concurrence,
l’annulation, le contrat échappé, le service désactivé, la page et les modules protégés
sous HTTPS, le refus de chemins privés, le doublon, le quota, la révocation et l’arrêt.
Les identifiants et certificats des tests sont synthétiques et temporaires.

Les [99 tests Node](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39164462051)
et le [contrôle Chromium](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39164462058)
réussissent au commit final de code `4a5d834ac665e555f520206c737a90f5cc4cc87a`
(après l’assemblage initial `f563ffc76266276d97d62b0bf52e41bdf595c9b3`).
Le rapport de l’artefact a été relu : page privée, trois simulations acceptées,
une tentative refusée au quota, aucune requête automatique au rechargement,
brouillon restauré et libellé de choix actualisé sans perte du code.
Aucune erreur navigateur ni requête distante, aucun débordement horizontal aux
formats 1280 × 900 et 390 × 844. L’essai d’accès HTTPS précédent et les cinq
simulations du questionnaire historique passent aussi en régression.
Les cinq captures privées sont dans l’artefact `avatar-browser-simulation`
(rétention 14 jours). Les trois captures finales du résultat ordinateur/mobile
et du quota mobile ont été examinées : aucun problème bloquant observé.
Ce contrôle ne couvre pas Safari, les appareils physiques, le clavier tactile,
la confiance du certificat sur le PC de l’utilisateur, Infomaniak ou le réseau
institutionnel. Les certificats/identifiants restent synthétiques et temporaires.
Coût OpenAI API : 0 token / 0 $. Quota de travail Codex distinct.

## Point de reprise historique du 18 octobre

Préparer un essai utilisateur local avec configuration, compte et certificat hors
Git, sans appel moteur ; ou vérifier la capacité et les coûts d’un site d’essai
Infomaniak séparé avant de proposer un déploiement distinct. Le transport derrière
proxy, le réseau institutionnel et la gestion durable des comptes restent à valider.
Le raccordement au moteur réel, ses plafonds et le premier appel payant gardent leur
validation séparée. La démonstration publique avatar et le catalogue sont inchangés.

## Mise en place assistée sur le poste Windows

Le 18 octobre, l’utilisateur a mis à jour sa copie déplacée jusqu’à `930a5ac`,
confirmé un état propre et un `git fsck --connectivity-only` sans erreur. Le
nettoyage automatique de Git a demandé plusieurs confirmations de suppression
de dossiers internes ; répondre `n` a permis de terminer l’avance rapide. La cause
exacte n’est pas établie ; OneDrive reste un facteur possible, pas un diagnostic.
Les 99 tests du jalon précédent passent sur Windows avec Node 24.19.0 et OpenSSL
fourni par Git (`C:\Program Files\Git\usr\bin\openssl.exe`).

`setup-local-pilot.mjs` prépare désormais une session sous
`%LOCALAPPDATA%\A658-YG\pilote-prive`, hors Git et hors OneDrive. Il limite les
droits du nouveau dossier à l’utilisateur courant, SYSTEM et aux administrateurs,
puis crée un compte aléatoire, son empreinte, un certificat local non-CA de 24 h
et la configuration de cinq simulations. Il récupère seulement le contrat public
par GET sur `/api/profile-references` ; aucun appel à `/api/pathway`, aucune clé
OpenAI et aucune configuration de moteur réel. Les exemples d’affichage restent
synthétiques, sans faux lien de fiche officielle ni montant de consommation inventé.

Le mot de passe reste dans `ACCES_LOCAL_PRIVE.txt` dans ce dossier privé. Il n’est
ni imprimé dans la console, ni stocké dans le dépôt, ni à coller dans le chat.
Le script ne lance pas le serveur et ne modifie aucun certificat de confiance
Windows. Le navigateur peut donc demander une exception pour ce certificat de test
local : ne pas confondre cet essai limité à `127.0.0.1` avec un déploiement distant.
Aucun réglage global de validation TLS ne doit être désactivé.

Chaque invocation crée une session distincte sans remplacer les précédentes.
En cas d’échec, seul le dossier neuf de cette invocation est retiré. Les quatre
tests supplémentaires portent sur le provisionnement, le certificat, le refus des
destinations inadéquates, la conservation des sessions et le nettoyage en échec.
Les [contrôles CI du commit `c4054ec`](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39166441339)
réussissent : 103 tests sous Linux et les quatre tests de mise en place sous Windows
avec Node 24. Les droits privés, le certificat, le compte, l’absence de remplacement
et les refus sont exercés sous Windows. Les transports de référentiel sont simulés
dans ces tests ; le GET public depuis le PC reste à constater lors de la commande.
La première exécution Windows du test avait utilisé le répertoire temporaire du
runner, extérieur au profil local ; le test a été corrigé pour respecter le même
répertoire privé que le lanceur, sans assouplir cette restriction.
La syntaxe des droits est vérifiée dans la [documentation Microsoft icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls).
Aucun certificat de confiance Windows n’est installé par cette procédure.

Pour récupérer ce script sans relancer le nettoyage Git à cette occasion :

```powershell
git -c gc.auto=0 -c maintenance.auto=false pull --ff-only
if ($LASTEXITCODE -eq 0) {
    node .\experimental-service\setup-local-pilot.mjs 'C:\Program Files\Git\usr\bin\openssl.exe'
}
```

Ces options Git concernent uniquement cette commande ; aucun réglage global ou
local du dépôt n’est changé. Attendre les chemins de configuration et d’accès
retournés avant de lancer le serveur. Aucun compte ou certificat sur le PC de
l’utilisateur ne doit être considéré comme créé sans ce retour.

## Validation sur le PC Windows — 19 octobre 2026

Le retour utilisateur confirme la mise à jour jusqu’à `995195a`, la réussite du
script de mise en place et le lancement explicite du serveur sur
`https://127.0.0.1:8799`. Une session privée et ses fichiers ont été créés sous
`%LOCALAPPDATA%\A658-YG\pilote-prive`, hors dépôt et hors OneDrive.
Le succès du script confirme la récupération du contrat public depuis ce poste ;
il ne constitue pas un appel au moteur de parcours.

L’accès direct à `https://127.0.0.1:8799/private/` fonctionne après l’exception du
certificat auto-signé local et l’authentification avec le fichier d’accès privé.
Aucun secret n’est communiqué dans le chat ou versionné, aucun certificat de
confiance Windows n’est ajouté. Une ouverture initiale depuis un lien a retourné
« Origine refusée » ; saisir l’adresse directement a permis l’accès. L’origine de
ce refus n’a pas été établie ; aucune protection n’a été relâchée.

Les captures examinées montrent le résultat après confirmation avec 1/5 tentative,
puis, après rechargement, le brouillon restauré et une nouvelle confirmation
requise sans l’ancien résultat. La seconde confirmation produit 2/5 : le rechargement
n’a pas réservé de tentative supplémentaire dans cette séquence.

Cette validation fonctionnelle manuelle complète la CI décrite plus haut. L’aperçu
reste synthétique et indépendant du profil : ce n’est pas une validation métier,
un test du moteur réel, du réseau institutionnel ou d’un hébergement distant.
Coût OpenAI API : **0 token / 0 $**. Le quota Codex reste distinct.

La suite proposée est un seul essai réel privé depuis le PC, après cadrage et accord
explicite : lanceur réel séparé, réutilisation des composants existants, compteur
privé distinct, profil fictif, une tentative sans relance et relevé du coût mesuré.
Aucun lanceur réel ou appel payant n’a été ajouté par cette mise à jour documentaire.
Le lanceur actuel demeure exclusivement un simulateur local.
