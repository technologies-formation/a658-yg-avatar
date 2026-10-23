# Connecteur GPT-6 Luna — préparation désactivée

## Périmètre réalisé

`openai-dialogue.mjs` et `dialogue-budget.mjs` préparent le transport Responses API et le registre de l’essai. Aucun lanceur ni écran ne les importe. Aucun secret d’environnement n’est lu, aucun dossier de session n’est créé implicitement et aucun appel OpenAI réel n’a été exécuté.

Le connecteur est désactivé par défaut, y compris lorsque des options de clé sont présentes. Un essai de transport exigerait séparément `enabled: true`, `paidTrialAuthorized: true`, une clé explicite, un registre privé et un transport. Les tests utilisent exclusivement un transport fictif et une fausse clé.

La session de dialogue existante continue à refuser un fournisseur `mode: 'real'`. Le connecteur renvoie `{ result, usage }` ; un futur raccordement devra valider `result` avec les règles de profil et de provenance, conserver `usage` et demander l’acceptation des corrections. Il ne faut pas rebaptiser le fournisseur en simulation pour contourner ce refus.

## Budget de l’essai

Politique fixée pour cette préparation :

- modèle `gpt-6-luna`, traitement Standard, aucun outil ;
- au plus 10 tentatives, 0,10 USD de réservations au total ;
- réservation conservatrice de 0,01 USD par tentative, avant tout transport ;
- comptage de l’entrée par `/v1/responses/input_tokens` avant génération ; au plus 30 000 tokens entrants ;
- réponse plafonnée à 2 000 tokens générés, y compris les tokens non visibles ;
- aucun remboursement de réservation sur erreur, refus, annulation ou délai ; aucune relance automatique.

Les tarifs officiels vérifiés le 23 octobre 2026 sont de 0,10 USD/M en entrée, 0,125 USD/M pour une écriture de cache courte, 0,25 USD/M pour une écriture longue et 0,50 USD/M en sortie. Le calcul conservateur retient 0,25 USD/M pour toute l’entrée et ajoute 10 % de marge régionale : `(30 000 × 0,25 + 2 000 × 0,50) × 1,1 / 1 000 000 = 0,00935 USD`, inférieur à la réservation de 0,01 USD.

Cette politique concerne les coûts de génération textuelle du connecteur selon ces tarifs, hors taxes et autres usages du compte. La réservation n’est pas une dépense mesurée. La disponibilité du modèle, les paramètres du compte, les tarifs applicables dont ceux du comptage et les modalités de facturation restent à vérifier avant activation. Le champ `calculatedUpperCostUsd` est une majoration calculée à partir de l’usage renvoyé ; il ne représente pas une facture.

## Registre durable distinct

Le registre utilise un dossier dédié existant et privé, sur un système POSIX. Il n’utilise aucun fichier de quota des anciens essais. Un verrou exclusif empêche deux instances d’ouvrir simultanément le même registre. Chaque tentative ajoute un fichier créé exclusivement et synchronisé avant transport ; seules l’empreinte de l’identifiant et la réservation y figurent, sans conversation ni clé.

La réouverture conserve les tentatives et les doublons. Les fichiers corrompus, liens symboliques ou permissions ouvertes bloquent l’accès. Après un crash, un verrou résiduel bloque volontairement la reprise : aucune suppression de verrou ou remise à zéro automatique n’est prévue. Une consommation impossible à vérifier ou un modèle renvoyé différent impose un arrêt enregistré sur disque.

## Contrat HTTP et données

Seules les deux destinations fixes de comptage et de génération OpenAI sont utilisées. Redirections refusées, clé uniquement dans l’en-tête Authorization, délai et taille des réponses bornés. La requête de génération utilise `store: false`, `reasoning.effort: 'none'`, un schéma JSON strict et aucun outil. `store: false` ne constitue pas une promesse générale de non-conservation par le fournisseur.

Les instructions proviennent des règles constantes du serveur. Les messages, le brouillon et le référentiel constituent des données utilisateur. Les sorties tronquées, refus, contenus non JSON ou réponses non vérifiables ne sont pas appliqués. La session métier et l’interface ne sont pas encore raccordées ; aucune qualité de conversation réelle n’est revendiquée.

## Vérifications et suite

10 nouveaux tests de transport et de registre sont réussis. La suite Node complète compte désormais 155 tests réussis localement. Les tests n’utilisent aucune API externe ; aucun appel payant n’a été effectué.

Avant tout essai réel : terminer le raccordement contrôlé entre session et fournisseur, ajouter la route authentifiée et l’écran d’acceptation des propositions, vérifier les tarifs et données transmises, puis préparer un lancement privé distinct et explicitement autorisé. Les recherches de parcours restent en simulation pendant l’essai de dialogue envisagé. Aucun changement d’hébergement n’est effectué par cette préparation.

Sources officielles consultées :

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/token-counting

Coût OpenAI API de cette préparation et de ses tests fictifs : 0 token / 0 $.
