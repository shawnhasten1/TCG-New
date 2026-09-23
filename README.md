# Pack Opener

Opens virtual Pokémon TCG booster packs using real card data and scans from [TCGdex](https://tcgdex.dev). See [initial_plan.md](initial_plan.md) for the full plan.

## Commands

```sh
npm install
npm run dev                          # app at http://localhost:5173 (collection: #/collection, debug: #/debug/sv03.5, foil lab: #/foil)
npm test                             # engine unit tests (offline)
npm run rarities -- sv03.5 swsh7     # distinct rarities + variant counts per set
npm run open -- sv03.5 [seed]        # open one pack from a real set
npm run simulate -- sv03.5 [n] [seed]   # open n packs (default 10,000) and report rates
```

Scripts cache API responses in `.cache/`. Delete it to refetch.

## Status

- **Phase 1, data layer: done.** `src/api/`: `listSets`, `getSet`, `getSetCards` (grouped by rarity), with IndexedDB caching in the browser and a debug page at `src/debug/`.
- **Phase 2, pack engine: done.** `src/engine/`: `openPack(setData, profile, rng)`, a seeded RNG, era profiles in `src/engine/profiles/*.json`, and a simulator.
- **Phase 3, set picker: done.** `src/picker/`: sets grouped by series with logos and release dates, loaded in one GraphQL request. Promos, energy sets, trainer galleries and sets under 40 cards are hidden (`src/engine/openable.ts`). A set that loads but can't fill a pack is remembered and hidden too.
- **Phase 4, opening: done.** `src/opener/`: the tear, tilt, burst and glare from `Booster pack opening.html`, now with real scans. Each pack's high-quality images preload during the tear, cards reveal in slot order (rare last), the burst scales with the hit (`src/engine/tiers.ts`), and a summary grid follows the last card.
- **Phase 5, foil: done.** `src/foil/`: every card renders through `FoilCard`, which picks a treatment from finish and rarity (`treatment.ts`):
  - **Holo rare**: foil inside the era's art box only.
  - **Reverse holo**: the inverse of that box, inside the printed border.
  - **Full art / illustration rares / rule-box cards (ex, V, VMAX…)**: soft foil over the whole card, plus glitter.
  - **Ultra / secret / hyper rares**: stronger etched texture over the whole card, gold-tinted for hyper rares.

  Art boxes for 10 frame layouts (WOTC through SV/ME) were measured on real scans and live in `layouts.ts`. Masks are inline SVG, so they don't depend on remote-image CORS. The foil lab (`#/foil`) shows every era in normal, holo and reverse next to real full-art examples, with an art-box overlay, a light sweep, and strength sliders for tuning. Reduced motion shrinks tilt, skips the burst, and stops glitter chasing the pointer.
- **Phase 6, pack realism: done.** Packs follow Pokémon's published order: commons, then uncommons, then foils, rare slot last. Scarlet & Violet is 4/3/3 with two reverse slots; older eras guarantee one reverse. Trainers were already in the pools. Plain basic energies are kept out (`isFillerEnergy` in `src/engine/openPack.ts`), and there is no separate energy card. Gold/hyper basic energies and special energies can still be pulled.
- **Phase 7, collection: done.** `src/collection/`. Each pack is saved to IndexedDB (`tcg-collection` database) as it's torn: card, finish, 1st Edition, pack id, date. Cards new to the collection get a "New" badge in the reveal and summary. `#/binder/<set>` shows every card in number order, missing cards faded, with copies, finish chips, filters (owned / missing / duplicates), and main-set and with-secrets completion. Completion only counts cards packs can produce, so 100% is reachable. Clicking a card opens a tiltable foil view with copies per finish, first-pull date and market prices. `#/collection` lists opened sets by most recent, and the picker shows a per-set "collected" chip. Prices come from TCGdex's per-card REST pricing (GraphQL has none): TCGplayer USD by printing, falling back to Cardmarket EUR. They are cached per day and fetched three at a time, only on request in the binder.

## API findings (checked 2026-09-22)

- `/cards?set.id=eq:<id>&rarity=eq:A|B` filtering works, but it returns briefs only (no rarity or variants). `variants.reverse=true` works as a filter; `eq:true` does not.
- GraphQL `cards(filters:{id:"<set>-"}, pagination:{page, count:100})` returns rarity and variants for every card in about 3 requests per set, so it's the primary path. Querying cards nested under `set(id)` errors. Cards GraphQL drops are fetched one at a time over REST.
- `api.tcgdex.net` and `assets.tcgdex.net` both send `access-control-allow-origin: *`, so remote-image CSS masks will work.
- Only Pokémon TCG Pocket sets list `boosters`, and their artwork is null, so every set uses the generic wrapper (a per-set hue plus the logo). The opener uses `artwork_front` if one ever appears.
- Base Set scans on TCGdex show the 1st Edition stamp, even though the engine opens Unlimited packs by default.
- **Variant flags are missing for BW, XY and SM sets** (every card is flagged normal only). The engine detects this and uses the profile's finish odds, plus `reverseFallback` rarities for the reverse slot.
- Base-era holo rares share the `Rare` string with non-holos. Profiles split them with `Rare#holo` / `Rare#nonholo`.
- The API returned 503s under burst load, so requests retry with backoff.

## Pack profiles

Each profile is JSON: a list of slots, each with a `count` and a weighted `table` of selectors:

| Selector | Matches |
| --- | --- |
| `"Rare"` | cards with that exact TCGdex rarity |
| `"Rare#holo"` / `"Rare#nonholo"` | that rarity, holo-only printings or cards that have a normal printing |
| `"@reverse"` | any reverse-eligible card, always a reverse finish |

Selectors a set doesn't have are dropped and the remaining weights renormalized, so one profile can list every rarity string its era uses. `finish` / `finishOverrides` set the normal-vs-holo odds, limited to the printings the card actually has. Odds are community estimates, so tune them and re-run `npm run simulate`.
