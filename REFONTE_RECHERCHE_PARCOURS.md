# Recherche de formations et construction de parcours

Branche de travail : feat/assistant-recherche-parcours-v2. Référence précédente : jalon/v1-avant-refonte-demande-2026-10-28, suivi dans l’issue #2.

## Fonctionnement

- Rechercher des formations : requête libre, sans profil fictif ni formulaire obligatoire, réutilisation de /api/search du Catalogue. Le bouton d’envoi annonce la recherche IA payante. Un identifiant est réservé durablement avant chaque POST, sans relance automatique.
- Construire mon parcours : identification progressive des besoins et brouillon Ma demande modifiable. Les modifications proposées par le modèle sont validées et étayées par des citations avant d’alimenter le brouillon. La confirmation payante globale du parcours reste distincte.
- Le groupe de personnel reste indépendant de l’environnement de travail. Un contrôle spécifique refuse une proposition de groupe uniquement déduite du mot Police.
- Les quatre parties du formulaire reprennent la maquette utilisateur : situation, besoin, disponibilités et périmètre. Le service employeur n’apparaît plus dans le nouveau formulaire. Les critères historiques restent dans leurs résultats enregistrés.
- Offres et entités organisatrices proviennent des cours courants. Les deux filtres se combinent par intersection, plusieurs valeurs d’un même filtre par union. Aucune sélection signifie sans restriction.
- La recherche et le parcours conservent leurs catégories et informations officielles. Les résultats de recherche directe ne sont pas présentés comme des étapes pédagogiques.
- Les recherches, PDF, courriels, consommations, accès privés et compteurs existants restent utilisés. Le récapitulatif quotidien compte également les recherches directes de l’Assistant, attribuées une seule fois.

## Activation et compatibilité

Le nouveau mode concerne le lanceur hosted-private-pilot.mjs. Les lanceurs historiques restent dans leur mode précédent par défaut. Aucune mise en ligne n’est effectuée par la publication de cette branche.

La branche Catalogue correspondante doit être installée d’abord : références enrichies dynamiques, filtres serveur, provenance et attribution des recherches. Elle conserve les corrections backend installées séparément avant la refonte. Ne pas remplacer les fichiers par l’ancien main.

Avant l’installation de l’Assistant : sauvegarder les configurations et les états privés existants hors de Git, en conservant aussi les états à la date du retour arrière. Le format de reprise reste version 2 et ajoute le mode choisi et les nouveaux critères. Une ancienne version du service ne connaît pas ces nouveaux critères : un retour à l’ancien code nécessite les sauvegardes compatibles et ne doit jamais supprimer des compteurs, réservations ou consommations ultérieurs. Aucun convertisseur automatique de retour arrière n’est inclus.

Ne jamais publier les clés, les configurations privées, les recherches réelles ou les sauvegardes. Ne pas lancer le serveur parallèlement en SSH. Aucun appel réel IA ni SMTP n’est nécessaire pour les tests automatisés.

## Vérifications

Tests de contrat et de recherche simulée : absence de profil obligatoire, preuves et brouillon progressif, mode conservé, valeurs de référentiel retirées, catégories et date, réservation durable et doublons, refus de relance après erreur, contrôle Police/PAT. Scénario navigateur dédié : les deux entrées, recherche, reprise, formulaire en quatre parties, passage vers le parcours, filtres transmis et conservation des résultats, ordinateur et mobile. Les anciens scénarios restent exécutés.

## Correction des reprises et des choix actualisés

Un nouveau parcours démarre avec des champs vides. Depuis une recherche de cours, seul le texte recherché devient l’objectif : le niveau, le métier, les contraintes et les filtres ne sont jamais repris d’une autre demande. L’action « Reprendre ma demande existante » conserve explicitement les critères. Une demande en cours n’est effacée qu’après confirmation, et les anciennes recherches restent conservées.

À chaque ouverture de Ma demande, les choix sont revalidés par le service Catalogue et sa date de données est affichée, même lorsqu’elle est antérieure au jour courant. Offres et entités proviennent des cours. Les catégories de situation professionnelle restent des référentiels métier servis par le Catalogue, distincts des publics des fiches. Aucun nouveau rapprochement de ces catégories n’est inventé.

Si les références changent pendant la saisie, les saisies restent affichées. L’actualisation proposée conserve ces saisies et signale les choix retirés, qui restent cochés jusqu’à une correction explicite. Une valeur retirée ne peut pas être envoyée au moteur.

Après la recherche directe, un message distinct de l’assistant annonce le nombre de formations et propose la consultation ou la construction d’un parcours. Les cartes de recherche ne portent plus le badge de piste facultative et n’affichent pas une justification générique sous le titre « Pourquoi ce cours ? ». Les justifications propres à un cours restent conservées.
