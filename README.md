# Late Night ATL

A guide to places open late in Atlanta. Built with [Astro](https://astro.build) and deployed to GitHub Pages by GitHub Actions.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321/
npm run build    # type-check, validate data, and build to dist/
```

## Adding or editing places

All places live in [`src/data/places.json`](src/data/places.json). Each entry's `hoursSource` records where its hours came from, so it's easy to re-check them.

```json
{
  "id": "url-slug",
  "name": "Display Name",
  "type": "restaurant",
  "cuisine": ["korean", "bbq"],
  "area": "Buford Highway",
  "address": "123 Street, Atlanta, GA 30000",
  "lat": 33.86, "lng": -84.30,
  "hours": {
    "fri": [["17:00", "03:00"]],
    "sat": [["11:00", "15:00"], ["17:00", "03:00"]]
  },
  "url": "https://…", "phone": "(404) 555-0100", "notes": "Cash only",
  "lastVerified": "2026-11-13"
}
```

- **hours**: 24-hour `"HH:MM"`, Atlanta time. A close at or before the open time means it closes after midnight (`["18:00", "02:00"]`). A missing day means closed that day. Open 24 hours is `["00:00", "24:00"]`.
- **type** and **area** must be values from [`src/data/taxonomy.ts`](src/data/taxonomy.ts). Add new ones there.
- **cuisine** is free text, lowercase. The cuisine filter lists whatever values the data contains.
- **lat/lng**: right-click the spot in Google Maps or OpenStreetMap to copy them.
- `npm run build` fails with a clear message if an entry is malformed.

## How "open at" works

A "night" runs until 5 AM the next morning, so "Friday night, still open at 2 AM" checks 2 AM Saturday. That catches both Friday hours that run past midnight and places open around the clock. See [`src/lib/hours.ts`](src/lib/hours.ts).

## Deploying

Every push to `main` builds and deploys the site through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

The site is served at https://latenightatl.com. The domain is set in `public/CNAME` and in `site` in `astro.config.mjs`.

Map tiles come from OpenStreetMap's standard tile server, darkened with CSS. Its [usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light traffic. If the site gets busy, switch the URL in `src/scripts/map.ts` to a provider such as Stadia Maps or MapTiler (both have free tiers and use domain-restricted keys).
