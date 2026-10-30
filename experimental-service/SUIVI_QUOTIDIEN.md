# Récapitulatif quotidien OpenAI — préparation désactivée

> État courant au 30 octobre 2026 : voir [Assistant formation — référence avant pilote](../GUIDE_REPRISE.md). Assistant installé `13fd45b`, affinement RH/absences + OPE sans entité DIP-SEM vérifié par l’opérateur, quatre accès préparés et zéro testeur activé. Les étapes datées ci-dessous restent historiques ; le pilote du groupe n’est pas ouvert.

Un seul récapitulatif est prévu à 08 h, heure de Paris, pour les deux applications. Il contient les quinze dernières journées clôturées (la plus récente d’abord), le cumul du mois courant, les mois précédents collectés, les sollicitations, les coûts calculés et le solde théorique. L’avertissement à 2 USD ou moins est intégré à ce message, avec un objet distinct. Les liens de vérification et d’achat ouvrent la facturation OpenAI ; aucune ouverture du message ne provoque d’achat.

## Sources et attribution

Le registre Catalogue comptabilise les recherches et les générations de parcours acceptées pour traitement. Un appel de parcours provenant du serveur Assistant est marqué par un jeton de reporting partagé : son coût et sa sollicitation appartiennent alors à l’Assistant, une seule fois. Le registre local Assistant collecte uniquement le dialogue réel. Les affichages, rechargements, sauvegardes, acceptations de critères, simulations, PDF et envois de synthèse ne sont pas des sollicitations IA. Les appels techniques d’un parcours à deux passes ne sont pas recomptés comme deux actions utilisateur. Les tentatives en erreur restent visibles et leur coût non vérifié n’est jamais inventé.

Les coûts sont ceux calculés par les applications. Pour le dialogue, il s’agit de l’estimation haute déjà renvoyée par le fournisseur ; la réservation forfaitaire de quota n’est pas prise pour une dépense. Aucun taux de facturation, modèle ou quota n’est modifié par ce suivi. Les coûts inconnus et les réservations interrompues rendent le solde non calculable tant qu’ils se trouvent après le repère de solde. Cela doit être affiché dans le courriel, pas remplacé par zéro.

Le solde théorique est le dernier solde vérifié manuellement, diminué des coûts collectés depuis l’horodatage de ce repère, y compris la journée en cours. Il n’est calculable que si le repère est postérieur au début de la collecte dans les deux services et qu’aucun coût du périmètre n’est inconnu. Les délais de facturation, autres usages du compte et crédits expirés peuvent créer un écart. Après une recharge, relever à nouveau le solde réel et son heure dans la configuration privée ; ne pas simplement additionner un montant supposé à une ancienne estimation.

Aucun historique privé ancien n’est importé ou reconstruit automatiquement. Les jours antérieurs à la collecte sont indiqués comme non collectés. Le premier jour et les premiers mois peuvent être partiels. Les mois précédents collectés sont conservés ; le suivi n’invente ni coûts ni sollicitations pour les anciens essais.

## Préparation dans les dossiers privés

La collecte et l’envoi ont des activations distinctes et sont désactivés par défaut. Le jeton de reporting n’est jamais envoyé au navigateur, dans le courriel ou les journaux. Il ne s’agit pas d’une clé OpenAI.

Côté Assistant, le lanceur existant peut charger un fichier d’environnement supplémentaire `consumption.env`, créé une seule fois dans le dossier privé avec la commande `daily-report.mjs --prepare-consumption <dossier-privé>`. Ce fichier contient :

- `A658_CONSUMPTION_ENABLED=true`
- `A658_CONSUMPTION_DIRECTORY=<dossier privé de registre Assistant>`
- `A658_REPORT_TOKEN=<jeton aléatoire dédié>`

Côté Catalogue, configurer les mêmes noms de variables dans un fichier privé hors du site, avec **le même jeton** et un dossier de registre propre au Catalogue. Les registres des deux serveurs restent distincts. Aucun secret ne doit être transmis dans une conversation ou ajouté à Git. Le jeton autorise uniquement le relevé agrégé et l’attribution des appels internes au suivi, pas les appels OpenAI.

Le Catalogue expose alors `GET /api/private/consumption?since=<repère ISO UTC>` uniquement avec `Authorization: Bearer <jeton>`. Sans jeton correct : réponse 404 ; aucune donnée de coût n’est publique. Le collecteur Assistant utilise exclusivement l’origine HTTPS fixée du backend, sans redirection, avec une taille de réponse et un délai bornés. Aucun appel modèle n’est déclenché pour collecter le relevé.

Préparer ensuite le suivi avec `daily-report.mjs --prepare <dossier privé Assistant> <destinataire>`. Cela crée exclusivement `daily-report/config.json`, protégé en 0600, avec `enabled:false`, `hour:8`, `timeZone:Europe/Paris`, `thresholdMicroUsd:2000000` et `baseline:null`. Aucun fichier existant n’est remplacé.

Après activation de la collecte et vérification des deux relevés, renseigner un repère fraîchement vérifié :

```json
"baseline": {
  "at": "HORODATAGE_ISO_UTC_DU_RELEVE",
  "balanceMicroUsd": 0
}
```

L’exemple ci-dessus est un format, pas un solde à utiliser. Un dollar correspond à 1 000 000 microdollars. Le destinataire reste un champ `recipient` modifiable dans ce même fichier privé. La procédure de changement est répétée dans chaque courriel : éditer uniquement ce champ, puis redémarrer Assistant dans le Manager Infomaniak. Aucune adresse réelle n’est imposée dans le dépôt.

## Activation et arrêt

L’activation concrète nécessite à la fois `enabled:true` dans `daily-report/config.json` et `A658_DAILY_REPORT_ENABLED=true` au lancement. Le service d’envoi Gmail/Infomaniak existant doit être configuré (`AVATAR_MAIL_ENABLED=true`). La collecte doit être active dans les deux services. Le fichier SMTP et ses mots de passe sont conservés séparément, hors du site et de Git. Les autorisations de dialogue, les trois scénarios et tous les quotas existants restent identiques.

Le minuteur tourne dans le service Node géré par Infomaniak, pas dans une console SSH laissée ouverte. À l’écoute du serveur, puis chaque minute, il vérifie l’heure locale. Avant 08 h : pas d’envoi. Après 08 h : au plus un essai pour la date locale, même après redémarrage. Si le service était arrêté à 08 h, il tentera le récapitulatif au premier démarrage après 08 h ce jour-là ; les dates manquées ne provoquent pas de rafale de rattrapage.

Une réservation privée `AAAA-MM-JJ.attempt.json` est écrite avant la collecte et l’envoi. Une coupure ou une issue SMTP incertaine n’entraîne pas une seconde tentative pour la même date. Une panne de collecte peut produire le seul courriel quotidien d’indisponibilité, sans annoncer un faux solde. Il n’y a pas d’envoi déclenché à chaque action utilisateur. Ne jamais retirer les réservations dans l’espoir de renvoyer automatiquement.

Pour arrêter uniquement le récapitulatif, retirer `A658_DAILY_REPORT_ENABLED=true` et redémarrer le service. Cela n’efface ni historiques ni compteurs ; la collecte peut continuer. Désactiver la collecte provoque une lacune : refaire un repère de solde et contrôler la couverture avant de se fier à une nouvelle estimation.

## Limites de cette première préparation

Les coûts applicatifs ne constituent pas une facture et les dépenses effectuées en dehors de ces deux applications ne sont pas collectées. Une politique de rétention/rotation du registre reste à définir avant une diffusion plus large. Le collecteur refuse les archives excessives ou illisibles. Les tests utilisent des transports et événements fictifs ; aucun nouvel appel OpenAI ni courriel réel n’est nécessaire pour vérifier cette préparation.


## Distinction avec le suivi des testeurs — 30 octobre 2026

Le module `participant-usage.mjs` ajoute un registre privé de tentatives par identifiant testeur, des cumuls et une dernière activité disponible. `provision-testers.mjs --report CHEMIN_CONFIG` les restitue sans mot de passe. Avant activation, un tableau vide signifie aucun testeur actif, pas absence de préparation. Les limites quotidiennes par défaut sont dix messages IA et trois recherches/parcours combinés ; les échecs restent comptés et les réservations survivent au redémarrage.

Ce registre ne fournit pas un montant facturé par personne et ne remplace pas le suivi agrégé ci-dessus. Les alertes et courriels ne constituent pas une coupure automatique. L’activation actuelle du récapitulatif quotidien et le solde réel ne sont pas recontrôlés par les captures du scénario d’affinement. Définir le budget du groupe et le seuil d’arrêt avant ouverture ; ne pas promettre un plafond monétaire à partir des seuls quotas d’usage. Voir le [guide actuel](../GUIDE_REPRISE.md).


## Solde dans l’objet et montant à vérifier — 30 octobre 2026

Objet et en-tête : « A658-YG · Suivi OpenAI · Solde théorique (à vérifier) : MONTANT $ ». Le montant est recalculé depuis le repère privé en soustrayant les dépenses connues depuis ce repère, y compris la journée courante. Les coûts inconnus ne rendent plus cet ordre de grandeur invisible : l’objet ajoute « coûts incomplets » et le corps signale le nombre de tentatives concernées et le risque de surestimer le crédit restant. Un repère antérieur à la collecte signale aussi la couverture incomplète. Ces montants ne constituent ni un solde vérifié ni un plafond de dépense.

Le lien « Vérifier mon solde réel OpenAI » est placé juste après le solde, en HTML et en texte, vers https://platform.openai.com/settings/organization/billing/overview. L’alerte de vigilance à 2 USD reste appliquée au montant calculé, y compris s’il est négatif. Si la collecte échoue ou si le repère est postérieur aux relevés, le courriel indique « indisponible » sans recycler un ancien montant comme solde courant.

Après un relevé réel ou une recharge, mettre à jour uniquement `baseline` dans la configuration privée, avec sauvegarde protégée et horodatage du relevé, puis redémarrer l’Assistant. Confirmer le montant au moment de l’opération ; ne pas dater rétroactivement un solde pour compenser des coûts historiques inconnus. Les anciens journaux restent conservés. L’objet n’est pas une constante contenant un crédit réel : aucune valeur privée n’est ajoutée au code ou aux documents publics. Aucun envoi de test réel ni appel IA n’est requis.
