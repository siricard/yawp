import React from "react";
import ReactTestRenderer from "react-test-renderer";

import type { Identity } from "../identity-context";

function mockFakeIdentity(): Identity {
  const stubBytes = new Uint8Array(32);
  const stubSig = new Uint8Array(64);
  return {
    did: "alice",
    didFull: "did:yawp:alice",
    masterPk: stubBytes,
    deviceId: "fake-device-id",
    devicePk: stubBytes,
    deviceDelegationSignature: stubSig,
    deviceIssuedAt: "2026-01-01T00:00:00.000Z",
    fingerprint: "yp:0000 · 0000 · 0000 · 0000",
    sign: () => stubSig,
    signDevice: () => stubSig,
  };
}

const metadata = {
  acceptedPeers: ["did:yawp:bob", "did:yawp:carol"],
  publishedProfile: { anchors: ["localhost:4000"] },
};

jest.mock("../identity-context", () => ({
  IdentityProvider: ({ children }: { children: unknown }) => children,
  useIdentityState: () => ({
    status: "ready",
    identity: mockFakeIdentity(),
    error: null,
  }),
  useWorkspaceServers: () => ({
    servers: [],
    removeServer: jest.fn(),
    reorderServers: jest.fn(),
  }),
  useDisplayName: () => ({
    displayName: null,
    setDisplayNameOverride: async () => {},
    effectiveDisplayName: "Alice",
  }),
  useBundleMetadata: () => ({
    metadata,
    ready: true,
    mutate: async () => undefined,
  }),
  useOptionalBundleMetadata: () => ({
    metadata,
    ready: true,
    mutate: async () => undefined,
  }),
  usePassphrase: () => ({
    sealed: false,
    unlock: async () => ({ ok: true }),
    changePassphrase: async () => ({ ok: true }),
  }),
}));

jest.mock("../chat/anchor-connection", () => ({
  AnchorConnectionProvider: ({ children }: { children: unknown }) => children,
  useAnchorStatus: () => ({ status: "connected", degraded: false }),
}));

jest.mock("../screens/HomeScreen", () => ({
  HomeScreen: () => null,
}));

jest.mock("../screens/VectorTestScreen", () => ({
  VectorTestScreen: () => null,
}));

jest.mock("../screens/AddServerScreen", () => ({
  AddServerScreen: () => null,
}));

jest.mock("../screens/AddAnchorScreen", () => ({
  AddAnchorScreen: () => null,
}));

jest.mock("../screens/PassphraseSettingsScreen", () => ({
  PassphraseSettingsScreen: () => null,
}));

jest.mock("../screens/ServerScreen", () => ({
  ServerScreen: () => null,
}));

import App from "../App";

async function flush() {
  for (let i = 0; i < 4; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

describe("App direct-message route", () => {
  test("opens the group peer picker and keeps send disabled until a peer is selected", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-peer-picker" })).toBeTruthy();
    expect(
      root.root.findByProps({ testID: "dm-peer-toggle-did:yawp:bob" })
    ).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("hello");
    });

    expect(
      root.root.findByProps({ testID: "dm-send-button" }).props.disabled
    ).toBe(true);

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-peer-toggle-did:yawp:bob" })
        .props.onPress();
    });

    expect(
      root.root.findByProps({ testID: "dm-send-button" }).props.disabled
    ).toBe(false);

    ReactTestRenderer.act(() => root.unmount());
  });
});
