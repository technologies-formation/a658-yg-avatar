# Reprise du pilote privé sur Infomaniak

État vérifié avec l'opérateur le 9 novembre 2026. Cette procédure concerne le
pilote privé `https://avatar.a658yg-catalogue.ch/private/`. Elle complète les
documents historiques sans autoriser une remise à zéro des comptes, recherches,
budgets ou compteurs.

## Incident du 9 novembre 2026

Après une maintenance Infomaniak, le Manager affichait l'application arrêtée alors
que le port 3000 restait occupé. Deux anciens fichiers de verrou étaient également
présents. Après récupération du port, le proxy transmettait au processus Node.js
son nom technique de prévisualisation plutôt que le nom public ; le contrôle de
sécurité refusait donc l'accès. Enfin, une navigation ouverte depuis un autre site
était assimilée à tort à un appel API externe.

Faits vérifiés : `EADDRINUSE` sur le port 3000, port alternatif disponible, absence
de processus Node.js visible dans la session SSH, `Host` technique Infomaniak avec
`X-Forwarded-Host` absent, puis succès de l'attestation HTTPS. L'hypothèse d'un
processus résiduel géré par l'hébergement explique le port occupé, mais n'est pas
une cause confirmée par Infomaniak. L'opérateur n'a provoqué aucun de ces défauts.

La récupération du port a été obtenue par un changement contrôlé de version Node.js
dans le Manager, puis retour immédiat à Node.js 24. Le code reconnaît désormais le
nom technique exact uniquement après attestation HTTPS du pair et le normalise vers
l'origine publique. Seule une navigation principale `GET /private/`, sans en-tête
`Origin` et déclarée par le navigateur comme document, est admise depuis un autre
site. Les API, écritures, origines étrangères et requêtes ambiguës restent refusées.

Version installée et validée : `d25b8205a6c3ec3c54e283fec78368c216d431d1`.
Les tests ciblés passent à 9/9 et la suite Infomaniak à 19/19. Après redémarrage,
les journaux confirment le mode privé et « Contrôle HTTPS du proxy réussi ». Le lien
cliqué depuis un site externe ouvre l'authentification puis l'assistant ; historique,
compteurs et suivi sont conservés. Coût OpenAI API de l'intervention : 0 token / 0 $.

## Configuration de référence

- Node.js 24 ; port d'écoute 3000 ; build désactivé.
- Emplacement du site : `/avatar-preparation/avatar-b3d83ba`.
- Commande d'exécution :

  ```sh
  npm start -- /srv/customer/avatar-private.dialogue-trial/config.json /srv/customer/avatar-private.dialogue-trial/result-review-20261027
  ```

- Code installé : `/srv/customer/avatar-preparation/avatar-b3d83ba`.
- Les fichiers privés restent hors Git et ne doivent jamais être recopiés dans un
  journal, un document public ou une commande transmise dans le chat.

## Procédure de reprise, une étape à la fois

1. Dans le Manager, relever l'état et copier les journaux. Ne pas cliquer plusieurs
   fois sur Run ou Redémarrer et ne pas lancer le serveur depuis SSH.
2. En SSH, relever `git rev-parse HEAD` et `git status --short`. Une sortie vide de
   la seconde commande confirme seulement un dépôt propre.
3. Vérifier l'existence des deux verrous connus et rechercher un processus Node.js.
   Ne supprimer aucun verrou tant que l'application n'est pas arrêtée dans le
   Manager ou qu'une instance peut encore utiliser les états privés.
4. Tester le port avec un court serveur `node:net`. Si le Manager indique Arrêté,
   qu'aucun Node.js n'est visible et que 3000 renvoie encore `EADDRINUSE`, utiliser
   le changement de version du Manager pour forcer le recyclage : Node.js 24 vers
   23, validation complète, puis retour immédiat vers 24 et nouvelle validation.
   Ne pas exploiter durablement Node.js 23, signalé obsolète et vulnérable.
5. Vérifier à nouveau que 3000 est disponible. Contrôler ensuite la commande, le
   port 3000 et Node.js 24 avant de redémarrer depuis le Manager.
6. Les journaux sains doivent annoncer le mode privé, la conservation des compteurs
   et la réussite du contrôle HTTPS. Tout autre refus doit être conservé mot pour
   mot ; ne pas désactiver l'attestation et ne pas changer de port au hasard.
7. Vérifier l'URL directe, puis cliquer le même lien depuis un autre site. Une
   ouverture ne consomme aucun crédit ; ne pas lancer de génération pour ce test.

## Prévention et préparation des présentations

- Conserver un tag Git du dernier état réellement installé et validé ; ne déployer
  qu'un commit exact, jamais une branche non relevée.
- Effectuer le contrôle de démarrage, d'authentification et de lien externe 24 heures
  puis une heure avant une présentation. Ne lancer aucune requête payante.
- Conserver une démonstration de secours sans appel externe et un support illustré
  récent. L'indisponibilité d'Infomaniak ne doit plus annuler toute présentation.
- Mettre en place séparément une surveillance HTTP non payante et une alerte ; un
  code 200 seul ne suffit pas si la page reçue est celle de maintenance.
- Après une maintenance de l'hébergeur, contrôler systématiquement port, version
  Node.js, commande, attestation HTTPS, authentification et navigation externe.
- Toute automatisation future des verrous doit vérifier l'absence de processus et
  l'âge du verrou ; aucun effacement automatique aveugle n'est autorisé.
