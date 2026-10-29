# Préparation du pilote public A658-YG — 28 octobre 2026

## Décisions et état

L'utilisateur souhaite un premier accès sans compte pour une ou deux personnes. Il a choisi une enveloppe de **5 USD pour l'ensemble du premier essai**, avec PDF téléchargeable et courriels limités aux adresses autorisées des testeurs. La proposition de limites est de dix messages de dialogue et trois recherches/parcours par navigateur et par jour.

Cette branche prépare ces mécanismes. **Aucun lanceur existant n'importe le module public, aucune route publique n'est montée, aucun service n'est déployé ou activé.** Le Catalogue n'est pas modifié. Le pilote privé conserve son authentification, ses états et son fonctionnement.

## Mécanismes préparés

- Cookie aléatoire de 256 bits, Secure, HttpOnly, SameSite=Strict et sans Domain. Création depuis la seule page du test ; durée fixe de sept jours. Aucun identifiant de session transmis par le client ne sélectionne un utilisateur privé.
- Chaque visiteur possède son instance, son brouillon, son historique, ses réservations et son dossier de reprise. La racine publique et la racine privée doivent être séparées, sans imbrication. Vingt admissions au maximum pour ce premier pilote ; effacer les cookies ne renouvelle pas l'enveloppe globale.
- Le registre commun compte dix messages et trois recherches/parcours par jour (Europe/Paris), une cadence de dix secondes entre départs payants, et une seule opération coûteuse à la fois. Il n'utilise pas l'adresse IP d'un proxy comme identité de visiteur.
- Réservation sur disque avant le premier transport susceptible d'être payant. Un seul comptage puis une génération pour un dialogue, ou un seul POST Catalogue pour une recherche/parcours. Pas de relance automatique, pas de remboursement après un résultat incertain.
- Politique et point de contrôle indépendants des fichiers de réservation. Une fin de journal supprimée, une archive corrompue, un lien symbolique, un changement de politique ou une horloge incohérente provoquent un refus. Un redémarrage ne remet pas l'enveloppe à zéro.
- Courriels sur un transport et un journal publics distincts : seulement vers une ou deux adresses validées côté serveur, pour une recherche appartenant à la session. Deux tentatives par visiteur et dix au total par jour ; réservations et doublons conservés. Les tests utilisent uniquement des adresses `.invalid` et un transport fictif.
- PDF, présentation et logique de recherche existants réutilisés. Les compteurs du public sont affichés comme des limites quotidiennes ; le visiteur ne reçoit aucune demande de paiement. Les routes et ressources du pilote privé ne sont pas exposées par le routeur public.

Un cookie anonyme ne prouve pas l'identité d'une personne. Les limites par navigateur peuvent être contournées par une nouvelle session ; les admissions bornées et surtout le plafond global restent donc nécessaires. Le caractère peu connu d'une URL n'est pas une restriction d'accès.

## Enveloppe de 5 USD : limite de la préparation actuelle

Le registre applique un plafond de **5 000 000 micro-USD de réservations**, avec des provisions initiales de 0,01 USD par dialogue et 1,25 USD par recherche/parcours Catalogue. Elles sont conservatrices et ne sont jamais présentées comme la consommation réellement facturée. Elles peuvent interrompre le test avant qu'une personne atteigne ses limites quotidiennes.

**Cette politique n'est pas encore validée comme garantie de dépense facturée de 5 USD.** L'activation requiert les attestations explicites `billingReviewed` et `backendBoundsReviewed`, toutes deux absentes ou fausses par défaut. Elles représentent une revue de l'opérateur ; le programme ne vérifie pas automatiquement le compte de facturation. Aucun lanceur ni commande d'activation ne sont fournis dans ce lot.

L'audit du code montre un dialogue sur `gpt-6-luna`, comportant un comptage préalable, et des moteurs Catalogue à deux passes sur `gpt-5.6-luna`. Les bornes doivent couvrir les deux passes, le palier de contexte, l'écriture de cache et le niveau de service réellement appliqué. Les versions composites effectivement installées côté Catalogue devront être vérifiées avant toute évolution ; ne pas les remplacer depuis main.

La consultation de la documentation officielle n'a pas établi une tarification explicite du comptage préalable dans les pages examinées. Il ne faut ni en affirmer la gratuité ni remplacer cette incertitude par un coût inventé. Le suivi de consommation existant ne suffit pas à empêcher un dépassement : les bornes doivent être établies avant le départ des requêtes. Les autres utilisations du compte API et les taxes ne sont pas incluses dans ce registre de pilote.

Sources officielles consultées le 28 octobre 2026 :

- [Tarification OpenAI](https://developers.openai.com/api/docs/pricing)
- [Comptage préalable](https://developers.openai.com/api/docs/guides/token-counting)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

## Validation et suite

Validation locale : **262 tests réussis**, dont isolation de deux visiteurs, reprise après redémarrage, plafonds et cadence, archive endommagée, suppression de fin de journal, refus d'un cinquième départ Catalogue après épuisement des réservations, arrêt entre comptage et génération, destination de courriel non autorisée, résultat d'une autre session, doublon et requête malformée. Aucune connexion OpenAI ni SMTP réelle.

Un scénario navigateur distinct prépare les contrôles ordinateur/mobile : accueil, compteur, recherche, PDF, refus d'une adresse hors liste et envoi fictif vers une adresse autorisée. Le contrôle navigateur complet reste à exécuter et à examiner avant de valider cette préparation.

Restent avant ouverture : audit des bornes de coût et du moteur réellement installé, raccordement explicite à l'hébergement en conservant le privé, configuration privée des adresses autorisées, contrôle visuel et d'isolation complet, sauvegarde et installation opérateur, puis décision d'activation. Une simple publication de cette branche ne rend pas le service public.
