# Modalité du cours et préférence de la personne

Le contrat de résultat accepte désormais une preuve facultative `course.deliveryMode` : `value` vaut `online`, `in_person`, `hybrid` ou `unknown`. Une valeur connue exige `sourceField: 'titleRaw'` et une `evidence` identique au titre renvoyé. Une valeur inconnue exige une source et une preuve nulles. Une ancienne réponse dépourvue de ce champ reste compatible et est affichée comme non renseignée.

Le moteur du catalogue produit cette donnée à partir d’une étiquette explicite de modalité dans l’intitulé. Il ne déduit jamais le présentiel de l’absence d’e-learning, d’une durée ou d’exercices. Ce mécanisme volontairement conservateur ne certifie pas une session : les conditions de la fiche officielle restent à vérifier. La branche correspondante du catalogue est `feat/pathway-modality-evidence`.

L’affichage distingue la modalité renseignée et la préférence explicitement confirmée par la personne. Il signale une compatibilité non établie si la modalité est inconnue, un écart si elle est différente, et une vérification nécessaire pour l’hybride. Il ne change ni les catégories, ni l’ordre, ni les justifications. La préférence est conservée dans le cliché du parcours ; une modification ultérieure du profil ne modifie pas rétroactivement les cartes déjà reçues. Discussion et Cours proposés utilisent le même rendu.

Les consignes du moteur demandent aussi de distinguer ces notions dans les textes générés, notamment de ne pas appeler la préférence « invérifiable » lorsque seule la modalité du cours est inconnue. Les tests de ces consignes utilisent des réponses préparées : ils ne démontrent pas l’obéissance d’un modèle réel.

179 tests locaux passent avec transports fictifs. Le scénario navigateur du parcours vérifie les cas inconnu, différent et conforme dans les deux vues, leur conservation après modification du profil et un seul POST au faux moteur. Les contrôles CI doivent être vérifiés sur le commit publié.

Cette correction ne transforme pas les résultats antérieurs, ne réinitialise aucun quota et ne permet aucune nouvelle tentative après l’épuisement de l’essai réel. Aucun redémarrage ou test payant n’est inclus dans ce jalon.

Coût OpenAI API : 0 token / 0 $.
