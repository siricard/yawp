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

let mockMetadata = {
  acceptedPeers: ["did:yawp:bob", "did:yawp:carol"],
  publishedProfile: { anchors: ["localhost:4000"] },
};
const servers = [{url: "localhost:4000", label: "Local"}];
let anchorInbox: ((event: unknown) => void) | undefined;
let serverScreenProps: Record<string, unknown> | undefined;
const mockAcceptPeerRequest: jest.Mock<Promise<unknown>, [unknown]> = jest.fn(async (_config: unknown) => ({
  success: true,
  data: { did: "did:yawp:alice" },
}));

jest.mock("../ash_generated", () => ({
  acceptPeerRequest: (config: unknown) => mockAcceptPeerRequest(config),
}));

jest.mock("../session", () => ({
  getValidSessionToken: async () => ({ ok: true, token: "session" }),
}));

jest.mock("../chat/discover", () => ({
  discoverGeneralChannel: async () => ({
    id: "channel-general",
    name: "general",
    serverId: "server-local",
  }),
}));

jest.mock("../identity-context", () => ({
  IdentityProvider: ({ children }: { children: unknown }) => children,
  useIdentityState: () => ({
    status: "ready",
    identity: mockFakeIdentity(),
    error: null,
  }),
  useWorkspaceServers: () => ({
    servers,
    removeServer: jest.fn(),
    reorderServers: jest.fn(),
    setServerUnread: jest.fn(),
  }),
  useDisplayName: () => ({
    displayName: null,
    setDisplayNameOverride: async () => {},
    effectiveDisplayName: "Alice",
  }),
  useBundleMetadata: () => ({
    metadata: mockMetadata,
    ready: true,
    mutate: async () => undefined,
  }),
  useOptionalBundleMetadata: () => ({
    metadata: mockMetadata,
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
  AnchorConnectionProvider: ({
    children,
    onInbox,
  }: {
    children: unknown;
    onInbox?: (event: unknown) => void;
  }) => {
    anchorInbox = onInbox;
    return children;
  },
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
  ServerScreen: (props: Record<string, unknown>) => {
    const ReactModule = require("react");
    const { Pressable, Text, View } = require("react-native");
    serverScreenProps = props;
    return ReactModule.createElement(
      View,
      { testID: "server-screen-mock" },
      ReactModule.createElement(
        Pressable,
        {
          testID: "server-open-dm-list",
          onPress: props.onOpenDmList,
        },
        ReactModule.createElement(Text, null, "open"),
      ),
    );
  },
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
  beforeEach(() => {
    mockMetadata = {
      acceptedPeers: ["did:yawp:bob", "did:yawp:carol"],
      publishedProfile: { anchors: ["localhost:4000"] },
    };
    anchorInbox = undefined;
    serverScreenProps = undefined;
    mockAcceptPeerRequest.mockClear();
  });

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

  test("rejects sending a new direct message when no peers are available", async () => {
    mockMetadata = {
      acceptedPeers: [],
      publishedProfile: { anchors: ["localhost:4000"] },
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("hello nobody");
    });

    expect(
      root.root.findByProps({ testID: "dm-send-button" }).props.disabled
    ).toBe(true);

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });

    expect(root.root.findAllByProps({ testID: "dm-message-list" })).toHaveLength(0);

    ReactTestRenderer.act(() => root.unmount());
  });

  test("starts a group direct message and keeps the first message visible", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-peer-toggle-did:yawp:bob" })
        .props.onPress();
      root.root
        .findByProps({ testID: "dm-peer-toggle-did:yawp:carol" })
        .props.onPress();
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("hello group");
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:bob" })).toBeTruthy();
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:carol" })).toBeTruthy();
    const bodyText = root.root
      .findAllByType(require("react-native").Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(" ");
    expect(bodyText).toContain("hello group");

    ReactTestRenderer.act(() => root.unmount());
  });

  test("renders inbound request events in the real direct-message route", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-request-1",
        inbox_serial: 1,
        is_request: true,
        envelope: {
          sender_did: "did:yawp:eve",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-eve-alice",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "hello",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-section-message requests" })).toBeTruthy();
    expect(
      root.root.findByProps({ testID: "dm-conversation-conversation-eve-alice" })
    ).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test("accepts an inbound request through the app route and moves it to the inbox", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-request-2",
        inbox_serial: 1,
        is_request: true,
        envelope: {
          sender_did: "did:yawp:eve",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-eve-alice-2",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "hello",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-conversation-conversation-eve-alice-2" })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      await root.root.findByProps({ testID: "dm-accept-request-button" }).props.onPress();
    });

    expect(mockAcceptPeerRequest).toHaveBeenCalledWith({
      identity: { did: "did:yawp:alice" },
      input: { peerDid: "did:yawp:eve" },
      fields: ["did"],
    });
    expect(root.root.findAllByProps({ testID: "dm-message-request-card" })).toHaveLength(0);
    expect(root.root.findByProps({ testID: "dm-composer-input" })).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test("wires live conversations into the channel tab row and opens recent DMs in place", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "workspace-tile-localhost:4000" })
        .props.onPress();
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-recent-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-bob-alice",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "hello from bob",
        },
      });
    });

    expect(serverScreenProps?.recentDms).toEqual([
      { id: "conversation-bob-alice", label: "bob" },
    ]);

    await ReactTestRenderer.act(async () => {
      (serverScreenProps?.onSelectRecentDm as (dm: { id: string; label: string }) => void)?.({
        id: "conversation-bob-alice",
        label: "bob",
      });
    });

    expect(root.root.findByProps({ testID: "dm-message-inbox-recent-1" })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-recent-2",
        inbox_serial: 2,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-bob-alice",
          timestamp: "2026-06-05T00:01:00.000Z",
          body: "live update",
        },
      });
    });

    expect(root.root.findByProps({ testID: "dm-message-inbox-recent-2" })).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });
});
