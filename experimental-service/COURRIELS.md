# Synthèse par courriel — option privée désactivée par défaut

La fenêtre « Recevoir par courriel » est affichée uniquement lorsque l’envoi est configuré. Elle concerne la recherche sélectionnée dans Cours proposés : les critères et le résultat enregistrés côté serveur sont utilisés même si le brouillon a changé. La synthèse PDF est construite sur le serveur avec le même modèle et les mêmes polices que le téléchargement ; le logo décoratif du navigateur n’est pas ajouté au courriel. Aucun nouveau dialogue ou parcours IA n’est lancé.

L’adresse saisie n’est pas un compte utilisateur, n’est pas conservée dans le navigateur ou le registre local et n’a pas de rôle d’authentification. Le destinataire et le contenu sont nécessairement transmis au service de messagerie pour la livraison. Un seul destinataire est autorisé, sans copie ni pièces jointes fournies par le navigateur. Les limites d’accès du pilote restent actives. L’envoi n’est pas proposé dans l’ancien mode de simulation à historique stocké uniquement dans l’onglet.

## Configuration du service d’envoi

L’intégration proposée utilise une boîte expéditrice Infomaniak existante : `mail.infomaniak.com`, port 465 avec TLS et validation du certificat. Il faut disposer de cette boîte et de son mot de passe de messagerie (pas du mot de passe du Manager). Aucun achat ou création de compte n’est effectué par le code.

La dépendance Nodemailer est fixée à 10.2.1 (publication officielle du 22 octobre 2026). Installer le manifeste `mail-runtime-package.json` comme `package.json` dans `<privateDirectory>/mail-runtime`, puis lancer `npm install --ignore-scripts --no-audit --no-fund` dans ce dossier privé ; conserver le fichier de verrouillage obtenu. Ce dossier ne doit pas être publié ni ajouté à Git.

Les variables suivantes sont lues uniquement à l’activation :

- `AVATAR_MAIL_ENABLED=true`
- `AVATAR_MAIL_FROM` : adresse complète de la boîte expéditrice ; utilisée aussi pour l’authentification SMTP.
- `AVATAR_MAIL_PASSWORD` : mot de passe de cette boîte, conservé dans le fichier d’environnement privé 0600 existant ou un fichier d’environnement privé distinct.

Aucun secret ne doit être copié dans une conversation, un dépôt, une capture, une commande avec mot de passe en clair ou les journaux. Le lanceur conserve toutes les autorisations de dialogue et parcours existantes. Aucun test SMTP, aucune connexion ni aucun message ne sont lancés à l’ouverture ou au démarrage ; la première transmission nécessite « Envoyer ma synthèse ».

Sans activation explicite, aucun secret de messagerie n’est lu, aucune dépendance de messagerie chargée et aucun bouton affiché. Une configuration activée invalide refuse le démarrage plutôt que d’autoriser une connexion non chiffrée. La désactivation et le redémarrage masquent le bouton sans modifier les recherches ni les quotas IA.

## Envoi et absence de relance

La route POST authentifiée `/private/research-email` exige l’origine du site, une confirmation explicite, un numéro interne de recherche appartenant à l’identité connectée, une seule adresse et un identifiant d’envoi. Aucun cliché ni contenu PDF fourni par le client n’est accepté. Le courriel et le PDF reprennent à l’identique la mention de vigilance IA/RH.

Une prise en charge SMTP confirmée est annoncée comme telle : cela ne garantit pas l’arrivée dans la boîte du destinataire. Une coupure ou une erreur peut survenir après transmission ; l’interface demande de vérifier sa messagerie et ne réessaie jamais automatiquement. Fermer ou actualiser une page ne relance pas l’envoi.

Le registre `mail-outbox` est privé (dossier 0700, fichiers 0600), indépendant des compteurs IA. Il contient uniquement la date UTC, des empreintes de l’identité et du couple recherche/destinataire, et l’état réservé/accepté/incertain. Limites conservatrices du pilote : cinq tentatives par identité et vingt au total par jour UTC ; les tentatives incertaines restent comptées. Une même recherche à une même adresse ne peut être retentée le même jour, même après redémarrage. Le verrou temporaire ne doit pas être retiré lorsqu’un service est actif. Aucun effacement automatique des registres n’est prévu dans ce pilote ; une politique de rétention reste à définir avant une ouverture plus large.

Tests : authentification/HTTPS/origine, isolation entre identités, résultat historique, validation d’adresse, refus des doublons et limites persistantes, PDF et mention IA/RH, annulation sans envoi et navigateur ordinateur/mobile avec transport de messagerie fictif. Aucun courriel réel envoyé pour ces tests.

## Points distincts à cadrer

Les alertes administrateur pour la consommation de CATALOGUE et ASSISTANT constituent une fonction distincte. Besoin exprimé : avertir avant épuisement pour pouvoir intervenir. Seuils proposés à discuter : 80 %, 95 %, puis blocage ; distinguer appels/tokens/budget applicatif du crédit global OpenAI, éviter les doublons et préciser les destinataires. Aucune alerte planifiée ni surveillance du solde fournisseur n’est activée par cette livraison.

Sources techniques : https://www.infomaniak.com/en/support/faq/468/understanding-mail-server-ports-and-protocols ; https://nodemailer.com/smtp ; https://github.com/nodemailer/nodemailer/releases/tag/v10.2.1
