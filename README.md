# Late Night ATL

A guide to places open late in Atlanta. Built with [Astro](https://astro.build) and deployed to GitHub Pages by GitHub Actions.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321/
npm run build    # type-check, validate data, and build to dist/
```

## Tests

```sh
npm test             # unit tests + browser tests
npm run test:unit    # hours logic only (fast)
npm run test:e2e     # browser tests: desktop, iPhone 13, iPhone SE sizes
npm run test:update  # accept intended visual changes (rewrites reference screenshots)
npx playwright show-report   # see failures, with screenshot diffs
```

- **Unit tests** (`tests/unit/`) cover the opening-hours logic: past-midnight hours, 24-hour places, split hours, the 5 AM night rollover.
- **Browser tests** (`tests/e2e/`) build the site from `tests/fixtures/places.json`, a fixed set of fictional places, with the clock frozen at Friday 10:30 PM. Editing the real data never breaks them. They check filters, "Near me", the phone list/map switch, every place page, that nothing scrolls sideways, that phone tap targets are at least 40px, that the browser logs no errors, and they compare screenshots against references.
- **Reference screenshots** live in `tests/e2e/__screenshots__/darwin/` (macOS). After an intended design change, run `npm run test:update` and commit the new screenshots.
- Tests run **locally only**. Run `npm test` before pushing. GitHub Actions only builds and deploys, and the build still fails on malformed data in `places.json`.

## Adding or editing places

All places live in [`src/data/places.json`](src/data/places.json). Each entry's `sources` lists the pages its facts came from, so they're easy to re-check.

```json
{
  "id": "url-slug",
  "name": "Display Name",
  "type": "food",
  "cuisine": ["korean", "bbq"],
  "area": "Buford Highway",
  "address": "123 Street, Atlanta, GA 30000",
  "lat": 33.86, "lng": -84.30,
  "hours": {
    "fri": [["17:00", "03:00"]],
    "sat": [["11:00", "15:00"], ["17:00", "03:00"]]
  },
  "url": "https://…", "phone": "(404) 555-0100", "notes": "Cash only",
  "sources": ["https://…/hours"],
  "lastVerified": "2026-11-13"
}
```

### Sources

List every page you relied on in `sources`, for the hours, tags and notes alike. The place page shows them by site name.

- **The place's own site** (or its official social account) is enough on its own; cite the exact page.
- **Listings and press** (Yelp, Google, guides, blogs) need two that agree. One source alone can go in `notes`, worded as unconfirmed, but not in `hours` or `tags`.
- Update `lastVerified` whenever you re-check.

A weekly GitHub Action (`.github/workflows/external-links.yml`) checks every link in the data and opens an issue listing any that are gone or have moved. Run it locally with `npm run check:links`.

- **hours**: 24-hour `"HH:MM"`, Atlanta time. A close at or before the open time means it closes after midnight (`["18:00", "02:00"]`). A missing day means closed that day. Open 24 hours is `["00:00", "24:00"]`.
- **type** is one value, or a list when a place is several things (`["grocery", "pharmacy"]` for a CVS).
- **type** and **area** must be values from [`src/data/taxonomy.ts`](src/data/taxonomy.ts). Add new ones there.
- **cuisine** is free text, lowercase. The cuisine filter lists whatever values the data contains.
- **tags** (optional) flag things worth knowing before you go: `cover`, `cash-only`, `21-plus` (see `TAGS` in the taxonomy). Leave a tag off when unsure; no tag means "unknown", not "no". Put specifics such as price or which nights in **notes**.
- **lat/lng**: right-click the spot in Google Maps or OpenStreetMap to copy them.
- `npm run build` fails with a clear message if an entry is malformed.

## How "open at" works

A "night" runs until 5 AM the next morning, so "Friday night, still open at 2 AM" checks 2 AM Saturday. That catches both Friday hours that run past midnight and places open around the clock. See [`src/lib/hours.ts`](src/lib/hours.ts).

## Deploying

Every push to `main` builds and deploys the site through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

The site is served at https://latenightatl.com. The domain is set in `public/CNAME` and in `site` in `astro.config.mjs`.

Maps are drawn in the browser with [MapLibre](https://maplibre.org/) from [OpenFreeMap](https://openfreemap.org/)'s free vector tiles (no key or account). The colors are the site's own: `PALETTE` in [`src/scripts/map.ts`](src/scripts/map.ts) recolors OpenFreeMap's "dark" style by layer id.
