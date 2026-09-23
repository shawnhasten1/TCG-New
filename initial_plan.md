Sets and cards. A set request returns its logo, symbol, card counts and card list. The counts include how many cards in the set come in reverse holo, holo and first edition. The catch is that each entry in the card list is a "brief" with only the id, image, number and name. There's no rarity, and rarity is what we need to build packs. 
tcgdex
tcgdex

Getting rarity efficiently. The full card object has a rarity field and a variants object saying whether the card comes in normal, reverse holo, holo and first edition versions. We don't want to fetch 200 cards one by one for every set. Instead, the cards endpoint supports filters: strict matching with an eq: prefix, and several values joined with |. So a request like /v2/en/cards?set.id=eq:sv03.5&rarity=eq:Common should return one rarity "bucket," and a handful of requests covers a whole set. The first thing Phase 1 does is confirm that filtering by set.id behaves this way. If it doesn't, the fallback is fetching every full card once and caching it. 
tcgdex
tcgdex

Images. Image URLs come without an extension, and you add a quality and format yourself: high or low, and png, webp or jpg. High is 600×825 and low is 245×337, and webp is the recommended format and keeps the transparent background. We'll use low for collection grids and high for the card being revealed. Some cards have no image (the image field is optional), so the pack builder has to skip those. 
Assets Management +3

Pack artwork. Sets can list boosters with a logo and front and back artwork, which can serve as the wrapper art in the tear animation when a set has it. When it doesn't, we fall back to a generic wrapper with the set logo on it. 
tcgdex

Where it runs. A published Claude artifact can't make network requests or load remote images, so this app has to run on your machine or your own hosting. Plan for a local Vite project that you can later deploy for free to GitHub Pages or Netlify.

The hard parts, decided up front

Pull rates aren't in the API. Pack makeup changed a lot across eras, so we'll define pack profiles as config files, one per era. For example:

Era	Pack size	Typical slots
Base / WOTC	11	7 Common, 3 Uncommon, 1 Rare (with some chance of Holo Rare)
Sword & Shield	10 playable	Commons, Uncommons, 1 Reverse slot, 1 Rare slot that can upgrade to V, VMAX or secret
Scarlet & Violet	10 playable	4 Common, 3 Uncommon, 2 Reverse slots (one can hit an Illustration Rare or SIR), 1 Rare slot (Rare → Double Rare → Ultra Rare → Hyper Rare)

Each slot is a weighted table like { "Rare": 0.75, "Double rare": 0.17, ... }. Real odds come from community estimates rather than official numbers, so they live in editable JSON where you can tune them.

Rarity names differ by era. TCGdex uses strings like "Rare Holo," "Illustration rare" and "Special illustration rare." Phase 1 includes a script that lists the distinct rarities in any set, so each profile maps to the exact strings that set uses.

Each card is rolled for finish, not just for which card. After a slot picks a card, a second roll decides normal, holo or reverse, limited by that card's variants flags. A reverse slot only picks from cards whose variants.reverse is true. A card with only a holo version is always holo.

Foil on real images. With built cards, we controlled exactly where the art window was. With scans, the foil has to be placed by masks:

Holo rare. Foil only on the art box. Within an era the art box sits in nearly the same place, so one mask shape per era handles most cards.
Reverse holo. The inverse of that mask: foil on everything except the art.
Full art, Illustration and Special Illustration rares. Foil over the whole card at a softer intensity, plus glitter.
Ultra and Hyper rares. A stronger, more textured "etched" pattern over the whole card.

The tilt, glare and glitter code from the prototype carries over as is. Only the mask layer is new. The open-source "pokemon-cards-css" project does this well if you want to study its approach, though you'd want to check its license before copying code. One thing to test early: CSS masks that use a remote image need that server to send CORS headers. If assets.tcgdex.net doesn't, we draw the masks ourselves with gradients or inline SVG, which is simpler anyway.

Build phases

Phase 1: Data layer. Set up Vite with TypeScript (React if you'd like it; plain TypeScript works fine at this size). Write an API module with three functions: list sets, get a set, and get a set's cards grouped by rarity. Add an IndexedDB cache so each set downloads once. Build a debug page that shows a set's rarity buckets with their counts, and note whether filtering by set.id works.

Phase 2: Pack engine. Pure functions with no UI: openPack(setData, profile) → [{card, finish}], using a seeded random generator so results can be replayed in tests. Write the era profiles. Add a simulator that opens 10,000 packs and reports how often each rarity came out, so you can check the odds match your intent.

Phase 3: Set picker. Browse sets grouped by series, with logos and release dates. Hide sets that aren't openable, such as promo sets or sets with too few imaged cards to fill a pack. Picking a set loads its data with a progress indicator.

Phase 4: Opening experience. Port the tear animation and use the booster artwork when it exists. Replace the built cards with <img> cards and preload each pack's high-quality images during the tear, so nothing pops in late. Reveal order puts commons first and the rare slot last, with the burst effect scaled to how rare the hit is.

Phase 5: Foil rendering. Build the per-era masks, the finish types above, and a small dev page with every finish side by side for tuning. Respect reduced-motion settings.

Phase 6: Pack realism. Make a pack's contents and card order match a real pack, not just its rarity odds. This comes before Collection because it changes what gets saved.

What the data shows (checked 2026-09-22). Trainers are already in packs. TCGdex gives Trainer cards the same Common, Uncommon and Rare strings as Pokémon, so the rarity pools already include them. For example, 151 has 11 Trainer Uncommons and 51 Pokémon Uncommons, and a test pack pulled Erika's Invitation. Basic Energy depends on the era. From Base through XY, basic energies are numbered cards in the set with the rarity "Common", so they're mixed into the Common slot today. That gives about one energy per Base Set pack, but only by chance, and an energy can take a common's place. From Sword & Shield on, basic energies aren't part of the set, apart from gold Hyper Rare versions, so today's packs never include one. TCGdex keeps them in separate small sets instead: "Scarlet & Violet Energy" (sve, 24 cards) and "Mega Evolution Energy" (mee). The picker currently hides both.

Decisions (2026-09-22). Leave out the energy card. Keep plain basic energies out of every slot, so they no longer take common slots in older sets. Gold and Hyper Rare basic energies stay in, because they are chase cards. Special energies such as Double Colorless also stay. Pack order follows Pokémon's support site: 4 commons, 3 uncommons, then 3 foils, at least one of which is Rare or higher. Sets before Scarlet & Violet only guarantee one reverse foil. The existing profiles already roll slots in that order, so pack order and reveal order are the same list and no separate order setting is needed. The support-site wording is unconfirmed beyond that page, so the profiles cite it as their source.

Done. Cards carry category, energy type and trainer type (cache version 2). The engine drops plain basic energies unless a profile sets includeBasicEnergy. Tests enforce commons → uncommons → foils with the rare slot last, 4/3/3 for Scarlet & Violet, and one reverse slot for older eras. The debug page, the rarities script and the simulator show Pokémon / Trainer / Energy counts.

Phase 7: Collection. Save pulls to IndexedDB with card id, finish and date. Add a binder view per set with missing cards shown faded, completion percentage, and duplicate counts. Optionally, show market value using the TCGPlayer and Cardmarket pricing on each card, which is broken out by variant. 

Done. Pulls are saved when a pack is torn open, with "New" badges for first copies. The binder has filters, finish chips and completion against cards packs can actually produce. A card detail view shows copies, first pull and prices, and there's a collection overview. Prices are per-card REST only (GraphQL has no pricing), so they load on request, three at a time, cached per day.
tcgdex

Phase 8: Polish. Sound effects, a "pack of the day" timer if you want pacing, export and import of the collection as JSON, and deployment.

Done. Sound effects are synthesized with Web Audio: tear, slide, flip, and a chime per hit tier, with mute and volume controls. Pack of the day is an optional daily limit across sets, counted from the collection and resetting at local midnight, with a countdown. Collection export and import work as JSON, merging by pack or replacing. There's a settings page. Deployment has a GitHub Pages workflow, a Netlify config and a favicon. The build was verified serving from a sub-path.

Phase 9: Random sets. Let the app choose the set instead of the player picking every time.

Decisions (2026-09-23). A random set is the only way to open packs. There is no manual set choice and no reroll, since a reroll would amount to picking. Every pack, including "Open another pack", draws a new set uniformly from the sets packs can come from: the same ones the set list offers, minus any found unable to fill a pack. An optional era filter in Settings narrows the draw, and at least one era stays on.

Done. The home page has one "Open a pack" button, and the set list below it now opens each set's binder instead of a pack. #/open deals from a random set. Old #/open/<set> links redirect there and the address is tidied. If a drawn set can't fill a pack, it's marked and another is drawn quietly. The next pack's set is drawn and downloaded while you reveal the current one, so "Open another pack" is usually instant: about 50 ms in testing. The wrapper and the hint name the set you got. Settings has a "Sets packs come from" era filter. The binder button reads "Open a random pack". pickRandomSet and drawableSets are tested for eligibility, the era filter and even coverage.

Phase 10: Collection by Pokémon. Alongside the binder by set, add a view by Pokémon. It shows every card of one Pokémon across sets: each different artwork and rarity, and for each one, which finishes (normal, holo, reverse holo, 1st Edition) you own and which you're missing.

What the data shows (checked 2026-09-23). Every Pokémon card has dexId, its National Pokédex number. It's a list, so tag-team cards such as "Pikachu & Zekrom GX" belong to both Pokémon. A GraphQL cards(filters:{dexId}) query returns every printing of a Pokémon, with rarity, image, variants and set, in one to three pages and under a second: 209 Pikachu across 104 sets, 124 Charizard across 55, 105 Eevee across 62. Those results include promos, trainer kits, McDonald's cards and Pokémon TCG Pocket cards (the Diamond and Star rarities), and about 15–20% of old or odd printings have no image. TCGdex has no species list, so the index needs its own list of names. REST name=like: search works for a search box.

Data work.
- Add dexId to the set card query (cache version 3). The Pokémon index can then group owned cards from set data that's already cached, with no change to saved pulls.
- Add client.getPokemonCards(dexId): the GraphQL query above, cached per day.
- Tag each printing with its set's series, and with whether it's openable here, using the same rules as the picker.
- Bundle a pokedex.json of about 1,025 Pokédex numbers and English names. A one-off npm run pokedex script generates it from PokéAPI and commits it, so the app has no runtime dependency.
- Regional forms (Alolan, Galarian…) share a Pokédex number, so they appear together as variations, labelled by card name.

The Pokémon index (#/pokedex). A grid of the Pokémon you've pulled, shown by the art of your best card of each, with Pokédex number, name, and "4 of 38 cards". It can be sorted by Pokédex number, most cards owned or recently pulled. A search box jumps to any Pokémon, owned or not. The binder gets a "By set / By Pokémon" switch, and the collection page links here.

The Pokémon page (#/pokemon/<dexId>).
- A header with name, Pokédex number and completion: "You own 7 of 96 Pikachu cards from openable sets".
- Printings grouped by era, then set, oldest first.
- Each printing is a tile with the card image (faded if not owned), set name and number, and rarity. Below it is one chip per finish that printing actually has, based on its variants: owned chips show a count ("Reverse ×2"), missing ones are faded, and finishes the printing doesn't have don't appear.
- Filters: owned / missing / all, finish (holo, reverse, 1st Edition), era, and "Include promos and other products". That last one is off by default; with it on, printings you can't pull in this app show as "not in packs", like the binder does.
- Clicking a tile opens the existing card detail, with finish tabs, copies, first pull and prices.
- Totals count unique printings and finish variants separately, so "96 cards, 180 card-and-finish combinations" can both be tracked.

Decisions (2026-09-23). A Pokémon's completion counts only printings from sets packs can come from. A toggle shows promos and other products, which never count.

Done. Cards carry dexId (cache version 3). client.getPokemonCards(dexId) fetches every printing across sets, cached per day. src/collection/pokedex.json holds 1,025 names from npm run pokedex. #/pokedex is the index of Pokémon you own, sortable, with search for any Pokémon. #/pokemon/<dexId> shows every printing in one grid per era, oldest first, each tile labelled with set, year, number and rarity, plus finish chips (owned ×n, missing faded). It has owned/missing, finish and era filters, the promos toggle, and previous/next Pokémon links. Completion is shown for cards and for card-and-finish combinations. For Black & White, XY and Sun & Moon, which have no finish data, finishes follow the pack rules. The collection page and binder have a By set / By Pokémon switch, and the card detail links to "All <Pokémon> cards". In testing, Pikachu showed 82 printings packs can give out of 209, and 126 card-and-finish combinations.

Out of scope for now: grouping identical artwork reprinted in different sets (possible later by illustrator plus name), a Trainer-card view by name, and wishlists.

Work. Pure grouping and completion functions with tests: owned cards by Pokémon, the finish matrix per printing, and eligibility filters. Then the API addition, the Pokédex data script, the two pages, and links from the binder and collection. About two to three days. Phase 10 doesn't depend on Phase 9, so they can be built in either order.

Phases 1 and 2 are the foundation, and they're quick. Once the engine can print real pulls from a real set, everything after that is presentation.