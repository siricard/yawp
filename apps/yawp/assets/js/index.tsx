
import React from "react";
import {createRoot} from "react-dom/client";
import {AppRegistry} from "react-native";

import App from "../app/App";
import type {ActionConfig} from "../app/ash_generated";

const _ashTypecheckProbe: ActionConfig = {};
void _ashTypecheckProbe;

const APP_NAME = "YawpWeb";

AppRegistry.registerComponent(APP_NAME, () => App);

const container = document.getElementById("app");
if (!container) {
  throw new Error('Yawp web entry: <div id="app"></div> not found');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
