# Pilote distant — simulation privée sur Infomaniak

Préparation du 22 octobre 2026, à partir de `947b17f` sur la branche existante
`feat/avatar-interactive-local`. Cette procédure complète le pilote local ; elle
n'active pas le moteur réel et ne remplace pas ses scripts.

## Point de reprise vérifié — 22 octobre 2026

**Le pilote privé distant est installé en simulation.** Ce constat remplace l'état
initial de préparation décrit plus bas ; il n'active aucun parcours réel.

- Révision installée et vérifiée par le retour Git fourni : `b3d83ba318ace20ae2b4ab8dd006c13e1a728431`,
  sur la branche d'essai existante, sans fusion dans `main`.
- Le Manager et les logs confirment Node.js 24, le port 3000 et le démarrage du
  simulateur avec un maximum de cinq confirmations.
- Le diagnostic du proxy a été effectué sans identifiant : la requête HTTP portant
  un faux en-tête HTTPS reçoit 301 ; la requête HTTPS portant un faux en-tête HTTP
  reçoit le 503 attendu du diagnostic et arrive avec le protocole corrigé en HTTPS.
  Le pair observé a été configuré dans les fichiers privés ; son adresse et les
  journaux bruts ne sont pas reproduits ici. Ce contrôle ne garantit pas que toutes
  les adresses possibles du proxy ont été recensées.
- Une fenêtre d'authentification est apparue, puis l'utilisateur a accédé au
  questionnaire avec le compte du pilote.
- Deux simulations explicitement confirmées ont affiché successivement **1/5**
  puis **2/5**. Les formations synthétiques et durées affichées sont des exemples
  fixes sans rapport avec le profil : il ne s'agit pas d'une validation du moteur.
- Le rechargement restaure les réponses, retire le résultat et exige une nouvelle
  confirmation. Le passage de 1/5 à 2/5 après confirmation établit que le
  rechargement intermédiaire n'a pas consommé de simulation.
- La lecture finale de l'état privé fournie par l'utilisateur confirme
  `daily: 2`, `total: 2`, `stopped: false`. Trois simulations restent disponibles
  dans ce quota, tant que cet état n'est pas modifié.
- L'utilisateur pense avoir redémarré l'application dans le Manager. La capture
  montre le brouillon restauré, mais ne prouve pas à elle seule ce redémarrage.
  **La persistance après redémarrage réel n'est donc pas encore formellement
  validée sur cet hébergement.** Elle est couverte par les tests automatisés.

Validation technique de la révision installée : **113/113 tests locaux réussis**.
Les workflows [tests de sécurité](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39795221846)
et [simulation Chromium](https://github.com/technologies-formation/a658-yg-avatar/actions/runs/39795222051)
sont terminés avec succès. Ces tests ne remplacent pas les contrôles sur le service distant.

### Points ouverts et prochaine intervention

1. **Récapitulatif parfois vide sur ordinateur :** constaté après la saisie ; un
   rechargement à la même taille de fenêtre restaure le panneau et les réponses.
   Cause non établie. Examiner notamment la gestion de l'élément `details` lors
   d'un changement de largeur ; cette piste est une hypothèse, pas un diagnostic.
   Reproduire et corriger dans la branche d'essai avant toute mise à jour du site.
2. Confirmer explicitement le redémarrage depuis le Manager puis lire le compteur,
   sans lancer de simulation supplémentaire.
3. Les essais sur appareil mobile physique et réseau institutionnel restent à faire.
4. Aucun passage au moteur réel distant ni appel payant supplémentaire n'est
   autorisé par ce jalon. Le catalogue n'a pas été modifié pendant cette préparation.

Une pause est possible : l'hébergement continue de fonctionner indépendamment du
PC, en simulation privée. Conserver les fichiers d'accès et de quota privés ;
ne pas relancer la préparation des comptes. À la reprise, relire ce point et l'état
réel avant toute action. Ne jamais copier les identifiants dans le chat ou Git.

Coût OpenAI API du déploiement et des deux simulations distantes : **0 token / 0 $**.

## État initial avant installation — constat fourni par l'utilisateur

Un nouvel hébergement distinct a été commandé pour un an à 113,20 CHF TTC,
puis renommé « A658-YG — Avatar privé ». Le Manager montre le site
`avatar.a658yg-catalogue.ch`, Node.js 24 actif et le HTTPS sécurisé.
Le SSH ne montre que ce site dans le nouvel hébergement. Il contenait alors
le modèle Infomaniak `node-basic-landing`. Configuration observée :
port 3000, commande `npm start`, build `npm i`.

Ces captures ne prouvent ni l'installation de l'avatar ni son authentification.
Le qualificatif « privé » dans le nom de l'hébergement ne protège pas le site.
Le catalogue conserve son hébergement et son code.

## Adaptation préparée

- `hosted-simulation.mjs` réutilise l'authentification scrypt, les ressources
  privées, la confirmation et le simulateur existants, derrière le proxy HTTPS.
- Origine unique : `https://avatar.a658yg-catalogue.ch`. Le domaine temporaire
  n'est pas autorisé pour cette session. Pas de CORS supplémentaire.
- Une IP de connexion exacte doit être autorisée et `X-Forwarded-Proto` doit être
  exactement `https`. Les en-têtes du client seuls ne suffisent pas. Aucune liste
  de confiance n'est déduite automatiquement des requêtes entrantes.
- Cinq confirmations maximum au total et par jour, persistantes après redémarrage.
  Un verrou de dossier empêche de lancer deux instances sur le même état.
- Configuration, comptes hachés, accès en clair et quotas dans un dossier privé
  hors du site et hors Git (dossier 0700, fichiers 0600). Aucun fichier statique
  n'est servi depuis le disque en dehors des ressources expressément autorisées.
- Une fermeture technique conserve les quotas sans révoquer la session. `stop()`
  constitue un arrêt administratif persistant. Un crash peut laisser le verrou :
  ne le retirer qu'après avoir arrêté l'application dans le Manager et vérifié
  l'absence d'autre instance ; conserver absolument `quotas.json`.
- Les imports du lanceur de simulation ne comprennent ni l'adaptateur ni le
  lanceur réel. Le résultat est synthétique, fixe, sans coût inventé ni lien de
  cours synthétique. Le questionnaire et le rendu existants sont conservés.

## Séquence d'installation à accompagner

Procédure de référence utilisée pour le déploiement ci-dessus ; ne pas la rejouer
automatiquement sur l'installation existante.
Ne pas lancer de build lourd en SSH : utiliser le Builder du Manager si nécessaire.
Le nouveau code n'a aucune dépendance npm supplémentaire.

1. Préparer une copie de la révision Git testée dans un dossier de release distinct
   du modèle installé. Vérifier la révision et les fichiers avant de changer le
   point d'entrée. Conserver le modèle et ses commandes pour retour arrière.
2. Lancer temporairement `probe-hosted-proxy.mjs` depuis le Manager, sur le port
   3000. Il renvoie toujours 503 et ne demande aucun identifiant. Le journal
   `/proxy-check` ne contient que l'IP du pair, Host et X-Forwarded-Proto.
   Ne jamais publier ce journal dans Git.
3. Depuis l'adresse HTTPS principale, demander `/proxy-check`, puis comparer avec
   un accès HTTP et un en-tête `X-Forwarded-Proto` volontairement falsifié.
   Le proxy doit garantir que l'accès HTTP ne peut être attesté HTTPS. Identifier
   le pair réel et ses éventuelles autres adresses via la configuration/assistance
   Infomaniak ; ne pas copier sans preuve les IP d'une autre offre Cloud.
   Si le schéma ou le pair ne peut pas être attesté, arrêter ici.
4. Depuis la release examinée, exécuter une seule fois :

   ```sh
   node experimental-service/setup-hosted-simulation.mjs /srv/customer/avatar-private IP_PROXY_VERIFIEE
   ```

   Remplacer le dernier argument par l'IP exacte vérifiée ; d'autres IP exactes
   peuvent suivre si elles sont confirmées. Cette préparation fait seulement un
   GET du référentiel public du catalogue, sans appel payant. Elle refuse un
   dossier déjà existant pour ne pas remplacer accès ou quotas.
5. Arrêter le diagnostic. Configurer le lancement de la release :

   ```sh
   AVATAR_HOSTED_SIMULATION_ENABLED=true node experimental-service/hosted-simulation.mjs /srv/customer/avatar-private/config.json
   ```

   Conserver le port 3000. Le chemin du script doit désigner la release\n   réellement exécutée. Employer un chemin absolu si le Manager conserve le\n   répertoire du site comme répertoire courant. Adapter la commande de build
   pour ne pas lancer celle du modèle Nest sur le nouveau code sans dépendances.
6. Vérifier le refus HTTP, l'origine incorrecte, le challenge d'authentification,
   les ressources protégées et l'absence de fichiers privés accessibles. Consulter
   `ACCES_PRIVE.txt` uniquement sur le serveur pour s'identifier, sans le copier
   dans le chat, les logs ou Git. Une simple ouverture/recharge ne consomme rien.
7. Avec un profil fictif, confirmer une simulation, contrôler le quota puis
   recharger et redémarrer : le compteur doit rester conservé. Vérifier sur PC,
   mobile et ultérieurement réseau institutionnel. Ne pas présenter ces contrôles
   comme un benchmark du moteur.

En cas de défaut, arrêter la nouvelle application et rétablir le modèle et ses
commandes. Ne pas supprimer les comptes, quotas ou verrous à l'aveugle. Aucun
changement du catalogue ou appel réel n'est nécessaire pour ces opérations.

## Validation

Les tests `hosted-simulation.test.mjs` couvrent les refus du proxy, l'accès aux
ressources, le parcours confirmé, le plafond de cinq, le redémarrage et la
révocation, les permissions et le refus de réinitialisation des accès.
Le diagnostic ne journalise ni cookies, ni autorisation, ni profil.
Les tests HTTP utilisent un faux proxy local et un contrat synthétique ; ils ne
prouvent pas le comportement du proxy Infomaniak, à vérifier avant activation.

Coût OpenAI API de la préparation et des tests simulés : 0 token / 0 $.
