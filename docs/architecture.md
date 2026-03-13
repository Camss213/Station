# Architecture proposee

## Dossiers

```text
station/
  apps/
    api/
      app/
        db.py
        db/
          schema.sql
        services/
          fuel_ingestion.py
        config.py
        main.py
        schemas.py
      scripts/
        sync_fuel_data.py
      requirements.txt
    web/
      src/
        components/
          StationList.tsx
        lib/
          api.ts
          fuel.ts
        App.tsx
        main.tsx
        index.css
      index.html
      package.json
      tailwind.config.js
      postcss.config.js
      vite.config.ts
  docs/
    architecture.md
```

## Flux de donnees

1. Un job planifie telecharge le flux carburants officiel.
2. Le backend parse le XML, normalise les carburants et calcule la geometrie PostGIS.
3. Les stations et prix sont upsertes en base.
4. L'API expose une recherche par proximite, ville/code postal et type de carburant.
5. Le frontend interroge l'API backend et affiche une liste triee par prix puis distance.

## Choix techniques

- `PostGIS` permet la recherche geospatiale performante via `ST_DWithin`.
- `FastAPI` donne une API typed simple pour ingestion et recherche.
- `PWA` evite de maintenir deux apps natives au depart.

## Source officielle utilisee

- Flux instantane officiel: `https://donnees.roulez-eco.fr/opendata/instantane`
- Jeu de donnees public de l'Etat: `Prix des carburants en France - Flux instantane - v2`
