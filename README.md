# Pack Opener

Opens virtual Pokémon TCG booster packs using real card data and scans from [TCGdex](https://tcgdex.dev). See [initial_plan.md](initial_plan.md) for the full plan.

## Commands

```sh
npm install
npm run dev                          # debug page at http://localhost:5173/?set=sv03.5
npm test                             # engine unit tests (offline)
npm run rarities -- sv03.5 swsh7     # distinct rarities + variant counts per set
npm run open -- sv03.5 [seed]        # open one pack from a real set
npm run simulate -- sv03.5 [n] [seed]   # open n packs (default 10,000) and report rates
```

Scripts cache API responses in `.cache/`. Delete it to refetch.

## Status

- **Phase 1, data layer: done.** `src/api/`: `listSets`, `getSet`, `getSetCards` (grouped by rarity), with IndexedDB caching in the browser and a debug page at `src/debug/`.
- **Phase 2, pack engine: done.** `src/engine/`: `openPack(setData, profile, rng)`, a seeded RNG, era profiles in `src/engine/profiles/*.json`, and a simulator.

## API findings (checked 2026-09-22)

- `/cards?set.id=eq:<id>&rarity=eq:A|B` filtering works, but it returns briefs only (no rarity or variants). `variants.reverse=true` works as a filter; `eq:true` does not.
- GraphQL `cards(filters:{id:"<set>-"}, pagination:{page, count:100})` returns rarity and variants for every card in about 3 requests per set, so it's the primary path. Querying cards nested under `set(id)` errors. Cards GraphQL drops are fetched one at a time over REST.
- `api.tcgdex.net` and `assets.tcgdex.net` both send `access-control-allow-origin: *`, so remote-image CSS masks will work.
- None of the sets checked list `boosters`, so the generic wrapper will be the usual case.
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
