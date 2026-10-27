# Parcours réel dans les deux vues de messagerie

## Périmètre

Le dialogue IA et la génération d’un parcours sont deux opérations payantes distinctes. Le raccordement réutilise `createRealSession` et l’adaptateur historique du catalogue : une tentative durable maximum, un POST après confirmation, contrôle de révision du référentiel, aucun outil de sélection côté avatar et aucune relance. Le dialogue conserve son registre existant ; le parcours dispose de fichiers dédiés dans le même dossier privé. Aucun quota antérieur n’est copié ou réinitialisé.

La page indique son mode de parcours. Le navigateur accepte uniquement l’enveloppe correspondante, puis crée un unique cliché immuable du profil soumis et du résultat validé. Discussion et Cours proposés affichent ce même cliché : catégories, ordre, justifications, liens officiels, consommation et bilan de durée du moteur. La modification ultérieure du profil marque le résultat comme à actualiser, sans le réécrire. Les sessions et modalités non fournies restent à vérifier sur la fiche officielle. Le bouton « En discuter avec l’avatar » reprend la justification reçue sans appel IA supplémentaire.

## Préparation et activation

`hosted-dialogue-trial.mjs --prepare-pathway CHEMIN_CONFIG` ajoute `pathwayTrial: { enabled: false, paidTrialAuthorized: false }` à une configuration de dialogue existante validée. La sauvegarde exclusive `.before-real-pathway` est conservée. Aucun réseau, aucune clé ni nouveau compteur ne sont consultés par cette préparation. Une seconde préparation est refusée ; aucun fichier existant n’est remplacé par défaut.

La préparation laisse les parcours simulés actifs. Pour un essai concret distinct, il faut ensuite les deux autorisations de configuration `pathwayTrial.enabled` et `pathwayTrial.paidTrialAuthorized`, ainsi que `AVATAR_PATHWAY_TRIAL_ENABLED=true` dans le lancement, en plus des autorisations de dialogue déjà existantes. Sans l’autorisation d’environnement, le lancement réel est refusé avant lecture de clé.

Les fichiers `messaging-real-one-attempt-quotas.json` et `messaging-real-one-attempt-report.json` sont propres à ce raccordement. Une tentative reste consommée après erreur, annulation, rechargement ou redémarrage. Le rapport contient les codes de cours et l’usage renvoyé, sans profil. Le quota est global aux identités. Il ne constitue pas un plafond de facturation en USD : le coût du moteur est distinct des réservations du dialogue.

Le redémarrage nécessaire à l’activation efface le profil, le dialogue et l’usage de dialogue en mémoire ; les compteurs durables restent conservés. Préserver le profil avant ce redémarrage et le rétablir manuellement sans appel IA. Revenir à la sauvegarde de configuration et au lancement antérieur permet le retour aux parcours simulés, sans suppression des fichiers de quotas réels.

## Validation de développement

177 tests locaux réussis avec transports synthétiques : accès, confirmation, profil falsifié, transmission exacte des contraintes et du temps, résultat conservé sans modification, tentative globale persistante, erreur sans relance et préparation désactivée. Le scénario navigateur dédié vérifie les deux vues, leur bilan réel, le changement de profil sans réécriture, le passage ordinateur/mobile et un seul POST moteur. Ce contrôle utilise un faux moteur et ne mesure pas la pertinence des formations. La réussite CI doit être constatée sur le commit publié avant de l’annoncer.

Aucune activation hébergée ni génération réelle n’est effectuée par ces tests.

Coût OpenAI API : 0 token / 0 $.


## Affichage de l’essai consommé

La lecture authentifiée du dialogue transmet le quota durable du parcours, distinct du budget de dialogue. Le client supprime la proposition de génération dès que le plafond est atteint et affiche le nombre utilisé. Le même contrôle s’applique à l’ouverture d’un autre onglet, à une édition du profil et à l’actualisation de l’état. Un quota absent, invalide, arrêté ou indisponible bloque également la confirmation ; aucune génération n’est tentée pour vérifier cet état.

La réponse du parcours, y compris en erreur, fournit le quota courant lorsqu’il est disponible. Dès l’envoi d’une génération, le client suspend la possibilité de reconfirmer jusqu’à réception d’un état valide. Une erreur sans état ne réactive pas la génération. Le garde serveur existant continue de faire autorité : la disparition du bouton ne remplace pas le quota durable et n’en modifie jamais le contenu.

Les tests HTTP vérifient la restitution de 0/1 puis 1/1, la conservation après erreur et après réouverture du service, et l’indépendance du budget du dialogue. Le navigateur utilise exclusivement un faux moteur et vérifie le retrait du bouton, un nouvel onglet et le rechargement sur ordinateur et mobile, sans POST supplémentaire. Le redémarrage requis pour charger la nouvelle lecture serveur efface toujours le profil et l’usage en mémoire ; il ne remet aucun compteur à zéro.
