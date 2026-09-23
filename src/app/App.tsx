import { BinderPage } from "../collection/BinderPage";
import { CollectionPage } from "../collection/CollectionPage";
import { DebugPage } from "../debug/DebugPage";
import { FoilLab } from "../foil/FoilLab";
import { OpenPage } from "../opener/OpenPage";
import { SetPicker } from "../picker/SetPicker";
import { useRoute } from "./router";
import { SettingsPage } from "./SettingsPage";

export function App() {
  const route = useRoute();
  switch (route.page) {
    case "open":
      return <OpenPage />;
    case "settings":
      return <SettingsPage />;
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
