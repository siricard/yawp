import React from "react";
import { createRoot } from "react-dom/client";
import type { ActionConfig } from "./ash_generated";
import { IdentityProvider } from "./identity-context";
import { DidScreen } from "./DidScreen";

const _ashTypecheckProbe: ActionConfig = {};
void _ashTypecheckProbe;

function App() {
  return (
    <IdentityProvider>
      <DidScreen />
    </IdentityProvider>
  );
}

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
