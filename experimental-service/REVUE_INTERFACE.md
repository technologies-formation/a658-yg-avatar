# Revue de présentation — octobre 2026

Le sous-titre de marque est « Votre assistant formation ». Le volet « Ma demande » ne comporte plus de sous-titre redondant. Sur ordinateur il est élargi, avec les champs courts regroupés et les textes longs sur toute la largeur. Son contenu défile indépendamment du bouton d’enregistrement ; sur mobile les champs restent sur une colonne. La mémorisation sur appareil conserve son choix explicite, son échéance et son effacement, sans titre supplémentaire.

Le bandeau inférieur et le volet de diagnostics ne sont plus visibles. Les données de diagnostic restent disponibles au serveur et les éléments internes ne sont plus proposés comme navigation utilisateur. Les erreurs utiles restent affichées ; les annonces ordinaires restent accessibles aux lecteurs d’écran. Une panne de sauvegarde privée déclenche une alerte visible distincte, sans relance de génération. Les choix de scénarios et confirmations payantes restent en place pour le pilote privé. Les plafonds et compteurs ne sont pas modifiés. Cette retouche n’ouvre pas un nouveau pilote payant.

## Date du catalogue

Le Catalogue affiche la date des données réellement chargées : API en mode hébergé, snapshot embarqué en cas de repli ou sur Pages. Une date absente ou invalide est annoncée comme inconnue ; jamais remplacée par l’heure du navigateur.

L’Assistant lit, par une route privée authentifiée, la date du catalogue actuellement disponible via la seule santé publique du backend. Lecture bornée, sans clé transmise ni appel au modèle. Dans les résultats et les PDF, la provenance est celle du résultat sauvegardé. Le backend capture la version et les données du catalogue avant la génération asynchrone afin de ne pas attribuer la version d’une synchronisation ultérieure au résultat.

Les anciennes recherches n’ayant pas conservé cette provenance restent lisibles et affichent « Date du catalogue non renseignée pour cette recherche ». Les exemples simulés ne prétendent pas avoir consulté le catalogue. Aucun résultat n’est réécrit ou régénéré pour ajouter artificiellement une date. Les copies locales signées antérieures restent compatibles.

## Déploiement

Le backend requiert le nouveau module `server/catalogueProvenance.mjs` avec la nouvelle version de `server/searchApi.mjs`. L’Assistant requiert les modules de version et de lecture du statut ainsi que ses retouches d’affichage ; la commande de lancement et ses autorisations restent identiques. La présentation Catalogue sur Pages doit être intégrée séparément à sa branche principale, après revue. Ne pas oublier de rebâtir le frontend hébergé si cette variante est également utilisée.
