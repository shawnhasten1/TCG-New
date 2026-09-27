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
import { CardIndexPage } from "../mtg/CardIndexPage";
import { PrintingsPage } from "../mtg/PrintingsPage";
import { OpenPage } from "../opener/OpenPage";
import { PackLab } from "../opener/PackLab";
import { SetPicker } from "../picker/SetPicker";
import { FeedPage } from "../social/FeedPage";
import { FriendsPage } from "../social/FriendsPage";
import { TradeComposer } from "../social/TradeComposer";
import { TradesPage } from "../social/TradesPage";
import { AppNav } from "./AppNav";
import { ConfirmHost } from "./Confirm";
import { gameName, type Feature } from "../game";
import { GAME, has } from "./game";
import { GameSwitch } from "./GameSwitch";
import { navSection, useRoute, type Route } from "./router";
import { SettingsPage } from "./SettingsPage";

export function App() {
  const route = useRoute();
  const section = navSection(route);
  const need = NEEDS[route.page];
  return (
    <>
      {section && <AppNav current={section} />}
      {need && !has(need) ? <NotHere /> : <Page route={route} />}
      <ConfirmHost />
    </>
  );
}

/** Pages that are part of a feature some games don't have yet (see Feature in ../game.ts). */
const NEEDS: Partial<Record<Route["page"], Feature>> = {
  pokedex: "pokedex",
  pokemon: "pokedex",
  cardIndex: "printings",
  printings: "printings",
  packs: "packArt",
  market: "market",
  marketPick: "market",
  openBought: "market",
  feed: "social",
  friends: "social",
  friend: "social",
  trades: "social",
  trade: "social",
};

function NotHere() {
  return (
    <main className="collection">
      <h1>Not in {gameName(GAME)} yet</h1>
      <p className="muted">This part of the app is only in Pokémon for now. Switch games to use it; your {gameName(GAME)} cards stay here.</p>
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
    case "cardIndex":
      return <CardIndexPage />;
    case "printings":
      return <PrintingsPage key={route.oracleId} oracleId={route.oracleId} />;
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
