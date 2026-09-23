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

Phases 1 and 2 are the foundation, and they're quick. Once the engine can print real pulls from a real set, everything after that is presentation.