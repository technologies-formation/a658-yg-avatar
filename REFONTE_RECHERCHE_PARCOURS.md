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


## Ajustements de pertinence et modalités — 28 octobre 2026

Décisions issues de la validation opérateur : le temps disponible est un repère à reconsidérer, pas un plafond qui justifierait de supprimer une étape nécessaire. L'écart arithmétique reste affiché. Le conseil partagé écran/PDF est au conditionnel : « Ce parcours pourrait nécessiter plus de temps que vous ne l’aviez envisagé. » L'étalement et la discussion avec la hiérarchie sont des possibilités, jamais des décisions déjà prises.

La préférence de modalité départage des réponses de pertinence comparable ; une préférence souple ne doit pas favoriser le cumul d'un e-learning généraliste avec des modules ciblés redondants. Le moteur peut toujours recommander un e-learning si son contenu/niveau répond le mieux au besoin ou si la modalité est une exigence exclusive.

Règle métier transitoire expressément validée : rechercher une modalité explicite dans le titre et le descriptif. En son absence, considérer le cours en présentiel, avec provenance `catalogue-default` et affichage « Présentiel présumé ». Ce n'est pas un indicateur SIRH : ne pas inventer un flag ni certifier la correspondance avec une préférence. Une mention contradictoire ou une simple référence au sujet e-learning reste « à vérifier ». Les anciens résultats ne sont ni régénérés ni requalifiés.

L'Assistant accepte les preuves `titleRaw`, `generalInformation`, `content`, `objectives`, `additionalInformation` ainsi que l'hypothèse `catalogue-default` réservée au présentiel sans preuve textuelle. Le PDF et la pièce jointe de courriel utilisent le même rendu. Le titre PDF reprend désormais l'objectif complet ; les libellés abrégés de navigation sont conservés.

Déploiement : installer d'abord l'Assistant compatible avec les nouvelles provenances, puis le seul module `server/pathwayEngine.mjs` du Catalogue. Pas de migration ni remise à zéro des états. Une marche arrière du moteur d'abord reste compatible avec les états existants ; ne pas réinstaller un ancien Assistant incapable de lire les résultats déjà reçus avec les nouvelles provenances.

Retours conservés pour un lot suivant : libellés Personnel administratif / Personnel enseignant ; retrait du bouton répétitif Compléter ou modifier pendant les questions ; afficher Sans restriction pour les filtres vides ; mieux classer les difficultés dans objectif/acquis plutôt que contraintes ; conserver la nuance de préférence souple dans le résumé des critères. L'échec ponctuel invalid_response sur une réponse de préférence souple n'a pas une cause établie : ne pas le déclarer corrigé par ces règles du moteur. Tout réinitialiser reste différé.

Disposition Apparence : chevauchement avec les recherches signalé par opérateur. Proposition à valider avant développement : interrupteur compact soleil/lune en haut à droite de l'identité de l'assistant. Aucun déplacement inclus dans ce lot.

Validation locale : 239 tests Assistant et 386 tests Catalogue réussis, transports simulés exclusivement. Ces contrôles prouvent les contrats, la conservation des résultats et les règles envoyées au modèle ; ils ne remplacent pas une future évaluation des recommandations réelles. Aucun appel IA payant ou courriel lancé par l'agent.


## Suite de l'essai — acquis et rangée de temps

- Les trois cartes disponibilité, durée et dépassement restent sur une seule rangée, avec des largeurs égales et des valeurs non coupées. Les libellés peuvent revenir à la ligne dans leur carte. Contrôles navigateur ajoutés sur ordinateur, mobile et largeur320px, sans changer le calcul ou l'ordre des cours.
- Les premières générations réelles confirment le déplacement du e-learning en alternative mais révèlent encore un socle imposé pour vérifier des acquis, un objectif interprété transformant le repère de temps en plafond et des identifiants techniques dans le texte. Les consignes sont renforcées dès la première passe et distinguent les prérequis réellement manquants des maîtrises à confirmer. Les identifiants de provenance sont traduits dans les explications ; les preuves structurées restent inchangées.
- « / Formation autonome en ligne » est reconnu comme déclaration explicite de modalité dans le titre. Une simple mention du sujet e-learning reste insuffisante.
- Les recherches antérieures sont conservées, sans relance ni réécriture automatique. Le déplacement Apparence et les autres retours du dialogue restent dans le lot UX à valider.


## Interrupteur Apparence et validation des versions

Déplacement validé par l’opérateur : interrupteur compact dans l’en-tête, à droite de l’identité de l’assistant, suppression du titre APPARENCE et du bloc en bas. Le libellé accessible Mode nuit reste associé à l’état du commutateur ; une infobulle indique l’action Mode jour/Mode nuit. La préférence sur cet appareil est conservée. Aucun moteur, état métier ou compteur ne change.

VALIDATION_VERSION_ASSISTANT.md distingue les contrôles techniques avant installation, les essais métier de l’opérateur, les anomalies ouvertes et le bilan de chaque version. Ne pas assimiler un contrôle de ce bouton ou une suite simulée réussie à la validation générale de l’assistant.


## Reprise et réponse de dialogue refusée

Une invitation de reprise identifiée est réutilisée au lieu d'empiler des messages. Après reprise réussie elle est retirée ; après annulation elle reste utilisable, sans effacer critères ou recherches.

Le contrat des réponses est conservé : citations exactes et valeurs du référentiel obligatoires, application atomique. Préférence souple : modalité canonique et phrase séparée pour les exceptions ; pas de difficulté métier classée comme contrainte. Une erreur de format n'entraîne ni nouvelle requête IA ni perte des critères ; son explication donne accès au formulaire. Un diagnostic borné facilite l'enquête privée sans enregistrer de réponse brute. Le pilote reste privé pendant la validation des anomalies connues et la préparation d'un éventuel mode public distinct.

## Lot validé le 30 octobre 2026 : dialogue et fiches de cours

GO utilisateur : implémenter les ajustements issus du scénario Cockpits et la maquette de pertinence acceptée. Base Assistant : `d96fd736ae407333e247c1afc4d5fa32d98b5ef9`. Le pilote public n'est pas activé par ce lot.

- Le fournisseur réel reçoit maintenant le champ et le texte de la question affichée. Les réponses explicites courtes sur la fonction, le niveau débutant et le temps peuvent être enregistrées littéralement sans IA. Les questions et formulations ambiguës restent au dialogue. Un choix managérial n'est jamais déduit de « chef ».
- Pendant les questions guidées, les raccourcis redondants vers le formulaire sont supprimés. L'entrée Ma demande du menu reste disponible.
- Après une recherche ou un parcours, le dialogue reçoit un contexte construit côté serveur depuis l'archive du compte : critères confirmés, propositions, explications et limites. Il peut expliquer, comparer et rédiger un courriel, sans retour automatique au questionnaire, modification du profil, génération ou envoi. Les précisions suivantes restent dans le même échange ; changer de recherche isole l'historique envoyé. Le bouton de discussion d'un cours transmet son code vérifié dans l'archive.
- Les cartes affichent offre(s), entité organisatrice, appréciation qualitative et justification. Ces métadonnées proviennent du Catalogue. Les catégories et l'ordre du moteur ne changent pas à l'affichage. Sans appréciation dans une ancienne archive : « Correspondance à préciser », jamais de pourcentage ou de score déduit. Sans offre/organisateur : « Non renseignée ». La justification détaillée se déplie ; accès, modalité et disponibilité restent distincts.
- La lecture gratuite du ticket préalable peut être reprise une seule fois après 5,1 secondes, uniquement après un refus HTTPS. Aucun POST, tour IA ou appel moteur n'est rejoué. Un refus persistant conserve les critères et bloque la génération. La cause exacte du 403 observé en production reste à confirmer dans les diagnostics du proxy ; le contrôle de transport n'est pas assoupli.
- Le calcul de durée affiche la convention 8 h/jour et précise que les compléments et alternatives sont exclus du total recommandé.

Validation locale : 258 tests Assistant réussis ; scénario DOM/HTTP authentifié complet avec transports fictifs réussi (une recherche, une génération, trois tours de dialogue, deux GET de ticket dont un refus simulé). Ce contrôle DOM ne prouve pas la mise en page. Le scénario Playwright ordinateur/mobile a été adapté et son workflow est activé sur la branche du correctif pour validation navigateur distante. Aucun appel OpenAI réel ni SMTP n'est requis.

Installation : Catalogue d'abord (`server/llmSearch.mjs` et `server/pathwayEngine.mjs` seulement), puis Assistant. Conserver le formulaire Catalogue restauré et ne pas remplacer `dist`. Sauvegarder les deux anciens modules, le commit Assistant et les états privés hors du site avant remplacement/redémarrage. Le format des recherches et des compteurs reste compatible ; ne jamais les effacer ni les remettre à zéro. Les archives antérieures ne sont pas régénérées pour ajouter une appréciation.

Coût OpenAI API des vérifications : 0 token / 0 $.

État de livraison au 30 octobre : corrections et contrôles locaux terminés ; publication GitHub et installation non réalisées. La revue automatique exige une autorisation explicite de publication du nouveau code dans les deux dépôts publics, même si leur propriété et les droits d'écriture ont été vérifiés via la connexion GitHub. Les contrôles navigateur distants restent donc à exécuter après publication. Chromium n'est pas disponible localement dans cet environnement ; le scénario DOM réussi ne constitue pas une validation visuelle.
