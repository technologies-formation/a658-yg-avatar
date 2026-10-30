# Assistant formation — référence avant pilote

État vérifié le 30 octobre 2026 avec l'opérateur. Ce guide est le point d'entrée de la documentation technique du dépôt Assistant ; il complète le document de reprise personnel du 30 octobre 2026, remis à l’utilisateur et déclaré sauvegardé. Ce dernier a été rédigé avant la pose du tag ; la confirmation ci-dessous actualise ce point.

## État courant et références

| Élément | Référence et portée |
| --- | --- |
| Nom du jalon retenu | Assistant formation — référence avant pilote |
| Tag Git publié et vérifié | `jalon-assistant-avant-pilote-2026-10-30` → `d45b45aace503dbd4ceed3494bcbf7275cb0580f` |
| Assistant installé, confirmé par SSH | `daa6746a815a30a567ce2e70babf7518c3454178` ; suivi quotidien actualisé après le jalon |
| Code applicatif installé avant la consigne | `daa6746a815a30a567ce2e70babf7518c3454178` ; la consigne est le lot suivant |
| Branche de livraison Assistant | `fix/dialogue-course-relevance-2026-10-30` |
| Lanceur utilisé | `experimental-service/hosted-private-pilot.mjs`, mode opérateur privé |
| Accès du premier groupe | Quatre comptes activés et service redémarré ; connexion pilote-01 confirmée par l’opérateur, trois autres connexions à vérifier |
| Publication anonyme | Non activée ; aucun accès public créé par le jalon |
| Catalogue | Service séparé ; aucun changement de code Catalogue dans le lot quatre accès et dans cette mise à jour documentaire |

La version installée est distincte d'un éventuel commit documentaire ultérieur. Ne pas demander une réinstallation applicative pour une simple mise à jour des documents. Le snapshot de données est lui aussi distinct de la version des modules serveur.

## Constats transmis par l'opérateur

- SSH renvoie exactement `13fd45b2f90b5a1d594a4ac54936fe7e7d8f2610`.
- Le contrôle local de configuration renvoie « Préparation des accès : présente » et « Comptes testeurs activés : 0 ». Il constate le marqueur de préparation et les comptes chargés ; il ne prouve pas à lui seul une sauvegarde externe ou la connexion de chaque futur testeur.
- Les derniers journaux de redémarrage annoncent le mode opérateur privé et « Contrôle HTTPS du proxy réussi ». Un refus initial « host » reste visible dans l'historique : sa cause n'est pas établie et sa disparition définitive n'est pas revendiquée.
- Le scénario réel d'affinement est vérifié par captures : proposition puis acceptation du besoin « Cockpit RH — suivi des absences », sélection DF-OPE et suppression de l'entité DIP-SEM. Le formulaire montre DF-OPE seule cochée et aucune entité organisatrice. La reprise de la demande conserve ces critères et les autres repères (Pouvoir judiciaire, chef, nouveau manager, débutant dans le domaine, dix jours, sans préférence de modalité).
- Après acceptation, un bouton distinct demande encore de confirmer la génération payante. Les captures ne montrent aucune nouvelle génération pour ce contrôle ; aucune réussite d'une nouvelle recommandation n'en est déduite.

Les captures et les messages réels restent hors du dépôt public. Ce bilan décrit les observations, sans publier de recherche, identité de testeur ou donnée privée brute.

## Décisions fonctionnelles à conserver

1. Pour une demande générale sur les cockpits sans précision, les trois cours RH, Paie et Formation sont jugés cohérents par l'utilisateur. Ne pas les supprimer ou réordonner arbitrairement à l'affichage.
2. Conserver les durées officielles, y compris la notation inhabituelle du Cockpit Paie ; ne pas la corriger par supposition.
3. Dialogue bref par défaut, avec noms de cours en gras et liens officiels validés. Les détails restent disponibles sur demande. Un niveau débutant sur un cockpit ne prouve pas un niveau débutant sur Excel.
4. Distinguer offres de formation et entités organisatrices. Les deux familles de filtres se combinent par intersection ; remplacer une entité restrictive par une offre peut nécessiter de vider la première.
5. Un cours d'une recherche antérieure est une piste issue de cet ancien périmètre. Il ne prouve pas sa présence dans le filtre courant. Un résultat vide doit nommer le périmètre et permettre une modification explicite.
6. Une précision utilisateur devient une proposition étayée ; seul son accord modifie Ma demande. La génération payante exige encore sa propre confirmation. Ne pas relancer automatiquement un appel métier après une erreur.
7. Les mentions « Présentiel présumé », disponibilité à vérifier et prérequis restent distinctes de la pertinence ; ne pas transformer une hypothèse en certitude.

## Preuves techniques de la version applicative

- 273 tests Node locaux réussis, avec transports fictifs.
- Scénario DOM/HTTP authentifié réussi : une recherche, une génération fictive, quatre tours de dialogue et deux lectures de ticket. Ce contrôle vérifie des contrats, pas une mise en page à lui seul.
- [Contrôles Linux/Windows](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/41055416903) réussis.
- [Suite navigateur ordinateur/mobile](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/41055417164) réussie ; captures de proposition ordinateur et de récapitulatif mobile examinées.
- Artefact navigateur `12976782138`, empreinte SHA-256 `2058c9ec15bdd6dd43377e1fcae91a10201c0be5cc3dad60c9f3493b3c694c1d`. Les artefacts CI ont une conservation limitée ; ne pas en faire l'unique sauvegarde de reprise.
- Préparation/non-activation, préservation opérateur, concurrence de quatre identifiants, isolation, quotas et redémarrage sont vérifiés avec identités fictives. Ils ne constituent pas quatre connexions réelles sur Infomaniak.

Aucun appel OpenAI API ni SMTP réel n'a été lancé par l'agent pour ces tests : 0 token / 0 USD. Les essais réels de l'opérateur sont distincts et leur coût n'est pas inféré des captures.

## Quatre accès : exploitation et limites

`provision-testers.mjs --create CHEMIN_CONFIG` a déjà été exécuté sur l'hébergement. Ne pas le relancer pour retrouver un affichage perdu. Il prépare `pilote-01` à `pilote-04`, les fiches individuelles et les comptes futurs dans un dossier privé voisin, sans remplacer `users.json`. Un marqueur `tester-batch.json` permet de retrouver ce dossier. Conserver une copie protégée du dossier de préparation en plus des dossiers privés habituels ; ne jamais copier les fiches dans Git, un document ou le chat.

Les comptes testeurs portent `pilotTester:true`. Par défaut chacun dispose de dix messages IA et de trois recherches/parcours combinés par jour, Europe/Paris. Réservation durable avant appel ; une tentative échouée reste comptée. Consultation et acceptation de critères ne consomment pas ces quotas. `participantLimits` peut changer explicitement les deux valeurs ; ne pas ajuster les limites ni effacer les réservations pour rejouer un essai. Le compte opérateur conserve son mode sans plafond d'essais, ses historiques et compteurs.

Le registre `participant-usage` mesure les tentatives par identifiant, les cumuls et la dernière activité disponible. Il ne garantit ni l'identité réelle de la personne ni un coût monétaire par testeur. L'opérateur conserve séparément la correspondance personne/identifiant. Ne pas demander une adresse mail ni développer une inscription publique pour ce premier groupe.

Les commandes suivantes sont des références d'exploitation, pas une instruction d'activation immédiate. Elles s'exécutent depuis le répertoire installé avec le chemin de configuration privé existant :

| Commande du module `experimental-service/provision-testers.mjs` | Effet |
| --- | --- |
| `--report CHEMIN_CONFIG` | État/usage disponible des comptes actifs, sans mot de passe ; `[]` avant activation ne signifie pas préparation absente |
| `--activate CHEMIN_CONFIG` | Vérifie la préparation et les accès inchangés, ajoute les quatre comptes ; redémarrage requis |
| `--disable CHEMIN_CONFIG pilote-01` | Retire durablement ce compte testeur uniquement, avec sauvegarde ; redémarrage requis |

Les quatre comptes sont chargés au démarrage. HTTP Basic utilise le dialogue natif du navigateur ; ce n'est pas une page d'inscription. Le navigateur peut conserver les identifiants. Pour couper un accès, retirer le compte durablement puis redémarrer ; ne pas promettre une déconnexion universelle par fermeture d'onglet. Les mots de passe sont générés sur l'hébergement, stockés sous forme d'empreintes salées dans les comptes ; seules les fiches privées de remise contiennent les mots de passe en clair. Dossier 0700, fichiers 0600, remise individuelle hors Git et hors chat.

## Sauvegarde, arrêt et retour arrière

Avant toute intervention, relever le commit installé et sauvegarder code, configuration, états privés, recherches, réservations et compteurs. Inclure le dossier privé de préparation des quatre accès. La procédure d'installation précédente créait une sauvegarde privée ; son chemin et son archivage externe n'ont pas été retransmis et restent à consigner hors du dépôt public. Ne pas inventer leur vérification.

Utiliser le gestionnaire Node.js de l'hébergement pour redémarrer ou arrêter le service ; ne pas lancer un second serveur depuis SSH. Un arrêt conserve les fichiers privés. Un refus HTTPS ne doit pas conduire à désactiver les preuves de transport ou à rejouer une génération.

Tant que les testeurs sont inactifs, une restauration de code ne doit pas changer leurs accès. Après activation, retirer leurs comptes avant de revenir à un code antérieur sans quotas testeurs. Préserver les états créés depuis la sauvegarde ; ne pas remplacer aveuglément `users.json`, ni restaurer des compteurs anciens pour récupérer des tentatives. Une procédure de coupure doit rester disponible à l'opérateur pendant le pilote.

## Achèvement du jalon et ouverture : étapes restantes

Le nom est retenu et le contrôle fonctionnel ciblé est validé. Cela ne signifie pas que le pilote est ouvert ni que tous les cas métier sont certifiés.

- Documentation publiée ; tag `jalon-assistant-avant-pilote-2026-10-30` créé et vérifié le 30 octobre sur `d45b45aace503dbd4ceed3494bcbf7275cb0580f`. La [publication GitHub](https://github.com/technologies-formation/a658-yg-avatar/releases/tag/jalon-assistant-avant-pilote-2026-10-30) est marquée avant-version ; elle n’active aucun service ni accès.
- Document personnel autonome du 30 octobre remis ; l’utilisateur a confirmé sa sauvegarde. Les 17 instructions d’origine et la consigne de reprise sans ancien échange sont conservées. À sa prochaine actualisation, remplacer le statut « tag à poser » par la référence publiée ci-dessus.
- Retrouver et vérifier la sauvegarde privée d'installation et celle de la préparation des accès ; garder leurs emplacements dans les notes privées d'exploitation.
- Fixer l'enveloppe monétaire du groupe, le seuil d'arrêt et le contrôle effectif du suivi. Les limites 10/3 ne sont pas un plafond USD. Le récapitulatif quotidien et son seuil d'alerte ne constituent pas une coupure automatique ; son activation actuelle n'a pas été recontrôlée ici.
- Ouvrir ensuite les comptes par l'opération distincte d'activation, redémarrer, vérifier HTTPS et un accès individuel, puis remettre les accès séparément. Ne pas lancer de génération réelle pour simplement tester la connexion.
- Les tests sur appareil mobile physique, le réseau institutionnel et la connexion simultanée réelle des quatre testeurs ne sont pas établis par la suite navigateur simulée.

## Carte de la documentation

| Document | Usage |
| --- | --- |
| [Historique de la refonte](REFONTE_RECHERCHE_PARCOURS.md) | Décisions, livraisons successives et compatibilité |
| [Validation des versions](VALIDATION_VERSION_ASSISTANT.md) | Preuves automatiques et bilan opérateur |
| [Plan historique de validation](VALIDATION_PILOTE.md) | Série fixe du 25 octobre ; ne pas la relancer pour ouvrir le groupe |
| [Accès pilote](experimental-service/ACCES_PILOTE.md) | Authentification et préparation des quatre accès |
| [Reprise privée](experimental-service/REPRISE_PRIVEE.md) | Persistance des critères/résultats et limites de mémoire |
| [Attestation HTTPS](experimental-service/PROXY_ATTESTATION.md) | Transport, refus et absence de relance payante |
| [Suivi quotidien](experimental-service/SUIVI_QUOTIDIEN.md) | Consommation agrégée, alertes et limites budgétaires |
| [Catalogue : guide technique](https://github.com/technologies-formation/catalogue-formations/blob/fix/course-relevance-2026-10-30/GUIDE_REPRISE.md) | Service séparé et références Catalogue |

Les documents historiques décrivent leurs jalons datés et leurs lanceurs propres. Un ancien statut « non déployé » ou un ancien quota n'est pas l'état courant du mode opérateur. En cas de reprise sans conversation, partir de ce guide, vérifier le commit réellement installé et l'état privé avant toute modification.


## Évolution suivante du suivi quotidien

Modification autorisée après le jalon : solde théorique à vérifier dans l’objet du courriel, estimation fondée sur les dépenses connues même si certains coûts manquent, avertissement explicite et lien direct vers le solde réel OpenAI. Voir [le suivi quotidien](experimental-service/SUIVI_QUOTIDIEN.md). Le tag avant pilote reste figé sur `d45b45a` ; ce correctif ultérieur doit être installé séparément. La valeur du nouveau repère reste dans la configuration privée, hors Git. Les quatre accès ne sont pas activés par ce lot.


## Consigne de confidentialité pour les quatre testeurs

Évolution autorisée : les testeurs décrivent leurs besoins réels de formation sans données confidentielles. À la prochaine installation de ce lot, chaque compte marqué `pilotTester` devra valider la consigne avant de commencer. Une fenêtre présente la consigne et les exemples à éviter. À la demande de l’utilisateur, le paragraphe sur la transmission à l’API OpenAI et l’identification des personnes est retiré de cette fenêtre ; les traitements du service ne changent pas. La case « J’ai compris et je m’engage à respecter cette consigne » active le bouton « Commencer ». Échap ne ferme pas cette fenêtre ; l’utilisateur peut quitter le site sans accepter.

L’accord est enregistré par empreinte de l’identité authentifiée dans le sous-dossier privé `participant-usage/confidentiality`, avec version de la consigne et date d’acceptation uniquement. Aucun contenu d’échange, nom ou mot de passe n’y est ajouté. Une réouverture ou un redémarrage conserve l’accord du compte ; les quatre accords restent indépendants. Les comptes opérateur non marqués testeurs ne reçoivent pas ce verrou.

Le serveur refuse les modifications et les requêtes métier des testeurs avant accord, y compris depuis un ancien onglet. Accepter ne consomme aucun quota et ne lance ni IA, ni recherche, ni courriel. En cas d’erreur de stockage, les échanges restent bloqués. Les résultats et compteurs existants sont conservés. L’écran ne constitue pas un filtre automatique du contenu : l’utilisateur doit respecter la consigne.

Code publié de ce lot : `166c353b9f6ec91309e7bc5a9a9d5f6710e12be0`. 278 tests locaux réussis, régressions HTTP avec transports fictifs ; contrôles GitHub Linux/Windows réussis (run 41113329159), suite navigateur complète réussie (run 41113330097). Les quatre identités fictives vérifient l’accord obligatoire, la case et le bouton, le clavier, une erreur de sauvegarde, la reprise et les quotas inchangés. Captures des quatre comptes examinées, dont ordinateur jour et mobile nuit ; artefact 13003634158, SHA-256 76ac0dce9314282f93c4a5d1e73b1bc94f4382182e77c221be44bddad6f648a3. Le premier essai navigateur avait relevé un rappel manquant dans le mode de simulation ; le correctif du client est inclus dans la référence finale. Installation Infomaniak et validation réelle de l’écran encore à effectuer. Installer ce commit après sauvegarde vérifiée du code et des états privés puis redémarrer ASSISTANT ; ne pas relancer la préparation ou l’activation des comptes. Après installation, recharger une session testeur déjà ouverte pour obtenir le nouvel écran. Aucun accord réel ni fichier privé n’est créé par la publication du code. Coût OpenAI API des tests : 0 token / 0 USD. Le suivi du budget pilote reste manuel.


### Affichage confirmé puis allègement du texte

L’opérateur confirme par SSH l’installation `0fc22e7c9b5f08c3aa710f7cc7a61154b01b243e`, puis fournit les captures réelles de la fenêtre de confidentialité. Il demande de retirer uniquement le troisième paragraphe sur l’API OpenAI et l’identification des personnes. La case, le bouton, la persistance de l’accord et le contrôle serveur restent identiques ; les accords déjà enregistrés restent valables. Ce retrait de texte est un correctif ultérieur à installer séparément.
