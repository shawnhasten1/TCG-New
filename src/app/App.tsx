import { AllCardsPage } from "../collection/AllCardsPage";
import { BinderPage } from "../collection/BinderPage";
import { CardsPage } from "../collection/CardsPage";
import { CollectionPage } from "../collection/CollectionPage";
import { FriendCollectionProvider } from "../collection/source";
import { PokedexPage } from "../collection/PokedexPage";
import { PokemonPage } from "../collection/PokemonPage";
import { PacksPage } from "../collection/PacksPage";
import { DebugPage } from "../debug/DebugPage";
import { BoughtPackPage } from "../market/BoughtPackPage";
import { MarketPage } from "../market/MarketPage";
import { SellPicker } from "../market/SellPicker";
import { FoilLab } from "../foil/FoilLab";
import { OpenPage } from "../opener/OpenPage";
import { PackLab } from "../opener/PackLab";
import { SetPicker } from "../picker/SetPicker";
import { FeedPage } from "../social/FeedPage";
import { FriendsPage } from "../social/FriendsPage";
import { TradeComposer } from "../social/TradeComposer";
import { TradesPage } from "../social/TradesPage";
import { MtgBinderPage } from "../mtg/MtgBinderPage";
import { MtgCollectionPage } from "../mtg/MtgCollectionPage";
import { AppNav } from "./AppNav";
import { ConfirmHost } from "./Confirm";
import { GAME } from "./game";
import { GameSwitch } from "./GameSwitch";
import { navSection, useRoute, type Route } from "./router";
import { SettingsPage } from "./SettingsPage";

export function App() {
  const route = useRoute();
  const section = navSection(route);
  return (
    <>
      {section && <AppNav current={section} />}
      {GAME === "mtg" ? <MtgPage route={route} /> : <Page route={route} />}
      <ConfirmHost />
    </>
  );
}

/** Magic has packs and a collection so far; the rest of the app is Pokémon's. */
function MtgPage({ route }: { route: Route }) {
  switch (route.page) {
    case "open":
      return <OpenPage />;
    case "settings":
      return <SettingsPage />;
    case "collection":
    case "picker":
      return <MtgCollectionPage />;
    case "binder":
      return <MtgBinderPage key={route.setId} setId={route.setId} />;
    case "foil":
      return <FoilLab />;
    default:
      return <PokemonOnly />;
  }
}

function PokemonOnly() {
  return (
    <main className="collection">
      <h1>Pokémon only, for now</h1>
      <p className="muted">The market, trades and the friends feed aren't in Magic yet. Switch games to use them; your Magic cards stay here.</p>
      <GameSwitch />
    </main>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "open":
      return <OpenPage />;
    case "settings":
      return <SettingsPage />;
    case "pokedex":
      return <PokedexPage />;
    case "cards":
      return <CardsPage />;
    case "all":
      return <AllCardsPage />;
    case "pokemon":
      return <PokemonPage key={route.dexId} dexId={route.dexId} />;
    case "friend":
      return (
        <FriendCollectionProvider key={route.friendId} friendId={route.friendId}>
          {route.view === "binder" ? <BinderPage key={route.setId} setId={route.setId!} /> : route.view === "cards" ? <CardsPage /> : route.view === "all" ? <AllCardsPage /> : <CollectionPage />}
        </FriendCollectionProvider>
      );
    case "trades":
      return <TradesPage />;
    case "trade":
      return <TradeComposer key={route.friendId} friendId={route.friendId} />;
    case "market":
      return <MarketPage tab={route.tab} />;
    case "marketPick":
      return <SellPicker />;
    case "openBought":
      return <BoughtPackPage key={route.packId} packId={route.packId} />;
    case "feed":
      return <FeedPage />;
    case "friends":
      return <FriendsPage key={route.code} inviteCode={route.code} />;
    case "collection":
      return <CollectionPage />;
    case "binder":
      return <BinderPage key={route.setId} setId={route.setId} fromShop={route.fromShop} />;
    case "foil":
      return <FoilLab />;
    case "packLab":
      return <PackLab />;
    case "packs":
      return <PacksPage />;
    case "debug":
      return <DebugPage initialSetId={route.setId} />;
    default:
      return <SetPicker />;
  }
}
