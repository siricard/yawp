import React from "react";
import ReactTestRenderer from "react-test-renderer";

import type { Identity } from "../identity-context";
import {signingInput} from "../chat/dm-envelope";
import {bytesToB64Url} from "../identity/bundle";
import {didFromPubkey, fingerprintFromPubkey} from "../identity/did";

const mockSignDevice = jest.fn((bytes: Uint8Array) => new Uint8Array(64));

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
    signDevice: mockSignDevice,
  };
}

let mockMetadata: {
  acceptedPeers: string[];
  profileVersion: number;
  publishedProfile: { anchors: string[] };
  readReceiptsEnabled?: boolean;
  peerVerification?: Array<Record<string, unknown>>;
} = {
  acceptedPeers: ["did:yawp:bob", "did:yawp:carol"],
  profileVersion: 1,
  publishedProfile: { anchors: ["localhost:4000"] },
};
const servers = [{url: "localhost:4000", label: "Local"}];
let anchorInbox: ((event: unknown) => void) | undefined;
let anchorDeliveryState: ((event: unknown) => void) | undefined;
let serverScreenProps: Record<string, unknown> | undefined;
const mockEmitReadMarker = jest.fn();
const mockFetch = jest.fn();

jest.mock("../session", () => ({
  getValidSessionToken: async () => ({ ok: true, sessionToken: "session" }),
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
    mutate: async (updater: (metadata: typeof mockMetadata) => typeof mockMetadata) => {
      mockMetadata = updater(mockMetadata);
    },
  }),
  useOptionalBundleMetadata: () => ({
    metadata: mockMetadata,
    ready: true,
    mutate: async (updater: (metadata: typeof mockMetadata) => typeof mockMetadata) => {
      mockMetadata = updater(mockMetadata);
    },
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
    onDeliveryState,
  }: {
    children: unknown;
    onInbox?: (event: unknown) => void;
    onDeliveryState?: (event: unknown) => void;
  }) => {
    anchorInbox = onInbox;
    anchorDeliveryState = onDeliveryState;
    return children;
  },
  useAnchorStatus: () => ({
    status: "connected",
    degraded: false,
    emitReadMarker: mockEmitReadMarker,
  }),
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
      profileVersion: 1,
      publishedProfile: { anchors: ["localhost:4000"] },
    };
    anchorInbox = undefined;
    anchorDeliveryState = undefined;
    serverScreenProps = undefined;
    mockSignDevice.mockClear();
    mockEmitReadMarker.mockClear();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/dm/submit")) {
        return {
          ok: true,
          json: async () => ({ status: "accepted", deliveries: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { did: "did:yawp:alice" } }),
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;
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
      profileVersion: 1,
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

  test("pressing send posts a signed direct-message envelope to the sender anchor", async () => {
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
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("signed over the wire");
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });
    await flush();

    const submitCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/dm/submit"),
    );
    expect(submitCall).toBeTruthy();
    expect(submitCall?.[0]).toBe("http://localhost:4000/api/dm/submit");
    expect(submitCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session",
          "Content-Type": "application/json",
        }),
      }),
    );
    const {envelope} = JSON.parse((submitCall?.[1] as RequestInit).body as string);
    expect(envelope).toEqual(
      expect.objectContaining({
        sender_did: "did:yawp:alice",
        signed_by: "fake-device-id",
        sender_anchors: ["localhost:4000"],
        sender_profile_version: 1,
        recipient_dids: ["did:yawp:bob"],
        body: "signed over the wire",
        attachments: [],
        reply_to: null,
        mentions: [],
      }),
    );
    expect(envelope.sender_signature).toBe(
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(mockSignDevice).toHaveBeenCalledWith(signingInput(envelope));

    ReactTestRenderer.act(() => root.unmount());
  });

  test("starts a first direct message to a typed DID outside accepted peers", async () => {
    mockMetadata = {
      acceptedPeers: ["did:yawp:bob"],
      profileVersion: 1,
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
        .findByProps({ testID: "dm-manual-did-input" })
        .props.onChangeText("did:yawp:dave");
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-manual-did-add-button" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("hello dave");
    });

    expect(root.root.findByProps({ testID: "dm-selected-peer-did:yawp:dave" })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });
    await flush();

    const submitCall = mockFetch.mock.calls.find(call => {
      const body = (call[1] as RequestInit | undefined)?.body;
      return typeof body === "string" && body.includes("did:yawp:dave");
    });
    expect(submitCall).toBeTruthy();
    const {envelope} = JSON.parse((submitCall?.[1] as RequestInit).body as string);
    expect(envelope.recipient_dids).toEqual(["did:yawp:dave"]);
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:dave" })).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test("appends the second group message without recreating the conversation", async () => {
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
        .props.onChangeText("first message");
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("second message");
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
    expect(bodyText).toContain("first message");
    expect(bodyText).toContain("second message");

    ReactTestRenderer.act(() => root.unmount());
  });

  test("starts a new group direct message from a non-empty direct-message list", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "existing-dm-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-existing",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "existing message",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    expect(root.root.findAllByProps({ testID: "dm-conversation-conversation-existing" }).length).toBeGreaterThan(0);

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-new-group-button" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findByProps({ testID: "dm-peer-toggle-did:yawp:carol" })
        .props.onPress();
      root.root
        .findByProps({ testID: "dm-composer-input" })
        .props.onChangeText("new thread");
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "dm-send-button" }).props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:carol" })).toBeTruthy();
    const bodyText = root.root
      .findAllByType(require("react-native").Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(" ");
    expect(bodyText).toContain("new thread");

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

  test("maps inbound envelope attachments into the real direct-message route", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-attachment-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-bob-alice-attachment",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "image",
          attachments: [{
            upload_id: "up-1",
            content_hash: "7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c",
            mime: "image/png",
            size: 16,
            download_url: "https://anchor.example/api/downloads/up-1?sig=s&exp=1",
          }],
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findAllByProps({ testID: "dm-conversation-conversation-bob-alice-attachment" })[0]
        .props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-attachment-inbox-attachment-1-0" })).toBeTruthy();

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

    expect(mockFetch).toHaveBeenCalledWith(
      "/rpc/run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session",
          "Content-Type": "application/json",
        }),
      }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody).toEqual({
      action: "accept_peer_request",
      identity: { did: "did:yawp:alice" },
      input: { peerDid: "did:yawp:eve" },
      fields: ["did"],
    });
    expect(root.root.findAllByProps({ testID: "dm-message-request-card" })).toHaveLength(0);
    expect(root.root.findByProps({ testID: "dm-composer-input" })).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test("merges delivery state updates into live direct messages", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-state-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-bob-alice-state",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "stateful",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findAllByProps({ testID: "dm-conversation-conversation-bob-alice-state" })[0]
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      anchorDeliveryState?.({
        envelope_id: "inbox-state-1",
        recipient_did: "did:yawp:alice",
        state: "read",
      });
    });

    expect(
      root.root.findByProps({ testID: "dm-delivery-indicator-inbox-state-1" }).props.children,
    ).toEqual(["✓✓", " ", "Read"]);

    ReactTestRenderer.act(() => root.unmount());
  });

  test("renders an inbound sender by their resolved display name, not the raw DID", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    const senderDid =
      "did:yawp:" + "z".repeat(40);

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-name-1",
        inbox_serial: 1,
        is_request: false,
        sender_display_name: "Bob Sender",
        envelope: {
          sender_did: senderDid,
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-named",
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
        .findAllByProps({ testID: "dm-conversation-conversation-named" })[0]
        .props.onPress();
    });

    expect(
      root.root.findByProps({ testID: `dm-participant-${senderDid}` }),
    ).toBeTruthy();
    const text = root.root
      .findAllByType(require("react-native").Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(" ");
    expect(text).toContain("Bob Sender");
    expect(text).not.toContain(senderDid);

    ReactTestRenderer.act(() => root.unmount());
  });

  test("falls back to the yp: fingerprint when no display name resolves", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    const {didFromPubkey, fingerprintFromDid} = require("../identity/did");
    const senderDid = didFromPubkey(new Uint8Array(32).fill(9));
    const expectedFingerprint = fingerprintFromDid(senderDid);

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-fp-1",
        inbox_serial: 1,
        is_request: false,
        sender_display_name: null,
        envelope: {
          sender_did: senderDid,
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-fp",
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
        .findAllByProps({ testID: "dm-conversation-conversation-fp" })[0]
        .props.onPress();
    });

    const text = root.root
      .findAllByType(require("react-native").Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(" ");
    expect(text).toContain(expectedFingerprint);
    expect(text).not.toContain(senderDid);

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
      { id: "conversation-bob-alice", label: "bob, alice" },
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

  test("renders inbound group DM participants and attributes recipient replies", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-group-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          recipient_dids: ["did:yawp:alice", "did:yawp:carol"],
          conversation_id: "conversation-alice-bob-carol",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "hello group",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findAllByProps({ testID: "dm-conversation-conversation-alice-bob-carol" })[0]
        .props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:bob" })).toBeTruthy();
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:alice" })).toBeTruthy();
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:carol" })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-group-2",
        inbox_serial: 2,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:carol",
          recipient_dids: ["did:yawp:alice", "did:yawp:bob"],
          conversation_id: "conversation-alice-bob-carol",
          timestamp: "2026-06-05T00:01:00.000Z",
          body: "reply from carol",
        },
      });
    });

    expect(root.root.findByProps({ testID: "dm-message-inbox-group-2" })).toBeTruthy();
    expect(
      root.root.findByProps({ testID: "dm-message-sender-inbox-group-2" }).props.children,
    ).toBe("carol");
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:bob" })).toBeTruthy();
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:alice" })).toBeTruthy();
    expect(root.root.findByProps({ testID: "dm-participant-did:yawp:carol" })).toBeTruthy();

    ReactTestRenderer.act(() => root.unmount());
  });

  test("marks verified peers as key changed from the real inbox event sender public key", async () => {
    const oldPk = new Uint8Array(32).fill(12);
    const newPk = new Uint8Array(32).fill(13);
    const did = didFromPubkey(oldPk);
    mockMetadata = {
      acceptedPeers: [did],
      profileVersion: 1,
      publishedProfile: { anchors: ["localhost:4000"] },
      peerVerification: [
        {
          peer_did: did,
          status: "verified",
          fingerprint_at_verification: fingerprintFromPubkey(oldPk),
          verified_at: "now",
        },
      ],
    };
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-key-change-1",
        inbox_serial: 1,
        is_request: false,
        sender_public_key: bytesToB64Url(newPk),
        envelope: {
          sender_did: did,
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-key-change",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "new master key",
        },
      });
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      root.root.findAllByProps({ testID: "dm-conversation-conversation-key-change" })[0].props.onPress();
    });

    expect(root.root.findByProps({ testID: "dm-key-changed-banner" })).toBeTruthy();
    expect(mockMetadata.peerVerification?.[0]).toEqual(
      expect.objectContaining({peer_did: did, status: "key_changed"}),
    );

    ReactTestRenderer.act(() => root.unmount());
  });

  // BUG B regression: opening a delivered inbound message emits a signed
  // read_marker on the reader's user socket, addressed back to the original
  // sender's anchor, so the sender's read state can advance.
  test("opening a delivered inbound message emits a read_marker to the sender anchor", async () => {
    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-read-1",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          sender_anchors: ["localhost:4100"],
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-read",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "did you read this?",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findAllByProps({ testID: "dm-conversation-conversation-read" })[0]
        .props.onPress();
    });
    await flush();

    expect(mockEmitReadMarker).toHaveBeenCalledTimes(1);
    expect(mockEmitReadMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "conversation-read",
        last_read_envelope_id: "inbox-read-1",
        sender_anchor: "localhost:4100",
        sender_did: "did:yawp:alice",
        signed_by: "fake-device-id",
      }),
    );

    ReactTestRenderer.act(() => root.unmount());
  });

  test("does not emit a read_marker when read receipts are disabled", async () => {
    mockMetadata = {
      acceptedPeers: ["did:yawp:bob"],
      profileVersion: 1,
      publishedProfile: { anchors: ["localhost:4000"] },
      readReceiptsEnabled: false,
    };

    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(<App />);
    });
    await flush();

    await ReactTestRenderer.act(async () => {
      anchorInbox?.({
        envelope_id: "inbox-read-2",
        inbox_serial: 1,
        is_request: false,
        envelope: {
          sender_did: "did:yawp:bob",
          sender_anchors: ["localhost:4100"],
          recipient_dids: ["did:yawp:alice"],
          conversation_id: "conversation-read-off",
          timestamp: "2026-06-05T00:00:00.000Z",
          body: "secretly read",
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      root.root.findByProps({ testID: "workspace-dm-tile" }).props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      root.root
        .findAllByProps({ testID: "dm-conversation-conversation-read-off" })[0]
        .props.onPress();
    });
    await flush();

    expect(mockEmitReadMarker).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => root.unmount());
  });
});
