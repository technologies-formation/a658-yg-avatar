# Validation des versions de l’Assistant

Ce document distingue l’installation d’un correctif dans le pilote privé de la validation fonctionnelle de l’ensemble de l’assistant. Un résultat vert des tests automatiques ne valide pas à lui seul la pertinence des réponses IA. Le plan historique de trois essais du 25 octobre reste dans VALIDATION_PILOTE.md ; il ne doit pas être réécrit comme si de nouveaux essais avaient déjà été exécutés.

## Contrôles techniques avant installation

| Contrôle | Preuve attendue |
| --- | --- |
| Contrats et logique serveur | Suite locale complète et contrôle de sécurité CI réussis sur la version candidate |
| Parcours ordinateur et mobile | Scénarios navigateur complets, sans erreur JavaScript ; clavier, navigation et fenêtre de demande utilisables |
| Recherche directe et parcours guidé | Transports simulés ; pas de formulaire imposé à la recherche directe ; confirmation distincte avant génération |
| Données de la demande | Départ vide, reprise explicite, aucun critère inventé, critères de recherches précédentes figés |
| Référentiel | Rafraîchissement des choix, date réelle du catalogue, saisies conservées, valeurs retirées signalées |
| Résultats et exports | Même recherche, ordre, durées, liens et avertissement dans discussion, synthèse, PDF et pièce jointe ; MIME vérifié sans SMTP |
| Reprise et historique | Actualisation, changements de vue et fermeture d’un onglet sans génération ni remise à zéro des compteurs |
| Effets externes | Aucun appel IA payant ni courriel réel pendant les contrôles de développement |

Les scénarios existants couvrent ces contrats avec des données fictives. Ajouter à la suite une régression ciblée quand une anomalie observée le justifie ; ne pas transformer un simple test d’affichage en affirmation de qualité des recommandations.

## Validation fonctionnelle avec l’opérateur

Les essais réels restent explicites et tracés, sans relance après erreur ou délai dépassé. Ils doivent vérifier les besoins représentatifs : recherche connue par code/titre/objectifs, besoin guidé, croisement environnement/groupe de personnel, compétences déjà acquises, temps et préférence souple, filtres offres/organisateurs, demande hors périmètre, accès/prérequis, alternatives sans redondance.

Comparer les critères saisis au récapitulatif, puis les résultats de Discussion, Cours proposés et du PDF. Examiner les cours sur le contenu réellement transmis, pas sur l’égalité à une liste de codes attendue. Le dépassement du temps est un repère métier, pas un échec automatique. Les mentions explicites et les modalités présumées restent distinctes.

## Bilan de chaque version

Consigner la référence de code installée, la sauvegarde, les contrôles automatiques réussis, les observations réelles de l’opérateur et les points encore ouverts. Une perte de données, un appel payant involontaire, un contournement d’accès ou une régression critique empêche d’approuver la version concernée. Les autres points doivent rester explicitement identifiés et acceptés dans le contexte du pilote ; ne pas présenter l’ensemble de l’assistant comme validé si des scénarios métier restent à examiner.

## Correctif Apparence — 28 octobre 2026

Portée : déplacer l’interrupteur jour/nuit dans l’en-tête latéral, à droite de l’identité de l’assistant. Le titre APPARENCE et le réglage en bas sont retirés. La préférence locale et son mécanisme existant sont conservés ; aucun critère, résultat, quota, moteur ou envoi n’est modifié.

Régression dédiée : emplacement unique dans l’en-tête, cible d’au moins44px, absence de chevauchement avec identité et fermeture mobile, activation au clavier, infobulle décrivant l’action, persistance après rechargement et longue liste fictive de18recherches défilantes sans intersection avec le réglage. Vérifier le rendu des captures ordinateur et mobile après le contrôle navigateur.

État local :239tests réussis avec transports fictifs. Contrôle CI et inspection des captures à consigner dans le bilan opérateur avant installation.

Points indépendants encore ouverts : validation réelle des dernières consignes moteur (acquis, temps indicatif et modalités), échec ponctuel invalid_response dans le dialogue, duplication de la proposition de reprise, libellés Personnel administratif/Personnel enseignant, bouton répétitif pendant les questions, présentation Sans restriction pour les filtres vides et nuance de modalité dans le résumé. Leur correction n’est pas revendiquée par le déplacement d’Apparence.
