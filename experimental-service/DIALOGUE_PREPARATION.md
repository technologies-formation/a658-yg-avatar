# Préparation du dialogue privé — désactivée

## État de cette étape

`dialogue-session.mjs` prépare le contrat du dialogue en mémoire. Il n’est importé par aucun lanceur, route HTTP, ressource navigateur ou écran existant. L’interface installée et la maquette ne sont pas raccordées à ce module. Aucun fournisseur réel n’est raccordé à cette session. La préparation ultérieure du transport GPT-6 Luna et de son registre distinct est décrite dans CONNECTEUR_DIALOGUE_PREPARATION.md ; elle reste désactivée et séparée des lanceurs.

La fabrique est désactivée par défaut. Son activation de test exige un fournisseur déclaré `mode: 'simulation'`, un référentiel validé, un nombre maximal de tentatives et un délai explicites. Un fournisseur déclaré réel est refusé. `createScriptedDialogueProvider` fournit uniquement des réponses fixes pour les tests.

## Séparation des responsabilités

Le dialogue peut demander une précision, reformuler un objectif et proposer des corrections. Sa sortie structurée ne contient ni cours, ni catégories de recommandations, ni action de génération. La sélection reste la responsabilité du moteur existant du catalogue. Le texte d’une réponse doit être traité comme du texte, pas comme du HTML ou une commande.

Le service fournit des règles de comportement au futur adaptateur : une question à la fois, pas de public ou niveau supposé, durée et modalité distinctes, clarification des besoins divergents, aucune disponibilité ou inscription inventée. Ces règles et le schéma ne constituent pas une vérification sémantique des réponses d’une véritable IA : celle-ci reste à préparer et évaluer avant raccordement.

## Profil et confirmation

1. Le navigateur fournit un message avec identifiant unique, révision du brouillon et révision du référentiel.
2. Le fournisseur reçoit une copie immuable des règles, du brouillon, des choix et de l’historique borné.
3. Chaque modification proposée contient son champ, sa valeur et un extrait exact d’un message utilisateur identifié. Un extrait d’assistant ne constitue pas une preuve. Les champs et les valeurs des sélecteurs sont validés contre le référentiel existant.
4. La réponse renvoie une proposition ; le profil n’est pas modifié. Une preuve textuelle indique la source, sans garantir à elle seule la pertinence de la reformulation.
5. `acceptProposal` exige la proposition courante, la bonne révision et `confirmed: true`. Une correction manuelle ou un nouveau tour invalide la proposition précédente.
6. `getPathwayProfile` exporte seulement les données validées ; il ne lance aucune recherche et n’autorise pas un appel payant. Le futur raccordement doit conserver la confirmation, le ticket et les quotas de recherche existants.

Le champ `constraints` du brouillon représente les autres contraintes, sans préfixe de modalité déjà composé. La modalité reste séparée ; `composeConstraints` existant les réunit uniquement à l’export. Aucune réponse facultative n’est inventée.

## Limites de la préparation

- Aucun fichier, accès réseau, variable d’environnement ou secret n’est lu par ce module.
- Historique et compteurs sont en mémoire, pour une instance de session fournie par l’intégration ; ils ne constituent pas un quota durable de production.
- Une seule opération à la fois ; messages, réponses, historique et nombre de tentatives sont bornés.
- Une tentative est comptée avant le fournisseur. Une erreur, une annulation ou un délai dépassé ne déclenche aucun remboursement ni relance automatique.
- L’arrêt et l’annulation empêchent l’application des réponses tardives ; le délai reste borné même si le fournisseur ignore son signal.
- Les erreurs publiques portent des codes génériques, sans recopier les messages ni le contenu du fournisseur.

## Vérifications

14 tests spécifiques couvrent le refus par défaut, le fournisseur réel refusé, les propositions non appliquées, les références et preuves invalides, les corrections et révisions périmées, les doublons, quotas, délais, annulations, réponses tardives et bornes d’historique. La suite Node complète compte 145 tests réussis dans l’environnement de développement.

Ces tests utilisent des fournisseurs fictifs. Ils ne valident ni la qualité d’une véritable conversation, ni un coût réel, ni une intégration HTTP ou navigateur du nouveau module.

## Conditions avant un essai réel

Choisir le modèle et vérifier ses tarifs ; fixer un plafond de dépenses et des quotas durables ; définir la durée de conservation des échanges ; raccorder une route authentifiée aux contrôles HTTPS et d’origine existants ; vérifier les données envoyées ; adapter l’écran pour afficher et faire accepter les propositions ; puis tester sans moteur avant un essai réel explicitement autorisé. Le pilote existant ne doit pas être réactivé ou ses quotas réinitialisés par cette préparation.

Coût OpenAI API de cette préparation : 0 token / 0 $.
