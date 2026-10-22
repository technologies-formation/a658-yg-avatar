# Pilote distant — simulation privée sur Infomaniak

Préparation du 22 octobre 2026, à partir de `947b17f` sur la branche existante
`feat/avatar-interactive-local`. Cette procédure complète le pilote local ; elle
n'active pas le moteur réel et ne remplace pas ses scripts.

## Constat fourni par l'utilisateur

Un nouvel hébergement distinct a été commandé pour un an à 113,20 CHF TTC,
puis renommé « A658-YG — Avatar privé ». Le Manager montre le site
`avatar.a658yg-catalogue.ch`, Node.js 24 actif et le HTTPS sécurisé.
Le SSH ne montre que ce site dans le nouvel hébergement. Il contient pour
l'instant le modèle Infomaniak `node-basic-landing`. Configuration observée :
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

La préparation est autorisée ; toute installation reste à effectuer et à vérifier.
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

   Conserver le port 3000. Le répertoire courant doit être celui de la release
   réellement exécutée. Employer son chemin absolu si le Manager conserve le
   répertoire du site comme répertoire courant. Adapter la commande de build
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
