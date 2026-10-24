# Préparation hébergée du dialogue IA — désactivée

## Périmètre

`hosted-dialogue-trial.mjs` ajoute un lanceur distinct. Les commandes et configurations des pilotes existants restent inchangées. Aucun déploiement ou essai payant n’est revendiqué par ce jalon.

Le lanceur réutilise l’origine fixée, le port, l’authentification et l’attestation HTTPS du transport existant. Il raccorde uniquement le dialogue au connecteur IA ; les parcours restent simulés. Un verrou de transport et le registre de budget empêchent les instances concurrentes sur une même session.

## Préparation hors ligne

Depuis le répertoire du site, exécuter le nouveau module avec `--prepare` et le chemin absolu de la configuration fictive existante. Aucune clé n’est lue, aucune requête n’est envoyée, aucun serveur n’est démarré.

Le helper crée une destination privée voisine, déterministe, suffixée `.dialogue-trial`. Si elle existe déjà, il refuse de l’écraser : il faut reprendre la configuration déjà préparée. Les fichiers d’accès hachés, de référentiel et d’aperçu sont copiés avec des permissions privées. Le dossier et son sous-dossier `dialogue-budget` sont protégés. Aucune clé ni champ inconnu de la configuration source n’est recopié. Une destination dans un dépôt Git est refusée.

Les anciens quotas, rapports et configurations ne sont ni copiés ni modifiés. La nouvelle session possède ses propres chemins de quotas de parcours et de budget de dialogue. Cette séparation ne constitue pas une autorisation de renouveler un essai : le même dossier de budget doit être conservé pendant tout l’essai.

La configuration produite contient trois verrous à `false` : `dialogueTrial.enabled`, `dialogueTrial.paidTrialAuthorized`, `dialogueTrial.billingReviewed`. Le modèle reste fixé à la politique existante. L’option `--check` vérifie cette configuration sans clé, réseau ni création de registre ou de verrou de lancement.

## Lancement ultérieur

Le lancement effectif exige les trois autorisations explicites dans la configuration privée, la variable serveur `AVATAR_DIALOGUE_TRIAL_ENABLED=true` et une clé fournie uniquement par `AVATAR_DIALOGUE_OPENAI_API_KEY`. Aucun secret ne doit figurer dans une commande, dans Git ou dans une réponse de chat. Une configuration désactivée est refusée avant la lecture de cette clé.

Aucune commande de mise en activation n’est fournie à ce stade. Le lancement concret doit être précédé de la vérification de l’accès au modèle et des conditions de facturation. La mention `billingReviewed` est une attestation de revue par l’opérateur, pas une vérification automatique du compte par le programme.

Après autorisation, le lanceur emploie le contrôle HTTPS automatique existant ; aucun challenge d’authentification n’est envoyé sur transport non attesté. Le démarrage et l’ouverture d’une page ne lancent pas de génération. Chaque message réel exige `paidTrialConfirmed: true`. Aucune relance automatique n’est ajoutée. L’arrêt technique libère les verrous sans supprimer les tentatives ; un arrêt explicite conserve un marqueur durable.

## Budget et facturation : vérifié et restant à établir

Le registre réserve au plus 10 × 0,01 USD. Les tarifs Standard de génération et l’écriture de cache longue du modèle ont été revérifiés le 23 octobre 2026 ; la majoration conservatrice du connecteur reste inférieure à la réservation de 0,01 USD par tentative dans les limites de tokens fixées.

Les pages officielles de comptage expliquent le décompte préalable exact, mais ne précisent pas dans les sections consultées la facturation de cet endpoint. La page des tarifs consultée n’en fournit pas de ligne dédiée. Il ne faut donc ni affirmer sa gratuité ni présenter 0,10 USD de réservations comme une garantie sur l’ensemble des frais ou de la facture du compte. Ce point reste non résolu ; `billingReviewed` demeure à `false` dans toute préparation produite ici. La disponibilité effective du modèle sur le compte n’a pas non plus été testée.

Sources consultées :

- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count

## Vérifications

Trois tests supplémentaires couvrent la préparation exclusive hors ligne, les permissions, les anciens fichiers intacts, les refus avant lecture d’une clé et le transport hébergé avec faux connecteur. Le scénario HTTP vérifie le refus sans HTTPS, l’absence d’appel à l’ouverture, la confirmation du message et le budget conservé après fermeture/réouverture.

Un test supplémentaire vérifie un port occupé : les ressources de la nouvelle instance sont fermées, ses verrous sont libérés, le serveur déjà actif continue et les réservations du budget restent intactes. Les lanceurs signalent proprement le refus d’écoute. Cela ne supprime pas automatiquement un verrou ancien laissé par une version précédente après crash.

La suite complète compte 172 tests locaux réussis. Tous les transports de génération utilisés par ces tests sont fictifs. Les contrôles GitHub doivent être vérifiés sur la révision destinée à la préparation distante. La préparation réelle, son chemin et son état désactivé devront être confirmés par le retour de la commande exécutée sur l’hébergement.

Coût OpenAI API : 0 token / 0 $.
