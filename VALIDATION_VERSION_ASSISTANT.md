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


## Fiabilisation avant préparation du public — 28 octobre 2026

L'alerte GitHub affichée par l'opérateur concernait le commit0e25a48d4bc286a2a11585bc2c235bffc8d489ee, échec navigateur40672718216. Le test recherchait l'intégralité d'une bulle avec correspondance textuelle exacte alors qu'elle contenait aussi des boutons. Le correctif48e280b adapte le sélecteur et suit l'ouverture réelle du formulaire. La versionaf4d520 installée a les contrôles navigateur40709391465 et sécurité40709391523 réussis. Les notifications anciennes restent l'historique de ces essais, pas un état courant du service.

Correctif suivant : une seule invitation de reprise, réutilisée et focalisée lors de clics répétés ; retrait de cette invitation après choix effectivement appliqué. Annulation ou erreur conserve la demande et les autres recherches.

Le dialogue guidé précise les trois valeurs canoniques de modalité et sépare la préférence souple dans constraints. Les espaces de bord sont normalisés, comme les autres critères. L'effacement d'une contrainte est possible avec demande explicite et citation vérifiée ; une citation inventée, une modalité composée ou un changement non conforme restent refusés sans mutation partielle du brouillon. Le coût vérifié et la tentative sont conservés, sans relance automatique.

Pour les réponses refusées, le diagnostic authentifié utilise seulement une catégorie bornée(format, change, modality, field, evidence), sans recopier le contenu reçu. L'interface fournit une explication compréhensible et un accès à Ma demande. La cause exacte du cas réel de préférence souple n'a pas été établie : ces tests ne la reconstituent pas et ne garantissent pas l'absence future de réponse non conforme.

Les essais navigateur rejouent trois ouvertures, une annulation puis une reprise, et une réponse malformée volontaire après un tour valide. Ils vérifient message unique, données identiques, absence de nouvel appel automatique, récupération manuelle, historique et compteurs.

L'ouverture publique est en attente. Le mode courant reste authentifié. Avant un public anonyme, préparer séparément l'isolation des visiteurs, les limites durables, la limitation de cadence et les tests associés ; aucun de ces mécanismes n'est prétendu activé par ce correctif. Les dernières consignes de recommandation et le traitement du dialogue restent à valider avec l'opérateur.

## Retour opérateur et refus HTTPS — 28 octobre 2026

L'opérateur a installé cc7668b après sauvegarde privée et a confirmé le redémarrage et le contrôle HTTPS. Les captures montrent une invitation de reprise unique, le retrait de cette invitation après reprise et le critère enregistré conservé. Un essai réel de préférence souple a ensuite abouti : modalité En ligne et acceptation du présentiel si la formation correspond mieux au besoin. Ce résultat valide ce cas, pas toutes les réponses futures du modèle.

Un essai précédent affichait une erreur de parsing JSON dont le corps commençait par Transport. Le transport hébergé possède précisément un refus 403 en texte avant le gestionnaire authentifié. Le refus ne s'est pas reproduit au contrôle sans authentification (401 attendu) et l'essai réel suivant a réussi. Le statut HTTP de la requête initiale n'a pas été capturé : la correspondance avec cette branche est forte, mais la cause du refus reste inconnue. Aucun coût réel de cet essai n'est déduit de la capture.

Le correctif suivant fournit un refus JSON stable pour les API, une lecture défensive des réponses de l'Assistant (y compris les anciens refus texte et les pages HTML d'erreur), un message compréhensible et l'accès à Ma demande après échec du dialogue. Aucun corps brut d'erreur n'est affiché. Un refus de transport connu n'entraîne pas de rafraîchissement supplémentaire du budget ; aucune requête payante n'est rejouée.

Le journal du transport ajoute une catégorie bornée, au maximum une fois par cinq secondes : host, protocol, peer, stopped, unverified_peer ou exact_address_check. Aucune adresse, URL, authentification ni donnée métier n'y figure. unverified_peer signifie seulement que le pair n'est pas attesté après les contrôles ; cela ne prouve ni une rotation du proxy ni un défaut de TLS. L'origine, le protocole, les preuves TLS, leur validité, les limites et les refus sont inchangés. Aucun réseau d'hébergeur n'est ajouté à une liste de confiance.

Validation locale : 246 tests réussis avec transports fictifs, dont compatibilité JSON/texte, refus non JSON, absence de contenu brut, diagnostic borné, protection du nouveau module privé et refus avant challenge Basic sans modification de compteur. Le scénario navigateur ajoute des refus texte/JSON et une erreur HTML sur ordinateur et mobile, en vérifiant critères, recherches, récupération manuelle et nombre d'appels. Son exécution GitHub doit être confirmée avant installation ; le navigateur local n'est pas disponible dans l'environnement de préparation.

Installation distante de ce nouveau lot et validation du diagnostic encore en attente. La cause du refus intermittent et les conditions d'ouverture publique restent ouvertes. Aucun appel IA réel ni SMTP n'est lancé par l'agent.
