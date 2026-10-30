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


### Publication autorisée et contrôles distants terminés

Le GO explicite de publication a été reçu. Code publié sur `fix/dialogue-course-relevance-2026-10-30`, commit `3ac02bcaa697d359ecfebebfef438fc100542a81` (arbre identique à la version locale validée). Contrôles GitHub réussis : sécurité Linux/Windows (run 41032139780), suite navigateur complète (run 41032139853), recherche et parcours guidés ordinateur/mobile, refus proxy, reprise, mémoire, exports et courriels avec transports fictifs. Les captures `v2-results-desktop.png` et `v2-results-mobile.png` ont été examinées : appréciation expliquée et métadonnées intégrées à l'interface existante. Cette validation remplace le statut d'attente de publication indiqué plus haut. L'installation Infomaniak n'a pas encore été effectuée.

Catalogue associé : `c807f71e3d118aabfd70a7721ed1d2d64e0506c6`. Installer ses deux modules après vérification des empreintes et sauvegarde, puis redémarrer le Catalogue ; installer ensuite le commit Assistant publié, après sauvegarde du code et des dossiers privés existants, et redémarrer l'Assistant. Ne pas remplacer le formulaire restauré, les fichiers statiques ou les compteurs. Le 403 persistant reste un refus de sécurité : la récupération gratuite bornée ne dispense pas d'un contrôle du proxy en production.

Coût OpenAI API de cette validation : 0 token / 0 $.

## 30 octobre 2026 — Affinage du dialogue après essais utilisateur

GO pour six ajustements : renouvellement HTTPS, réponses concises, liens officiels sur les noms de cours, propositions de modification de Ma demande, continuité entre essais du même objectif et distinction des acquis par outil. L'utilisateur valide la conservation des trois Cockpits lorsque le besoin reste général et des durées telles que publiées dans les fiches. Le Catalogue n'est pas modifié dans ce lot. Base Assistant : `9f7d6949e5c1d595e79fdcc3fb08f2b06b31b3b7`.

Le suivi reçoit désormais une comparaison bornée des trois derniers essais du même objectif, avec leurs filtres et leurs cours. Les messages en mémoire sont conservés entre ces essais, mais sont isolés lors d'un autre objectif ou effacés par une nouvelle demande. Les conversations brutes ne sont pas ajoutées aux sauvegardes privées. Après redémarrage, les recherches restent disponibles pour comparaison, sans reconstitution des messages anciens. Un ancien cours est une piste issue d'un autre périmètre, jamais une preuve de présence dans le filtre courant.

Les précisions étayées par des citations utilisateur deviennent des propositions en attente. L'acceptation explicite met à jour les critères ; le récapitulatif doit encore être confirmé séparément avant une génération payante. Le résultat enregistré reste inchangé et signalé comme antérieur aux nouveaux critères. Une proposition de niveau Excel non appuyée par une mention explicite d'Excel dans les preuves est refusée. Les instructions demandent de distinguer le niveau initial sur les cockpits des compétences bureautiques inconnues, de répondre brièvement (40 à 100 mots par défaut), et de réserver les détails aux demandes explicites. Les courriels complets restent autorisés.

Le rendu de dialogue utilise uniquement des nœuds DOM, jamais du HTML provenant du modèle. Paragraphes, listes et gras sont lisibles ; seuls les titres et codes de cours connus deviennent des liens, en gras, vers leurs URL officielles validées. Une URL inventée par le modèle ne crée pas de destination cliquable. En absence de résultat, le périmètre choisi est nommé et sa modification/retrait est proposé, sans élargissement automatique.

HTTPS : les lots d'attestation prennent en compte tous les pairs en attente, et non plus uniquement le premier demandeur. En cas de preuve manquante, le même échange attend un renouvellement gratuit après le refroidissement, puis est autorisé une seule fois ou refusé. Les délais et lots sont partagés et bornés ; les preuves sont également renouvelées périodiquement (deux minutes) pendant l'écoute du service. Host, protocole HTTPS, pair et preuve de retour TLS restent obligatoires. Aucun POST métier ou appel OpenAI n'est rejoué. Le délai HTTP du client et le délai du transport laissent une marge de 15 secondes à l'attestation ; le délai du modèle reste inchangé. Cela traite les courses et expirations identifiées dans le code ; un refus persistant de Host ou de protocole nécessite toujours l'analyse du proxy de production.

Validation locale : 266 tests réussis. Le scénario DOM authentifié fictif confirme l'affichage d'une proposition, le profil inchangé avant acceptation, les critères modifiés après acceptation, les anciennes recherches conservées et aucune seconde génération implicite. Le scénario navigateur ordinateur/mobile inclut les liens officiels, l'acceptation et le récapitulatif avant génération. Contrôles distants à vérifier sur le commit publié avant installation. Aucun appel OpenAI réel ni SMTP ; coût OpenAI API : 0 token / 0 $.

Installation prévue : Assistant seulement, après sauvegarde du commit installé et des dossiers privés, puis redémarrage de l'application Node.js. Ne pas changer les configurations privées, les recherches, les compteurs ni le Catalogue. Les propositions et messages en mémoire ne sont pas des écritures persistantes ; terminer ou abandonner une proposition avant redémarrage.


### Validation distante du lot d'affinage

Version de code publiée : `8e2c5b8c301e59d9285af1a053f6765c4835ef6d` sur la branche existante `fix/dialogue-course-relevance-2026-10-30`, arbre identique à la version locale validée. Contrôles GitHub réussis : tests Linux/Windows (run 41046304156) et suite navigateur complète (run 41046304252). Les captures de proposition sur ordinateur/mobile et du récapitulatif mobile ont été examinées : nom du cours en gras et lien officiel, choix d'application/refus lisibles, critères mis à jour seulement après acceptation, génération toujours à confirmer séparément. Aucun appel IA réel ni envoi SMTP. Cette validation complète la mention de contrôles distants en attente ci-dessus.

L'installation sur Infomaniak reste à faire : Assistant uniquement, après sauvegarde vérifiée du code installé et des dossiers privés, sans modification du Catalogue, des accès ou des compteurs. Après redémarrage, refaire un dialogue bref sur les absences et le Cockpit RH, accepter la proposition si elle convient, puis contrôler le récapitulatif avant une éventuelle génération payante. Confirmer en production la disparition des refus HTTPS intermittents ; les preuves de transport restent obligatoires. Coût OpenAI API des vérifications : 0 token / 0 $.

## Préparation de quatre accès privés et du jalon avant pilote

Décision utilisateur : remplacer la piste d'accès par adresse mail/code par quatre jeux individuels identifiant/mot de passe pour le premier groupe. L'accès actuel de l'opérateur est conservé. L'utilisateur demande de terminer les ajustements, d'établir un jalon stable avant ouverture et de mettre à jour son document de reprise autonome pour pouvoir reprendre sans les conversations. Ce document personnel n'est pas joint dans cette session ; sa dernière version devra être fournie pour une mise à jour fidèle, sans réécriture inutile.

Le module `experimental-service/provision-testers.mjs` prépare quatre identifiants `pilote-01` à `pilote-04`, chacun avec un mot de passe aléatoire distinct. Cette création est locale à l'hébergement, sans réseau ni appel IA. `--create` écrit une sauvegarde vérifiée de `users.json`, les quatre fiches d'accès et le fichier futur des comptes dans un dossier privé hors du site ; il ne modifie pas les comptes actifs. Le dossier est en 0700 et les fichiers en 0600. Aucun mot de passe n'entre dans Git, dans cette documentation ou dans une réponse de ChatGPT. Une seconde préparation est refusée afin d'éviter la rotation involontaire des mots de passe.

L'activation est une opération distincte `--activate`, après le jalon et la décision d'ouverture. Elle vérifie que les accès n'ont pas changé depuis la préparation, conserve les comptes existants et ajoute les quatre comptes ; un redémarrage est requis. `--disable ... pilote-01` retire uniquement un compte marqué testeur, sans effacer ses recherches ou tentatives. Le compte opérateur ne peut pas être désactivé par cette commande. `--report` donne les compteurs disponibles par identifiant, sans mot de passe. La correspondance entre personne et identifiant est conservée par l'opérateur, hors de Git.

Les comptes marqués testeurs ont, par défaut, dix messages IA et trois recherches/parcours par jour Europe/Paris. Les réservations sont durables et précèdent les appels susceptibles d'être payants ; un échec reste compté comme tentative. Les recherches et parcours partagent la même limite de trois. Les modifications de critères et les consultations ne consomment pas ces quotas. Les limites peuvent être ajustées explicitement dans la configuration privée via `participantLimits: {dialoguePerDay: 10, researchPerDay: 3}`. Il s'agit de limites d'usage, pas d'une garantie de dépense en USD. Le suivi monétaire agrégé existant reste indépendant. L'accès opérateur conserve son fonctionnement sans plafond d'essais ; ses compteurs ne sont pas remis à zéro. Les brouillons et résultats restent isolés par identité authentifiée. Les vérifications de mots de passe sont limitées à deux dérivations simultanées avec une file bornée, pour permettre plusieurs testeurs sans supprimer les protections de l'authentification.

Correction du défaut constaté lors des essais : lorsqu'une demande explicite de précision n'obtient qu'une reformulation, une intention précise sur le Cockpit RH/Paie/Formation, exprimée dans les messages conservés, peut compléter une proposition d'objectif. Le remplacement explicite d'une entité sélectionnée par une offre reconnue complète les champs `trainingOrganizers` et `trainingOffers` ensemble. Les valeurs proviennent du référentiel et les preuves des messages utilisateur ; les phrases vagues ou négatives ne déclenchent pas ce complément. Toute proposition reste à accepter ; aucun changement de critères ou parcours n'est appliqué silencieusement et la génération attend encore une confirmation distincte.

### Conditions du jalon avant ouverture

1. Tests et contrôles navigateur réussis sur une version publiée et identifiée, sans appel IA réel ni SMTP de test.
2. Installation sauvegardée de l'Assistant, redémarrage et contrôle HTTPS ; le Catalogue n'est pas modifié par ce lot.
3. Vérification opérateur du cas exact : précision « Cockpit RH — suivi des absences », retrait DIP-SEM, offre OPE, affichage des trois champs dans la proposition puis dans le récapitulatif après acceptation, sans génération implicite.
4. Préparation des quatre accès sans activation ; contrôle des fichiers privés et conservation de l'accès actuel, des résultats et des compteurs.
5. Mise à jour du document de reprise autonome personnel avec les références installées, décisions, sauvegardes, procédures et limites connues ; aucun secret.
6. Validation du jalon stable, repère Git documenté, puis seulement activation des comptes et transmission individuelle des accès. L'accès par mail reste une piste ultérieure, non développée ni activée.

État de cette section : préparation et contrôles locaux ; le jalon de production n'est pas encore validé et les quatre accès réels ne sont pas encore créés ni activés. Coût OpenAI API des tests automatisés : 0 token / 0 $.
