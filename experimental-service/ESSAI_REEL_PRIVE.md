# Avatar — un premier parcours réel privé local

## Périmètre autorisé le 19 octobre 2026

L’utilisateur a donné son GO pour préparer et tester le raccordement privé local,
puis effectuer un seul parcours réel sur un profil fictif, sans relance automatique,
avec relevé de consommation. Aucun hébergement distant, changement du moteur ou
publication de la page publique ne fait partie de cette autorisation.

## Fonctionnement

`pilot-real-server.mjs` est distinct du simulateur et désactivé par défaut. Son
lancement exige `AVATAR_PILOT_REAL_ENABLED=true` et le chemin de la configuration
locale existante. Il réutilise uniquement son certificat et son compte, écoute sur
`127.0.0.1:8800` et utilise les mêmes ressources et contrôles d’identité/origine que
le serveur de simulation. Le port 8799 du simulateur peut rester ouvert.

Les seules destinations distantes sont fixées côté serveur :

- `GET https://api.a658yg-catalogue.ch/api/profile-references` pour les choix ;
- `POST https://api.a658yg-catalogue.ch/api/pathway` après confirmation.

Le navigateur utilise seulement les routes privées de sa propre origine. Aucune
clé OpenAI ni aucun identifiant d’accès local n’est transmis au backend catalogue.
Le backend partagé conserve ses limites existantes ; il n’est pas redéployé.

La session existante vérifie la révision du profil, puis réserve durablement
**une tentative maximum**, avant le POST. Un échec, une interruption ou un délai
dépassé ne rembourse pas cette tentative et n’entraîne aucune relance. Le délai
POST est de 200 s ; la page attend au maximum 210 s et la connexion locale 215 s.
La limite effective du proxy Infomaniak reste à constater ; ces délais ne prouvent
pas que le backend termine ou s’arrête après une interruption du client.

Les fichiers `real-one-attempt-quotas.json` et `real-one-attempt-report.json` sont
créés dans le dossier privé de la configuration locale, indépendamment du compteur
de simulation. Le rapport de succès contient date, quota, codes de cours et usage
renvoyé par le moteur, sans profil ni secret. Il est créé sans écraser un fichier
préexistant. Si son écriture échoue, le résultat reste affiché et `reportSaved=false`
est renvoyé ; ne pas refaire le POST pour obtenir un rapport. Les fichiers ne sont
pas servis par HTTP. Le résultat complet n’est pas persisté par ce lanceur.

Une nouvelle instance relit le compteur. L’arrêt explicite persiste aussi l’arrêt.
Ne pas effacer les fichiers, créer une nouvelle session ou relancer la mise en
place pour contourner la tentative consommée. Le pilote repose sur une seule
instance ; aucun verrou de fichier multi-processus n’est ajouté.

## Préparation du PC

Dans une **nouvelle fenêtre PowerShell**, rejoindre le dépôt et récupérer la branche
interactive à jour. Conserver l’ancienne fenêtre du simulateur ouverte.

```powershell
Set-Location -LiteralPath 'C:\Users\yanng\OneDrive\Documents\Projets-ChatGPT-Codex\a658-yg-avatar'
if ($?) {
    git -c gc.auto=0 -c maintenance.auto=false pull --ff-only
    if ($LASTEXITCODE -eq 0) {
        $env:AVATAR_PILOT_REAL_ENABLED = 'true'
        node .\experimental-service\pilot-real-server.mjs 'C:\Users\yanng\AppData\Local\A658-YG\pilote-prive\session-05l7xj\config.json'
    }
}
```

Cette commande démarre seulement le serveur ; elle ne fait aucun POST. Attendre
le retour de lancement avant d’ouvrir la page. Saisir directement dans la barre
d’adresse `https://127.0.0.1:8800/private/`. Le certificat auto-signé reste limité
à cet essai local et expire après 24 h ; ne pas changer la confiance TLS globale.
Utiliser les mêmes identifiants du fichier d’accès privé, jamais dans le chat.
Le brouillon du port 8799 n’est pas transféré au port 8800 : il s’agit d’une autre
origine et d’une autre session de navigateur.

Profil fictif convenu pour le premier essai :

| Champ | Valeur |
| --- | --- |
| Groupe | PAT — Personnel administratif et technique |
| Entité | vide |
| Situation managériale | Sans responsabilité managériale |
| Type de demande | Construire un parcours |
| Fonction | Collaborateur administratif |
| Objectif | Mieux organiser mes tâches administratives et mes priorités au quotidien |
| Compétences | Bases des outils bureautiques |
| Temps disponible | 5 jours |
| Contraintes | Présentiel de préférence |

Vérifier le récapitulatif puis cliquer **une seule fois** sur « Confirmer le profil
et générer ». Attendre le résultat sans recharger. Sur erreur ou timeout, conserver
le message et ne pas tenter un second envoi. Un résultat sans proposition reste
un résultat réel à examiner, pas une raison de recommencer automatiquement.

Après succès, lire le rapport privé affiché par la console pour relever les tokens
et le coût. La consommation non renvoyée reste inconnue ; ne pas annoncer 0 $ pour
un POST tenté. L’observation historique du 18 octobre (0,02357005 USD) ne constitue
ni devis ni plafond. La limite d’une tentative ne garantit aucun plafond en USD.

## Vérifications avant remise à l’utilisateur

Les 108 tests Node passent localement : cinq nouveaux tests couvrent l’assemblage
réel avec transport injecté, le défaut désactivé, HTTPS et l’authentification,
l’absence de POST avant confirmation, l’unique réservation durable, le redémarrage,
l’échec du moteur sans relance, le rapport non écrasé et la séparation du simulateur.
La suite de simulation reste en régression. Aucun transport de test n’appelle le
backend réel. Le contrôle navigateur supplémentaire exerce le mode réel avec un
faux moteur sur ordinateur/mobile, la restauration et le refus du second envoi ;
son résultat CI doit être vérifié avant le lancement sur le PC.

Contrôles vérifiés au commit de test `5be853a46bfa327aff78cbd78411c452087797e0`,
après le code `6b1dc30e7b95f7186a77d661ae393fc05c24a2d6` :

- [Tests GitHub](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39227459028) :
  108 tests Linux et neuf tests Windows/Node 24 réussis.
- [Chromium](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39227458793) :
  version 151.0.7922.34, transport moteur injecté exclusivement, un POST fictif
  accepté, seconde tentative refusée, aucun POST au rechargement et brouillon restauré.
  Aucune erreur navigateur, requête distante ou débordement horizontal à 1280 × 900
  et 390 × 844. Le simulateur privé antérieur passe aussi en régression.
- Le rapport JSON et les captures de résultat ordinateur, brouillon mobile restauré
  et quota mobile ont été examinés, sans problème bloquant observé. Artefact
  `avatar-browser-simulation`, rétention 14 jours. Ces preuves ne couvrent pas le
  réseau institutionnel, Safari, un appareil mobile physique ou le moteur réel.

Le premier contrôle Chromium avait lu le texte visible d’un champ situé dans le
récapitulatif mobile replié. Le contrôle a été corrigé pour lire la donnée DOM et
conserver une capture après restauration ; aucune protection du produit n’a été
assouplie pour faire passer le test.

À la rédaction initiale, aucun serveur réel n’est démarré sur le PC et aucun POST
réel n’est effectué. Coût OpenAI API de la préparation : **0 token / 0 $**.
Le premier résultat utilisateur et sa consommation restent à constater.

## Premier résultat réel constaté — 19 octobre 2026

Le retour PowerShell utilisateur confirme le pull jusqu’à `b22a250` et le lancement
sur `https://127.0.0.1:8800/private/`. La capture de la page montre le pilote réel,
puis la génération en cours après confirmation. La capture finale et le texte
intégral du résultat fourni par l’utilisateur confirment le succès et **1/1 tentative**.
Aucun second appel n’est autorisé par ce jalon ; ne pas réinitialiser le compteur.

Le cas correspond au profil fictif prévu, fonction « collaborateur administratif »,
objectif d’organisation quotidienne des tâches et priorités, bases bureautiques,
cinq jours disponibles et préférence présentiel. Entité vide, sans responsabilité
managériale. Le résultat affiche :

| Rubrique | Cours renvoyés |
| --- | --- |
| Étapes recommandées | SEM0872 — Gestion du temps et des priorités ; TRT1011 — Outlook 365 Base |
| Compléments | SEM1113 — De quoi je m’e-mail? ; TRT1012 — Outlook 365 Avancé ; SEM1040 — Mindmap ; SEM1235 — GIDA |
| Temps | 40 h disponibles, 20 h recommandées, dépassement 0 h |
| Consommation renvoyée | 91 448 tokens d’entrée, 525 tokens de sortie ; coût calculé par le backend : **0,0234917 USD** |

Lecture qualitative du résultat fourni : le socle répond directement à la gestion
des priorités et l’étape Outlook propose une application concrète. Les compléments
sont liés à l’objectif ; le texte présente SEM1113 comme complément ciblé ou
alternative à Outlook Base et réserve Outlook Avancé à la maîtrise préalable des
bases. Les limites sur les outils/procédures internes sont explicites. Aucun cours
pédagogique ou judiciaire sans lien avec ce cas n’apparaît dans la réponse fournie.
Les compléments ne sont pas tous à ajouter : le calcul de 20 h concerne les étapes
recommandées, pas l’ensemble des six cours. La préférence présentiel, les conditions
d’inscription et les prérequis restent à vérifier dans les fiches pour un usage réel.

Ce constat valide un parcours fonctionnel de bout en bout depuis l’avatar privé
sur le PC et une cohérence qualitative sur ce cas. Ce n’est ni un benchmark
indépendant, ni une garantie générale de pertinence, ni un essai sur le réseau
institutionnel ou un hébergement distant de l’avatar. La consommation est celle
affichée par le moteur, pas un nouveau calcul tarifaire. L’existence et le contenu
du rapport JSON privé sur le PC n’ont pas été vérifiés séparément ; la preuve
consignée repose sur la capture et le texte utilisateur. Aucun secret n’est conservé.

Prochaine décision : choisir un nouveau périmètre avant tout autre appel réel,
déploiement distant ou fusion. Le quota du premier essai est consommé. Les branches
publiques et le backend n’ont pas été déployés par ce test.
