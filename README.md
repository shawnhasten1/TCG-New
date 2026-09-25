# Pack Opener

Opens virtual Pokémon TCG booster packs using real card data and scans from [TCGdex](https://tcgdex.dev). See [initial_plan.md](initial_plan.md) for the full plan.

## Commands

```sh
npm install
npm run dev                          # app at http://localhost:5173 (#/ opens packs; #/sets, #/collection, #/pokedex, #/feed, #/friends, #/friend/<id>, #/trades, #/market, #/settings, debug: #/debug/sv03.5, foil lab: #/foil)
npm run pokedex                      # regenerate src/collection/pokedex.json (Pokémon names) from PokéAPI
npm test                             # unit tests (offline)
npm run deploy                       # build, apply D1 migrations, deploy to Cloudflare
npm run pack-prices                  # re-price the shop's packs from today's card prices (slow the first time each day)
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
- **Phase 8, polish: done.**
  - **Sound effects** (`src/app/sound.ts`) are synthesized with Web Audio, so there are no files to host or license: a foil tear, cards sliding out, a flick per card, and a chime that grows with the hit tier. There's a mute button in the opener, and volume is in settings.
  - **Pack allowance**: you can hold 10 packs, across all sets. Below that, one comes back every 2 minutes. The server enforces it (`packAllowance` in `src/packs/protocol.ts`), counting from the packs it opened, deleted ones included. When you run out you get a live countdown, and the next pack is dealt when it ends. A pack you're partway through revealing is never taken away.
  - **Export**: download the collection as JSON, as a record. There's no import, since a file can be edited and packs only come from the server.
  - **Settings** live at `#/settings`, and preferences are kept in localStorage.
  - **Deployment**: Cloudflare Workers (see below), a favicon, and a meta description.
- **Phase 9, random sets: done.** Every pack comes from a randomly drawn set (`src/engine/randomSet.ts`, drawn on the server); there's no manual set choice. The app starts on the opener (`#/`; old `#/open` links still work), and the set list at `#/sets` opens binders. The next set downloads while you reveal, and Settings can limit the draw by era.
- **Phase 11, mobile first: done.** The opener is home, with a thumb-sized top bar (collection, sets, settings, sound). The pack is sized so it and its button fit a phone screen, and the pack summary is three across. On phones the card detail is a bottom sheet with a pinned close button and a handle you can pull down; zoomed cards tilt by dragging, and a tap puts them back.
- **Motion tilt**: on phones, tilting the phone tilts the card (`src/opener/motion.ts`), in the opener and the card detail. Level is however you hold the phone and slowly follows your hand; a finger on the card takes priority. iOS asks for motion access on the first tap. It needs HTTPS, so test it on the deployed site, not the dev server over your LAN. It can be turned off in settings.
- **Phase 10, collection by Pokémon: done.** `#/pokedex` lists the Pokémon you own (search jumps to any Pokémon). `#/pokemon/<dexId>` shows every printing of that Pokémon across sets, grouped by era, with finish chips for what you own and what's missing, and completion over the printings packs can give you. Promos and other products are behind a toggle. Logic is in `src/collection/pokedex.ts`.

## Accounts and sync

Players can sign in with Google or with an email and password, and their collection follows them to every device. Signing up is optional: a first visit quietly makes a **guest account** (`POST /api/auth/guest`, limited to 20 a minute per IP), tied to that browser's cookie. Signing up as a guest turns it into a real account, packs and all; signing in to an existing account moves the guest's packs into it. Guests can't add friends.

**Packs are opened by the server** (`worker/packs.ts`), so every card in a collection came from a real pack. `POST /api/packs/deal` draws a set (rarity tiers, pity and the era filter from Settings), rolls the pack with the same engine as before and holds it in `dealt_packs` until it's torn, so asking again, or reloading, returns the same pack. Tearing saves it here and queues `{ op: "open" }` in the outbox; the next deal also carries the torn pack's id, and whichever arrives first moves it into `packs`. The Worker fetches TCGdex data through the app's client with a D1 cache (`api_cache`, `worker/cache.ts`). Opening packs needs a connection. Uploads of packs made on a device (the old `add` op) are ignored.

- **Worker** (`worker/`): `/api/auth/*` (guest, register, login, logout, password, Google OAuth with PKCE), `/api/packs/deal`, `/api/friends/*`, `/api/feed/*` and `/api/collection` (push changes, pull changes since a cursor). Everything outside `/api/` is served straight from the built app (`run_worker_first` in `wrangler.jsonc`).
- **D1** (`migrations/`): `users`, `sessions` (hashed tokens in an HttpOnly cookie, 30 days, extended when used), `packs` (one row per pack; deletes stay as tombstones so every device hears about them), `dealt_packs` and `api_cache`. Guest accounts keep a `guest-<id>` placeholder in `users.email`, because making the column optional would mean rebuilding the table, and that cascade-deletes every session and pack.
- **App**: IndexedDB is still what the app reads. Each change also goes into an outbox (`src/collection/store.ts`), and `src/sync/sync.ts` pushes it and then pulls the account's changes: at startup, after a change, when the tab comes back, when back online, and every 5 minutes. A device takes on the account's collection when it links to it, and signing out clears it.
- **Google and password accounts** match on email. Password sign-ups aren't email-verified, so if Google signs in to an unverified account with the same email, the account is linked, its password removed and other sessions ended. The owner can add a new password in Settings.
- **Friends** (`worker/friends.ts`, `src/social/`): `#/friends` shows your friend code (8 characters without 0/O/1/I, like `K7QX-3M9P`) with copy and invite-link buttons (`#/friends/<code>` fills in the code). Friends see a display name you pick there, never your email. Requests wait for the other person to accept; if they'd already asked you, sending one back makes you friends straight away. Declining, cancelling and removing all just delete the pair's row (`friendships`, migration 0002). Requests are rate-limited per account (`FRIEND_LIMITER`) so codes can't be guessed by trying them all. A badge on the top bar's friends button counts waiting requests; it refreshes from `/api/social/inbox` after every sync.
- **Feed** (`worker/feed.ts`, `src/social/FeedPage.tsx`, `#/feed`): signed-up players share cards to their friends. **Share** under a card during the reveal shares that card; **Share cards…** in the pack summary picks several. A post is one pack, so sharing more from the same pack adds to its post (`posts`, migration 0004). Posts carry their card data, so the feed never downloads whole sets; tapping a card opens the closer look in the finish it was pulled in. Sharing straight from the reveal opens the pack on the server first, in case sync hasn't yet. You see your own and your friends' posts, newest first, 20 at a time; posts from someone you unfriend stop showing, and you can remove your own. The top bar's friends button opens the feed, with a badge for friend requests plus friends' posts since you last looked (`users.feed_seen_at`).
- **Card identity** (groundwork for trading): every card is `<packId>:<slot>`, its pack and its position in it (`cardUid` in `src/sync/protocol.ts`). A card traded away stays in its pack on the server, marked `gone`, so pack history and the allowance stay true, and devices leave it out. Cards received in a trade will arrive as packs of their own with ids starting `t-`, which don't count as opened packs (`countPacks`). When the server changes a pack it gives it a new seq, and devices replace their copy. The app's database went to version 3 for this: it clears its cards once and pulls the collection again, keeping anything still waiting to sync.
- **Friends' collections**: `#/friend/<id>` shows a friend's collection read-only, by set, in binders (`#/friend/<id>/binder/<set>`) and by rarity (`#/friend/<id>/cards`), reusing the collection pages through a collection source (`src/collection/source.tsx`). The cards come from `GET /api/friends/<id>/collection`, for friends only. Open one from the friends list or a feed post's name.
- **Trades** (`worker/trades.ts`, `#/trades`, `#/trade/<friendId>`): from the friends list or a friend's collection, **Trade** opens a picker with their cards and yours (copies of a card share a tile; tapping adds another copy), up to 10 cards a side; either side can be empty, for a gift, and you're warned before offering your last copy. The friend accepts or declines, and you can call it off while it waits. Offers are checked when made and again when accepted, and removing a friend calls off trades between you. Accepting swaps the cards in one D1 batch (a transaction) that starts with a check per card in `trade_checks`, whose `CHECK` constraint fails, rolling everything back, if a card was traded, deleted or the offer answered in the meantime, so two offers for the same card can't both go through. Handed-over cards are marked `gone` in their packs and arrive as `t-<trade>-<n>` packs, one per set; sync carries the swap to every device. Received cards can be traded on but not shared to the feed. Trade offers count toward the top bar's badge and show on the Trades tab.
- **Coins** (`worker/wallet.ts`, `src/market/`, groundwork for the market): the market's play money, earned by selling cards and spent on packs; not real money, never bought, never passed between players, and members only. Each player has a balance (`users.coins`) and a history (`wallet_ledger`, migration 0007) that records every change with the balance straight after. Changes go through `walletStatements`, batched with whatever the coins are for; a `CHECK (coins >= 0)` rolls back any batch that would overdraw. A card is worth its market price at 1 coin to the US cent (euros at a fixed 1.1), worked out by the Worker from today's prices; cards without a price count as a stand-in for their rarity. `GET /api/wallet` returns the balance and the last 50 entries.
- **Market, selling** (`worker/market.ts`, `src/market/`, `#/market`, `#/market/pick`, `#/market/wallet`): members pick cards to sell (30 at a time, up to 100 on the market; **Pick all duplicates** keeps one of each) and trainers start making offers: one straight away, usually low (65–90% of the card's value), then another every minute (80–103%), up to 10. Every offer stays on the table, and the board shows them all, newest first, with the best picked out; **Sell** takes the best. Nothing is sold or kept for the player: they have 12 hours after the last offer to sell or keep, and if they leave it the listing lapses and the card stays in their collection. A kept or lapsed card can go straight back on the market for a fresh run of offers. Who makes an offer goes with how good it is: Youngsters and Bug Catchers lowball, Hikers and Fishermen come near, Ace Trainers and Scientists pay fair, and Collectors and Gentlemen pay top coin (`TRAINERS` in `src/market/protocol.ts`). Offers aren't stored: each, trainer and all, is worked out from the listing's seed and its number, so reloading can't reroll one, and the app is only told offers that have come in. Selling takes the offers picked (with 5 seconds' grace after a listing lapses) in one D1 batch that starts with a check per card in `sale_checks`, like trades: the card is marked `gone` (`sale:<listing>`) in its pack and the coins land together, or nothing happens. Cards traded or deleted since they were listed are skipped and the rest still sell. `listings` is migration 0008. Listing also prunes past days' prices from the Worker's cache (`pruneDailyEntries`). The picker's card grid is shared with the trade composer (`collection/PickGrid.tsx`).
- **Market, shop** (`worker/shop.ts`, `src/market/shop.ts`, `src/market/ShopTab.tsx`, `#/market/shop`): members spend coins on a pack from a set they pick; the wrapper is still random. Sets are listed by tier, cheapest first. A set's price is the average value of a pack's cards marked up (`PACK_MARKUP`), with a minimum per set tier (`TIER_FLOOR`), so buying packs to sell their cards loses coins. `npm run pack-prices` (`scripts/packPrices.ts`) works the values out: it opens 3,000 packs of each openable set with the real engine, prices every card that came out in its finish, and writes `src/market/packPrices.json`; sets missing from it aren't sold. A bought pack is rolled when it's bought (`rollSet` in `worker/packs.ts`, shared with free packs) and waits, unopened, in `pack_inventory` (migration 0009) with an `s-` id, up to 50 at a time. The coins come off and the pack goes in in one batch, which the balance's `CHECK` rolls back if it can't cover it.
- **Not yet**: "forgot password" (needs an email sender) and account deletion.

## Deploying

The app runs on Cloudflare Workers (static assets plus the API Worker), at tcg.spudfurd.dev.

One-time setup:

1. `npx wrangler d1 create tcg` and put the `database_id` it prints into `wrangler.jsonc`.
2. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Authorized redirect URIs: `https://tcg.spudfurd.dev/api/auth/google/callback`, `https://tcg-pack-opener.<account>.workers.dev/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback`. Set up the consent screen with the `openid`, `email` and `profile` scopes.
3. `npx wrangler secret put GOOGLE_CLIENT_ID` and `npx wrangler secret put GOOGLE_CLIENT_SECRET`. For local dev, copy `.dev.vars.example` to `.dev.vars` and fill it in. Without them, Google sign-in is hidden and email/password still works.

Then `npm run deploy` builds, applies any new D1 migrations and deploys. For local dev, run `npm run db:migrate:local` once (and after adding a migration), then `npm run dev`. After changing bindings in `wrangler.jsonc`, run `npm run cf-typegen`.

`.github/workflows/ci.yml` runs the tests and a production build on every push and pull request; it doesn't deploy.

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
