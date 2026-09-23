import { DebugPage } from "../debug/DebugPage";
import { OpenPage } from "../opener/OpenPage";
import { SetPicker } from "../picker/SetPicker";
import { useRoute } from "./router";

export function App() {
  const route = useRoute();
  switch (route.page) {
    case "open":
      return <OpenPage key={route.setId} setId={route.setId} />;
    case "debug":
      return <DebugPage initialSetId={route.setId} />;
    default:
      return <SetPicker />;
  }
}
