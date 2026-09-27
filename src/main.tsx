import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { GAME, startGames } from "./app/game";
import { stopZoom } from "./app/noZoom";
import { startTheme } from "./app/theme";
import { startSync } from "./sync/sync";
import "./styles.css";

// Styles that differ by game (card shapes, say) key off this.
document.documentElement.dataset.game = GAME;
stopZoom();
startTheme();
startSync();
void startGames();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
