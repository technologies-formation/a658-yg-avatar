# Essai interactif local de l'avatar V5

Ce mode est independant de Luna et de l'API OpenAI. Il sert l'interface V5 sur une adresse locale et valide les demandes avec le garde-fou de simulation existant. Le secret est genere en memoire par le serveur et n'est jamais transmis au navigateur.

## Preconditions

- Node.js 22 ou version plus recente installe sur l'ordinateur de test.
- Depot `a658-yg-avatar` recupere localement, branche `feat/avatar-interactive-local`.
- Aucun abonnement ni hebergement supplementaire.

## Demarrage

Depuis la racine du depot, dans un terminal :

- macOS / Linux : `AVATAR_TEST_ENABLED=true node experimental-service/local-demo.mjs`
- Windows PowerShell : `$env:AVATAR_TEST_ENABLED='true'; node experimental-service/local-demo.mjs`

Ouvrir **http://127.0.0.1:8799/** sur le meme ordinateur. Remplir le questionnaire et verifier la reponse « Service local : Requete validee sans appel API ».

Le service refuse toute validation si `AVATAR_TEST_ENABLED` n'est pas `true`. Pour l'arreter, utiliser Ctrl+C dans le terminal. Les quotas de simulation sont limites par defaut a **5 demandes par jour et 20 au total** et sont enregistres dans `~/.a658-yg-avatar-local-quotas.json`. Ce fichier reste prive sur l'ordinateur ; ne pas le publier dans Git.

## Limites

- La page publique GitHub Pages reste inchangée.
- L'essai est limite a l'ordinateur local ; pas d'acces depuis un autre poste.
- Aucune formation reelle n'est recherchee, aucun parcours reel n'est genere.
- Le mode local n'utilise pas le jeton Bearer du service experimental expose sur `/test/request` : il utilise un jeton genere cote serveur uniquement.
- Le controle d'origine bloque les requetes provenant d'autres sites. Ce mode n'est **pas** destine a etre publie sur Internet.
- Les quotas sont globaux au processus, pas par utilisateur. Ils ne constituent pas un plafond de depense API.
- Si le port 8799 est deja utilise, arreter le service qui l'utilise avant le demarrage.

## Verification automatique

`node --test experimental-service/*.test.mjs`

Aucune connexion externe n'est necessaire pour ces tests.
