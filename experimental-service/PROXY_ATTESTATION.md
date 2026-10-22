# Attestation HTTPS d'un proxy variable

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
