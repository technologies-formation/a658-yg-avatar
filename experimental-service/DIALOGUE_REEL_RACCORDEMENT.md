# Raccordement de l’essai de dialogue IA — désactivé par défaut

## Réalisé et limites

Le fournisseur existant est relié à la session de profil et à l’interface privée par `createRealDialogueTrialInterface`. Aucun lanceur d’hébergement existant ne l’importe ou ne l’active. L’interface installée reste en dialogue fictif. Les tests décrits ici utilisent uniquement un faux transport, une fausse clé et des comptes synthétiques. Aucune qualité de conversation IA réelle n’est revendiquée.

Le mode fictif installé a été vérifié manuellement après sa correction : repère accepté dans la bulle initiale, question suivante sans bulle de confirmation supplémentaire et bandeau « Profil mis à jour. Aucune recherche lancée. ». Le résultat synthétique précédemment vérifié reste un exemple fixe ; aucun nouveau parcours n’a été demandé pour ce contrôle visuel.

## Activation explicite distincte

La fabrique est désactivée par défaut et ne consulte alors ni clé, ni registre, ni transport. Une préparation de lancement ultérieure devra fournir `enabled: true`, `paidTrialAuthorized: true`, une clé explicite côté serveur, un dossier privé dédié au budget, des comptes, un contrôle HTTPS fiable, un référentiel et un fichier de quotas de parcours distinct. Aucune variable d’environnement ou clé n’est lue automatiquement par cet assemblage.

Chaque tour réel exige en plus `paidTrialConfirmed: true`. L’écran annonce que chaque message envoyé peut consommer une tentative, que le profil et l’échange sont transmis à OpenAI et que seules des données fictives doivent être utilisées. Aucun appel n’est lancé par l’ouverture d’une page, le rechargement du brouillon, l’acceptation d’une proposition ou une édition du profil.

Le transport OpenAI reste celui déjà préparé : modèle fixé, comptage avant génération, JSON structuré, absence d’outils, redirections refusées et aucune relance automatique. Les sources officielles ont été rouvertes le 23 octobre 2026 :

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs

## Contrat et interface

`createDialogueSession` continue à refuser un fournisseur réel. Seule la fabrique séparée `createRealDialogueTrialSession`, explicitement autorisée, accepte son enveloppe `{ result, usage }`. Le résultat passe par les mêmes contrôles de champs, valeurs du référentiel, citations utilisateur, révisions et acceptation explicite. Le mode reste `real`, sans le rebaptiser simulation.

Dans l’écran d’essai, la réponse de l’IA constitue l’échange : le questionnaire fictif ne rajoute pas ses questions préparées. Une proposition conserve le texte de la réponse et reçoit une mention après décision. Le profil complet reste à confirmer séparément avant un parcours. L’avertissement du résultat distingue explicitement le parcours fixe de la consommation du dialogue IA ; il ne prétend pas que toute la session est sans appel OpenAI. Les parcours utilisent exclusivement le fournisseur de simulation existant ; `pathwayMode: 'simulation'` reste explicite dans les réponses du dialogue.

## Budget et usage

Le registre commun aux identités réserve 0,01 USD par tentative, au plus 10 tentatives et 0,10 USD de réservations. Le redémarrage, le changement d’identité, le refus d’une proposition, l’édition du profil ou « Nouvelle demande » ne remettent pas ce registre à zéro. La fermeture technique libère son verrou ; l’arrêt explicite conserve un arrêt durable. Le lancement futur devra conserver le même dossier de budget.

L’écran montre le nombre de tentatives et les réservations. L’usage de génération vérifié est conservé en mémoire par session et affiché avec une majoration calculée, même si le contrôle métier refuse ensuite la proposition. Les autres identités n’accèdent pas à cet historique d’usage. Cet historique en mémoire n’est pas une facture ni un journal durable : il disparaît au redémarrage. Les réservations, elles, persistent. Une tentative sans usage vérifiable peut être facturée et conserve sa réservation.

Le calcul affiché exclut le comptage, les taxes et les tentatives sans usage vérifiable. La disponibilité du modèle sur le compte, les conditions de facturation du comptage et les tarifs applicables restent à vérifier avant l’essai payant. Le plafond de réservations n’est pas une garantie sur l’ensemble de la facture du compte.

## Vérifications

Les tests HTTP couvrent le refus par défaut, l’authentification, HTTPS et l’origine avant transport, l’absence de clé dans la page, l’acceptation distincte, les preuves invalides, l’usage, le parcours simulé et le budget commun persistant. Les tests de session couvrent aussi l’usage invalide et l’annulation avec réponse tardive. La suite locale compte 168 tests réussis.

Le scénario navigateur prépare un faux transport et vérifie sur ordinateur et mobile : proposition non appliquée avant acceptation, saisie libre, profil confirmé, un seul parcours simulé, mêmes cartes dans les deux vues, changement de profil sans réécriture du résultat, affichage de l’usage et absence de requête navigateur externe. Les contrôles GitHub doivent être vérifiés sur le commit publié avant de les déclarer réussis.

## Prochaine étape

Préparer un lanceur privé distinct et sa configuration désactivée, vérifier les conditions d’accès et de facturation, puis soumettre le lancement concret de l’essai borné. Aucun déploiement, clé réelle ou appel payant n’est inclus dans ce jalon.

Coût OpenAI API : 0 token / 0 $.
