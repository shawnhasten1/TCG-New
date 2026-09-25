import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { stopZoom } from "./app/noZoom";
import { startTheme } from "./app/theme";
import { startSync } from "./sync/sync";
import "./styles.css";

stopZoom();
startTheme();
startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
