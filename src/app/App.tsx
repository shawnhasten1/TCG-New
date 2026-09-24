import { BinderPage } from "../collection/BinderPage";
import { CardsPage } from "../collection/CardsPage";
import { CollectionPage } from "../collection/CollectionPage";
import { FriendCollectionProvider } from "../collection/source";
import { PokedexPage } from "../collection/PokedexPage";
import { PokemonPage } from "../collection/PokemonPage";
import { DebugPage } from "../debug/DebugPage";
import { FoilLab } from "../foil/FoilLab";
import { OpenPage } from "../opener/OpenPage";
import { SetPicker } from "../picker/SetPicker";
import { FeedPage } from "../social/FeedPage";
import { FriendsPage } from "../social/FriendsPage";
import { TradeComposer } from "../social/TradeComposer";
import { TradesPage } from "../social/TradesPage";
import { AppNav } from "./AppNav";
import { navSection, useRoute, type Route } from "./router";
import { SettingsPage } from "./SettingsPage";

export function App() {
  const route = useRoute();
  const section = navSection(route);
  return (
    <>
      {section && <AppNav current={section} />}
      <Page route={route} />
    </>
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
    case "pokemon":
      return <PokemonPage key={route.dexId} dexId={route.dexId} />;
    case "friend":
      return (
        <FriendCollectionProvider key={route.friendId} friendId={route.friendId}>
          {route.view === "binder" ? <BinderPage key={route.setId} setId={route.setId!} /> : route.view === "cards" ? <CardsPage /> : <CollectionPage />}
        </FriendCollectionProvider>
      );
    case "trades":
      return <TradesPage />;
    case "trade":
      return <TradeComposer key={route.friendId} friendId={route.friendId} />;
    case "feed":
      return <FeedPage />;
    case "friends":
      return <FriendsPage key={route.code} inviteCode={route.code} />;
    case "collection":
      return <CollectionPage />;
    case "binder":
      return <BinderPage key={route.setId} setId={route.setId} />;
    case "foil":
      return <FoilLab />;
    case "debug":
      return <DebugPage initialSetId={route.setId} />;
    default:
      return <SetPicker />;
  }
}
