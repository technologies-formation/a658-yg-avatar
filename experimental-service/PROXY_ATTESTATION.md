# Attestation HTTPS d'un proxy variable

> État courant au 30 octobre 2026 : voir [Assistant formation — référence avant pilote](../GUIDE_REPRISE.md). Assistant installé `13fd45b`, affinement RH/absences + OPE sans entité DIP-SEM vérifié par l’opérateur, quatre accès préparés et zéro testeur activé. Les étapes datées ci-dessous restent historiques ; le pilote du groupe n’est pas ouvert.

Le module `proxy-attestation.mjs` permet un mode explicite `self-https` en
complément du mode historique à adresses exactes. Aucun changement implicite
de configuration n'active ce mode.

L'application génère un chemin aléatoire de 256 bits et un accusé indépendant,
puis appelle sa propre origine publique par HTTPS avec vérification du certificat
et du nom de domaine. Seul un aller-retour complet, revenu sur le chemin attendu,
autorise temporairement le pair réellement observé. Une requête de visiteur ne
peut pas ajouter son adresse à la liste de confiance. Le Host et le protocole
transmis sont contrôlés avant le challenge Basic existant.

Les preuves sont à usage unique, retirées après succès ou échec, sans identifiant,
cookie, profil ou appel métier. La taille des réponses, les délais, les requêtes
simultanées et le nombre de pairs sont bornés. La confiance est conservée en
mémoire dix minutes ; une adresse nouvelle déclenche une nouvelle vérification.
Un échec TLS, une redirection, une réponse inattendue ou un délai dépassé conserve
le refus d'accès. Le mécanisme vérifie un trajet HTTPS vers ce processus ; il ne
constitue pas une liste officielle des réseaux d'un hébergeur.

`probe-proxy-attestation.mjs` vérifie le mécanisme sans charger de compte privé
ou de simulateur. La migration explicite de configuration conserve une sauvegarde
et ne remplace ni comptes ni compteurs. Le mode à adresses exactes reste disponible
pour un retour arrière.

Les tests couvrent notamment rotation des pairs, réponse falsifiée, code inconnu
ou réutilisé, mauvais Host/protocole, expiration, concurrence, certificat non
approuvé, diagnostic sans authentification et intégration au contrôle privé.
Ils utilisent des transports locaux ou injectés. Le fonctionnement sur un
hébergement donné doit être vérifié avec le diagnostic avant activation.

Primitives utilisées : [HTTPS Node.js](https://nodejs.org/api/https.html) et
[crypto.randomBytes](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback).
Le mécanisme d'attestation est une implémentation du projet, pas une procédure
certifiée par un hébergeur.

Les refus des API sont renvoyés en JSON avec le code
`secure_transport_required`, avant le challenge et les gestionnaires métier.
Les pages conservent un refus texte. Le journal indique seulement une catégorie
bornée, au maximum une fois par cinq secondes : `host`, `protocol`, `peer`,
`stopped`, `unverified_peer` ou `exact_address_check`. Il n'expose aucune adresse,
URL, valeur d'en-tête ou donnée utilisateur. Ce diagnostic ne change ni la
confiance ni le rythme des preuves. Un pair non attesté reste refusé, y compris
pendant le délai entre lots de preuves ; la catégorie ne permet pas à elle seule
de conclure à une rotation du proxy. Aucune relance automatique d'un appel métier
n'est autorisée après un tel refus.


## Renouvellement et observation hébergée — 30 octobre 2026

Les lots actuels prennent en compte les pairs en attente. Les preuves sont renouvelées périodiquement pendant l’écoute ; une preuve manquante peut attendre un renouvellement gratuit partagé et borné. Le renouvellement ne rejoue aucun POST métier ni appel OpenAI. Host, protocole, pair et preuve de retour HTTPS restent obligatoires ; aucun réseau supposé de l’hébergeur n’est autorisé par déduction.

Les journaux transmis par l’opérateur pour la version installée `13fd45b` montrent les derniers contrôles HTTPS réussis. Un refus « host » au début du flux reste visible ; ces succès ultérieurs n’établissent ni sa cause ni l’absence définitive de refus intermittents. En cas de blocage, conserver les critères et diagnostiquer le transport, sans relance payante automatique ni assouplissement de la preuve.
