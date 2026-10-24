# Intégration de la messagerie — simulation uniquement

## Périmètre de la branche

Branche dédiée `feat/avatar-messaging-simulation`, issue de la révision avatar `2836b88`. L’écran privé historique demeure l’interface par défaut ; les lanceurs réels et le moteur CATALOGUE ne sont pas modifiés. Cette branche prépare l’interface de simulation ; toute utilisation réelle relève d’un périmètre distinct.

Les fabriques existantes `createHostedSimulation` et `createPilotSimulationServer` acceptent une option explicite `interface: 'messaging'`. Elles gardent la même session de simulation, les mêmes comptes, confirmations, contrôles d’origine et quotas. Les ressources du navigateur sont ajoutées à la liste explicite des ressources privées, protégées par la même authentification. Aucun accès générique au système de fichiers.

## Interface intégrée

- Messagerie avec réponses à gauche et messages utilisateur à droite ; lecture positionnée au début de chaque réponse.
- Deux onglets, Discussion et Cours proposés, utilisant une copie immuable du résultat reçu et du profil confirmé. Les catégories, positions, justifications, liens officiels, limites, durées et mesures de consommation ne sont ni recalculés ni réécrits.
- Profil éditable : groupe de personnel et statut managérial depuis les options du référentiel ; entité libre avec suggestions ; fonction, objectif et compétences actuelles ; temps disponible ; modalité séparée et autres contraintes conservées.
- Aucun niveau supposé. La modalité est encodée dans le champ existant `constraints` avec les autres contraintes ; le contrat CATALOGUE ne change pas.
- Confirmation explicite avant le POST de simulation. Un changement de profil annule la demande navigateur en cours et invalide les réponses tardives. Aucune relance automatique, remboursement ou remise à zéro du quota.
- Après correction du profil ou changement du référentiel, le parcours reste visible avec « Parcours à actualiser ». Une nouvelle confirmation crée un nouveau résultat ; le précédent reste dans la discussion.
- Le bouton « En discuter » cite le code, le titre et la justification du cours reçu. Il ne sélectionne pas un autre cours et n’active pas un dialogue IA.
- Les réponses sont conservées en sessionStorage dans l’onglet ; le brouillon peut être repris après rechargement si le référentiel est le même. Les résultats ne sont pas persistés après rechargement, comme dans le pilote historique.

## Limites explicites

Le résultat de simulation est fixe et ne répond pas au profil : cette mention reste affichée dans les deux vues. Les scénarios et formations fictives de la maquette ne sont pas copiés comme moteur de recommandation. Les modalités des cours et les disponibilités de sessions sont affichées « à vérifier » lorsque le résultat actuel ne les fournit pas ; aucune date ni inscription ouverte n’est inventée. Le dépassement de durée est celui du backend, affiché par le lecteur de résultat partagé.

Les PDF, emails, disponibilités réelles et dialogue libre restent des évolutions distinctes. Le titre « Compléments » correspond à `optionalSteps` : en l’absence de sous-type structuré, le navigateur n’invente pas de reclassement complément/alternative.

## Vérification

Les tests Node couvrent la conservation des contraintes, le respect du référentiel, les snapshots, la sérialisation sûre du contrat, les ressources authentifiées, la confirmation et le compteur. Le contrôle Chromium `messaging-browser-check.mjs` utilise uniquement des routes interceptées et des données synthétiques ; il vérifie les champs transmis, l’absence de POST avant confirmation, les deux vues, le résultat conservé après correction et la reprise du brouillon, en ordinateur et mobile. Son résultat CI doit être vérifié avant de revendiquer une validation navigateur.

Coût OpenAI API de la préparation et des tests sans moteur : 0 token / 0 $.


## Bilan fonctionnel de l’interface

Les vérifications utilisateur portent sur des données synthétiques, sans analyse personnalisée :

- Discussion et Cours proposés affichent le même profil et le même résultat, dans le même ordre et avec les mêmes catégories.
- Une correction du profil conserve le parcours précédent et signale qu’il doit être actualisé.
- « En discuter » revient dans Discussion avec la formation et la justification correspondantes.

Ces contrôles valident les interactions de l’interface, pas la pertinence pédagogique des formations synthétiques.

## Prochaine évolution à cadrer : le dialogue libre

La messagerie reste un questionnaire guidé. Le dialogue libre devra aider à exprimer le besoin, reformuler et proposer une mise à jour du profil. Une confirmation explicite devra précéder la demande d’un nouveau parcours au moteur existant du catalogue.

Le dialogue ne doit pas devenir un second moteur de sélection ni modifier silencieusement les catégories, l’ordre ou les justifications d’un résultat. Les deux onglets doivent continuer à présenter le même parcours.

Avant le raccordement, préciser le budget, le traitement des données, les limites de conversation et les conditions d’appel. Les disponibilités des sessions, les PDF et les emails restent des évolutions distinctes. Ce bilan documentaire ne déclenche aucun appel payant.
