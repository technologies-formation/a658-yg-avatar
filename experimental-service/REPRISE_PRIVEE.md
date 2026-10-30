# Reprise privée du profil et du dernier parcours

> État courant au 30 octobre 2026 : voir [Assistant formation — référence avant pilote](../GUIDE_REPRISE.md). Assistant installé `13fd45b`, affinement RH/absences + OPE sans entité DIP-SEM vérifié par l’opérateur, quatre accès préparés et zéro testeur activé. Les étapes datées ci-dessous restent historiques ; le pilote du groupe n’est pas ouvert.

Le lanceur de dialogue hébergé active une sauvegarde dans le sous-dossier `resume` du dossier privé existant. Le dossier est protégé en 0700 ; les fichiers JSON sont protégés en 0600 et nommés par empreinte SHA-256 de l’identité authentifiée. La fabrique d’interface conserve un fonctionnement sans persistance lorsqu’aucun dossier de reprise n’est fourni. Aucun chemin de sauvegarde n’est servi par les routes publiques.

Chaque fichier contient uniquement la version du format, le profil accepté, sa modalité souhaitée, la révision de référentiel et le cliché du dernier parcours reçu. Ce cliché conserve le profil confirmé à sa création, les cours, leur ordre, leurs justifications, les liens, la durée, l’usage moteur et le mode réel ou simulé. Les clés, mots de passe, messages bruts, propositions non acceptées et compteurs ne sont pas sauvegardés dans ces fichiers. L’historique intégral de conversation et l’usage du dialogue restent en mémoire.

Les acceptations de propositions et éditions du profil sont enregistrées par remplacement atomique. Après réception du moteur, le dernier résultat est enregistré sans nouvel appel réseau de génération. Une modification de profil conserve le résultat précédent ; l’interface le marque à actualiser. « Nouvelle demande » efface le profil et le dernier parcours sauvegardés pour ce compte, sans remettre aucun quota à zéro. Un rechargement ou une nouvelle ouverture reconstruit l’affichage depuis le cliché validé, sans sélection, reclassement, nouvelle génération ni acceptation automatique.

Une sauvegarde illisible, trop volumineuse, liée symboliquement ou insuffisamment protégée est refusée ; elle n’est pas remplacée par une reprise vide. Le profil restauré est revalidé contre le référentiel actuel : une ancienne valeur devenue invalide peut bloquer la reprise et nécessite une correction explicite du fichier privé ou une restauration administrative. Un résultat de révision différente reste identifiable comme à actualiser lorsque le profil est encore valide. Le mode enregistré sur le résultat contrôle son affichage, indépendamment du mode courant de génération.

Si l’écriture échoue, l’interface reçoit `resumeSaved: false` et affiche une alerte demandant de garder l’onglet ouvert. Un parcours déjà généré est néanmoins retourné et conservé en mémoire : l’erreur de sauvegarde ne transforme pas la génération réussie en invitation à la relancer. Les anciens fichiers valides restent en place jusqu’à une écriture réussie.

## Installation et limites

Un redémarrage est nécessaire pour charger la sauvegarde côté serveur. Les compteurs du dialogue et du parcours restent dans leurs fichiers historiques, sans modification. Les informations uniquement présentes en mémoire avant ce premier redémarrage doivent être préservées séparément. Cette évolution ne reconstitue pas les anciens parcours dont le résultat complet n’a jamais été enregistré. Elle n’autorise aucune nouvelle tentative payante.

La reprise ne restaure pas une conversation mot pour mot : elle signale le dernier parcours retrouvé et remet à disposition le profil accepté. Les propositions en attente après un redémarrage ne sont jamais appliquées automatiquement. Les fichiers de reprise restent jusqu’à une nouvelle demande ou une suppression administrative ; aucun service externe ne les reçoit à la lecture. Un tour de dialogue ultérieurement envoyé continue de transmettre le profil accepté au fournisseur selon le fonctionnement existant.

## Vérifications

Les tests de stockage contrôlent les permissions, l’isolation, la corruption, les liens symboliques, la validation et la conservation de l’état précédent en cas de refus. Les tests HTTP vérifient la reprise après réouverture du service, le cliché inchangé après modification du profil, l’effacement explicite sans remise à zéro et l’échec d’écriture après génération. Le scénario navigateur compare les cartes retrouvées dans un nouvel onglet et dans les deux vues sur ordinateur et mobile. Tous ces tests utilisent des profils, clés et transports fictifs ; aucun moteur réel n’est sollicité.

Coût OpenAI API : 0 token / 0 $.


## Complément actuel — 30 octobre 2026

La reprise conserve aussi le mode de recherche, les critères d’offres et d’entités et les recherches enregistrées selon le format courant. Le cas opérateur vérifié après acceptation et reprise conserve l’objectif Cockpit RH/absences, DF-OPE et aucune entité DIP-SEM. Les profils et résultats restent isolés par identité authentifiée. Les propositions en attente et les conversations brutes ne deviennent pas des sauvegardes de reprise.

Le dialogue peut comparer jusqu’aux trois derniers essais du même objectif depuis les archives ; un cours historique est une piste de cet ancien périmètre. Les messages restent en mémoire pendant les échanges du même objectif, sans reconstitution mot pour mot après redémarrage. Une nouvelle demande et un changement d’objectif isolent ce contexte. Les archives ne sont pas régénérées après une modification de critères.

Les quotas testeurs du registre `participant-usage` sont durables et distincts des fichiers de reprise et du suivi monétaire. Reprendre, éditer ou consulter une demande ne remet aucune tentative à zéro. Sauvegarder également le dossier privé de préparation des quatre accès, hors dépôt et hors document public. L’état du jalon et les limites figurent dans le [guide actuel](../GUIDE_REPRISE.md).
