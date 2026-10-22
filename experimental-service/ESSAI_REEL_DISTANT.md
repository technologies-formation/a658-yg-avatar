# Préparation de l’essai réel privé distant

Cette préparation ne modifie pas le service en cours et ne constitue pas une autorisation d’appel payant. Une validation distincte est nécessaire avant activation et confirmation dans le navigateur. Ne pas utiliser de profil personnel pour cet essai.

`hosted-real.mjs` est un lanceur séparé, désactivé par défaut. L’environnement de simulation ne peut pas l’activer. La lecture de configuration rend également `enabled: false` et ne crée ni compteur ni rapport.

Le lanceur réutilise le transport HTTPS attesté, l’authentification privée et le questionnaire existants. Le raccordement au moteur et le rapport sont communs à l’essai local. Le compteur réel distant est distinct des compteurs de simulation et de l’essai local : une tentative quotidienne et totale, réservée sur disque avant le POST. Une erreur, une annulation ou un délai dépassé ne rembourse pas la tentative. Aucun nouvel appel automatique n’est prévu.

Le navigateur attend au maximum 210 secondes ; le moteur dispose de 200 secondes et le socket interne de 215 secondes. Le délai du proxy externe reste à vérifier lors de l’essai autorisé. Une interruption du proxy ne permet pas de conclure que le moteur n’a pas travaillé : ne pas recommencer.

Après succès, un rapport privé contient l’usage retourné par le moteur et les codes des formations, sans profil ni identifiants. Un rapport existant n’est pas écrasé. Son échec d’écriture n’entraîne pas de nouvel appel. La fermeture technique conserve le compteur ; l’arrêt administratif est persistant. Le verrou exclusif refuse un second processus utilisant le même compteur. Après une interruption brutale, un verrou peut rester présent : vérifier l’absence du processus avant toute intervention, sans effacer le compteur.

## Vérification sans moteur

Les tests `hosted-real.test.mjs` injectent tous les appels sortants. Ils vérifient le refus par défaut, le transport avant authentification, l’absence de POST avant confirmation, le rapport après succès, les erreurs et délais synthétiques, le quota conservé après redémarrage, la non-transmission des identifiants et la séparation de la simulation. Les suites existantes continuent de vérifier le raccordement local, l’attestation HTTPS et le questionnaire partagé.

L’activation distante, la durée réelle derrière le proxy et la qualité des recommandations restent à vérifier séparément. Les tests n’effectuent aucun appel payant.
