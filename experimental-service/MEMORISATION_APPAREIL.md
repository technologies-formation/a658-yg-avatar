# Retrouver sa demande sur un appareil — pilote privé

L’option est facultative, décochée par défaut, dans **Ma demande**. Aucun cookie supplémentaire n’est créé. Après consentement, le navigateur conserve une copie des critères acceptés et des recherches ouvertes dans son stockage local. Les messages de discussion, propositions non acceptées, mots de passe, clé OpenAI et secret de signature n’y figurent pas.

Le choix vaut trente jours à partir de la première activation. Les mises à jour de la copie ne prolongent pas ce délai. Après expiration, la reprise est refusée ; la copie est supprimée lors de la prochaine ouverture de l’application. Un navigateur fermé ne permet pas à l’application d’effacer physiquement ses données en arrière-plan. Les réglages du navigateur permettent aussi de supprimer les données du site. L’option est à éviter sur un ordinateur partagé.

Au retour, une copie différente de la demande présente n’est jamais appliquée automatiquement : **Reprendre la copie** demande une seconde confirmation ; **Annuler** ne modifie rien ; **Continuer ici** met à jour la copie avec la demande actuellement affichée. Une copie identique n’ajoute pas d’avertissement inutile. Reprendre remplace les critères et la liste des recherches de cet accès privé ; la discussion repart sans l’ancien contexte. Les quotas, identifiants de tentatives et registres de consommation sont conservés. Aucune génération IA, simulation, notification ou envoi de courriel n’est déclenché par ces actions.

**Oublier ma demande sur cet appareil** retire la copie locale et arrête ses mises à jour. Cela ne supprime ni la demande ouverte ni les recherches conservées sur le serveur du pilote privé. Cette distinction est expliquée dans l’interface. Une copie n’est jamais recherchée dans le stockage d’un autre accès privé. Un changement d’accès détecté impose le rechargement de la page avant une nouvelle mémorisation.

## Protection et reprise

Les copies sont liées à l’origine et à l’identité authentifiée du pilote. Le serveur signe leur contenu et leur échéance ; une copie modifiée, expirée ou provenant d’un autre accès est refusée sans remplacement de l’état courant. Les routes existantes restent soumises à l’authentification, au transport HTTPS validé, à l’origine attendue et aux confirmations explicites. Le jeton d’état et la révision du brouillon évitent de remplacer un état qui aurait changé depuis son affichage. La taille de la copie est bornée à 1 Mio ; les schémas des critères et recherches sont revalidés. Le navigateur ne reçoit jamais la clé de signature.

La clé privée est créée exclusivement à la première sauvegarde volontaire dans `resume/device-memory/device-copy-key.json` du dossier privé existant, permissions 0600 dans un dossier 0700. Elle doit rester hors du site public et de Git. Une perte de cette clé rend les anciennes copies non reprenables ; elle n’efface pas les données déjà sauvegardées sur le serveur. Ne jamais imprimer cette clé ni les fichiers de copie dans une conversation ou un journal.

Le stockage local contient des données lisibles par les scripts de la même origine et par une personne ayant accès au profil du navigateur ; la signature assure l’intégrité et ne chiffre pas les données. Le consentement, l’avertissement sur les appareils partagés et l’effacement sont donc essentiels. Le navigateur peut bloquer ou vider ce stockage : l’interface signale l’échec sans présenter la copie comme enregistrée et conserve la dernière copie valide si elle existe.

## Activation

La fonctionnalité est désactivée par défaut. Dans le lanceur de dialogue hébergé, ajouter `AVATAR_DEVICE_MEMORY_ENABLED=true` à l’environnement de démarrage existant puis redémarrer le service. Les autres indicateurs de lancement et fichiers d’environnement restent inchangés. Cette activation rend l’option disponible ; chaque personne doit encore la choisir explicitement.

Retirer l’indicateur désactive les actions de mémorisation et de reprise après redémarrage ; il ne supprime pas à distance une copie dans un navigateur fermé. Avant un retrait définitif, proposer l’effacement dans l’interface ou via les réglages du navigateur. Aucun compte ni accès public anonyme n’est créé par cette évolution.
