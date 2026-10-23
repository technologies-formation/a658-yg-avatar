# Raccordement de l’interface au dialogue fictif

## Réalisé sur la branche de préparation

`createDialogueSimulationInterface` assemble le nouveau dialogue avec les composants existants : authentification privée, référentiel du catalogue, session de dialogue, simulation du parcours et rendu commun aux onglets Discussion/Cours proposés. La fabrique reste désactivée par défaut et aucun lanceur hébergé ou local ne l’utilise automatiquement. Aucun déploiement ni changement de configuration du pilote installé n’est effectué par cette étape.

Le connecteur OpenAI et le registre de budget réel restent séparés et ne sont pas importés. Ce mode utilise exclusivement `createFictitiousDialogueProvider`, qui reconnaît quelques formulations explicites de test. Il ne constitue pas une IA ni une évaluation de qualité du dialogue libre.

## Parcours vérifiable

1. Un message est transmis à la route privée de dialogue.
2. Le fournisseur fictif propose une modification avec un extrait utilisateur ; le brouillon accepté reste inchangé.
3. L’écran affiche les valeurs proposées et les actions « Appliquer ces corrections » / « Garder mon profil actuel ».
4. L’acceptation exige la proposition et la révision courantes. Le refus conserve le profil. Une modification manuelle invalide la proposition précédente.
5. Une fois les repères complétés, une confirmation séparée permet uniquement une simulation de parcours.
6. Les deux vues présentent le même résultat conservé. Une correction ultérieure signale le parcours à actualiser ; elle ne relance rien.

Le groupe et la situation managériale proviennent des options exactes du référentiel. Le niveau, le temps et la modalité ne sont pas remplis par défaut. « Mon profil » permet également l’édition d’un brouillon incomplet ; la validation complète reste obligatoire avant la simulation du parcours.

Exemples reconnus par le faux fournisseur : « Je voudrais mieux organiser mes tâches et mes priorités », « Je suis assistant administratif », une valeur ou un libellé exact du groupe, « Je débute », « 1 à 2 jours », « En ligne ». Chaque proposition attend une acceptation. Les autres formulations peuvent conduire à une demande de précision de démonstration.

## Frontière serveur

La route de dialogue est traitée après les mêmes contrôles d’authentification, de transport et d’origine que les autres ressources privées. Toute mutation exige l’origine exacte et un corps JSON borné. Les sessions sont isolées par l’identité vérifiée côté serveur ; les identités envoyées dans un corps ne sélectionnent aucune session. La capacité est bornée à huit identités, dix tours fictifs par session, sans éviction ni remise à zéro automatique.

Le point optionnel `beforePathway` du contrôleur partagé est absent par défaut. Dans cette interface uniquement, il bloque un parcours tant qu’une proposition attend une décision, et vérifie que le profil envoyé est exactement le profil accepté, normalisé par le référentiel. La confirmation, le ticket à usage unique et les quotas existants du parcours restent requis. Les simulations conservent leur compteur persistant distinct.

Les ressources serveur, notamment le connecteur OpenAI, ne sont pas servies au navigateur. Les textes de dialogue sont affichés via `textContent`. Aucun fournisseur réel ou secret n’est accessible à ce mode.

## Rechargement et erreurs

Un GET retrouve le brouillon accepté et une éventuelle proposition encore en attente, sans appliquer celle-ci. Le résultat du parcours n’est pas restauré après rechargement. La commande « Nouvelle demande » efface les repères et le résultat de l’écran ; elle ne réinitialise ni les tours déjà tentés ni les quotas de parcours. Les erreurs et les réponses tardives ne déclenchent aucune relance automatique.

La session est en mémoire : elle n’est pas une conservation durable de conversation. Une modification du référentiel bloque la session courante plutôt que de convertir silencieusement ses valeurs. La reprise après changement de référentiel reste à préparer avant un lancement utilisateur.

## Vérifications

Quatre nouveaux tests HTTP couvrent le mode désactivé, les ressources protégées, les origines, l’isolation entre utilisateurs, l’acceptation, le refus, les propositions périmées, les corps trop volumineux et le profil lié à la génération. La suite Node complète compte 159 tests réussis localement.

`dialogue-browser-check.mjs` parcourt l’écran en ordinateur et mobile, avec un serveur local et deux comptes synthétiques distincts. Il vérifie l’absence de simulation avant confirmation, l’acceptation des corrections, les deux vues et le résultat conservé après édition. Les requêtes navigateur vers une origine extérieure sont bloquées. Son résultat GitHub doit être consulté avant de revendiquer une validation navigateur.

## Suite

Cette fabrique est un assemblage de test, sans commande de lancement pour le pilote installé. La mise à disposition d’un essai utilisateur nécessite encore le choix du mode de lancement et de la session isolée. Le raccordement d’un fournisseur réel demandera un adaptateur explicite préservant la provenance, les confirmations et l’usage facturé ; il ne faut jamais faire passer le connecteur réel pour un fournisseur fictif.

Coût OpenAI API de la préparation et des tests fictifs : 0 token / 0 $.


### Validation GitHub du raccordement

À la révision de code `83ffc596151b285a0f630edf029b5fe5530d37f5`, le workflow de sécurité `39988077505` et le workflow navigateur `39988077734` ont réussi. Les captures ordinateur et mobile de l’interface fictive ont été examinées. Le rapport confirme une simulation de parcours par écran, aucune génération avant confirmation, l’acceptation obligatoire des propositions, le résultat conservé après correction et aucune requête externe du navigateur. Les données utilisées sont synthétiques ; cette validation ne mesure pas la pertinence d’un parcours réel ou la qualité d’une conversation IA.
