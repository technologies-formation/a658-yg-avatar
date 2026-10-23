# Mise à disposition du dialogue fictif — préparation

## Nouveau mode explicite

Le lanceur de simulation existant accepte désormais `interface: 'dialogue-fictitious'`. Le choix par défaut reste inchangé. Les modes `legacy` et `messaging` conservent leur fonctionnement et aucun mode réel n’est ajouté.

Le nouveau mode emploie le même transport privé, le même contrôle de proxy HTTPS, les mêmes comptes et le même fichier de quotas de parcours. La fabrique de transport peut recevoir un assemblage privé explicite ; elle ne crée alors pas une seconde session de simulation concurrente. Le compteur retourné est celui de l’assemblage effectivement utilisé.

Le dialogue utilise exclusivement le fournisseur fictif. Aucune clé, destination OpenAI ou activation payante n’est lue. Les textes reconnus sont ceux documentés dans DIALOGUE_INTERFACE_SIMULATION.md. Cette étape ne valide pas une conversation IA réelle.

## Sélection de l’interface

`setHostedSimulationInterface(configFile, siteDirectory, interfaceName)` exige une configuration privée existante et valide et un mode autorisé. Il crée une sauvegarde privée à nom unique, puis remplace atomiquement la seule configuration. Les fichiers d’accès, référentiels, exemples et quotas restent inchangés. Une sélection identique est sans effet.

Deux options du lanceur permettent la sélection explicite, sans démarrer de serveur :

- `--use-fictitious-dialogue` : sélectionner le dialogue fictif ;
- `--use-messaging-interface` : revenir à la messagerie guidée.

Ces options reçoivent le chemin de la configuration privée. Le répertoire de travail doit rester celui du site, comme pour le lanceur existant. Aucun secret ne doit être imprimé. Le changement prend effet au redémarrage manuel du lanceur de simulation déjà utilisé, avec sa configuration habituelle. Aucun quota ne doit être supprimé ou réinitialisé.

## Fermeture et compteurs

La fermeture technique arrête les sessions de dialogue en mémoire et libère le verrou de transport, sans révoquer l’accès ni marquer le quota persistant comme arrêté. Un redémarrage retrouve le nombre de parcours déjà simulés. La révocation explicite reste une opération séparée.

Les tours de dialogue fictifs restent en mémoire et sont bornés par identité. Ils ne représentent pas un budget réel et ne modifient pas les quotas des essais payants antérieurs. Le registre de budget OpenAI préparé reste séparé et inutilisé.

## Vérifications

Deux tests spécifiques couvrent le passage par le proxy, le refus avant authentification sur transport non sûr, l’authentification des ressources, le parcours lié au profil accepté, la conservation du compteur après fermeture/réouverture, la sauvegarde de configuration et le retour au mode guidé sans changement des autres fichiers.

La suite Node complète compte 161 tests réussis localement. Les validations HTTP et navigateur de l’interface fictive restent décrites dans DIALOGUE_INTERFACE_SIMULATION.md. Il faut vérifier les contrôles GitHub de la révision destinée à l’installation.

## État du déploiement

Ce document décrit une préparation testée. Le téléchargement sur un hébergement, la sélection de configuration et le redémarrage doivent chacun être confirmés par leur retour réel avant de déclarer le nouveau mode installé. Aucun déploiement distant n’est revendiqué à ce stade.

Coût OpenAI API de cette préparation : 0 token / 0 $.
