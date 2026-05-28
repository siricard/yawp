/**
 * Restore-from-mnemonic flow tests.
 *
 * Covers:
 * - Restore with a valid 12-word vector produces the DID expected from
 * the deterministic BIP-39 → master-seed pipeline.
 * - Restore with an invalid checksum surfaces an error and does NOT
 * persist anything (the auto-generated draft is left untouched on
 * disk: not persisted).
 * - Restoring REPLACES a previously auto-generated identity in storage.
 * - The recovery path makes no network calls (fetch mocked to throw).
 * - The RestoreMnemonicScreen renders 12 inputs with autocomplete and
 * blocks Restore until every word is filled.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {clearIdentity} from '../identity';
import {mnemonicToSeed} from '../identity/bip39';
import {didFromPubkey} from '../identity/did';
import {masterFromMnemonicSeed} from '../identity/master';
import {b64UrlToBytes} from '../identity/bundle';
import {loadIdentity} from '../identity/storage-bundle';
import {
  IdentityProvider,
  useIdentityState,
  useOnboarding,
} from '../identity-context';
import {RestoreMnemonicScreen} from '../screens/RestoreMnemonicScreen';

type RestoreResult =
  | {ok: true}
  | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'};

const VALID_MNEMONIC = [
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'about',
];

const BAD_CHECKSUM_MNEMONIC = Array(12).fill('abandon');

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

function expectedDidFromMnemonic(words: string[]): string {
  const seed = mnemonicToSeed(words);
  const master = masterFromMnemonicSeed(seed);
  return didFromPubkey(master.pk);
}

async function pumpEffects() {
  for (let i = 0; i < 5; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

describe('RestoreMnemonicScreen', () => {
  test('renders 12 inputs and blocks Restore until all are filled', async () => {
    const onRestore = jest.fn(async () => ({ok: true as const}));
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <RestoreMnemonicScreen
          onRestore={onRestore}
          onCancel={() => {}}
        />,
      );
    });
    const tree = root!.root;
    for (let i = 0; i < 12; i++) {
      expect(findByTestId(tree, `restore-input-${i}`)).toBeTruthy();
    }
    expect(
      findByTestId(tree, 'restore-submit-btn').props.accessibilityState
        .disabled,
    ).toBe(true);
    await ReactTestRenderer.act(async () => {
      const submit = findByTestId(tree, 'restore-submit-btn');
      if (!submit.props.disabled) {
        submit.props.onPress();
      }
    });
    expect(onRestore).not.toHaveBeenCalled();
  });

  test('typing in an input surfaces wordlist suggestions; tapping one fills the input', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <RestoreMnemonicScreen
          onRestore={async () => ({ok: true as const})}
          onCancel={() => {}}
        />,
      );
    });
    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      const input = findByTestId(tree, 'restore-input-0');
      input.props.onFocus();
      input.props.onChangeText('aba');
    });
    const suggestion = findByTestId(tree, 'restore-suggestion-0-abandon');
    expect(suggestion).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      suggestion.props.onPress();
    });
    expect(findByTestId(tree, 'restore-input-0').props.value).toBe('abandon');
  });

  test('shows an error if onRestore returns bad_checksum', async () => {
    const onRestore = jest.fn(async () => ({
      ok: false as const,
      reason: 'bad_checksum' as const,
    }));
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <RestoreMnemonicScreen
          onRestore={onRestore}
          onCancel={() => {}}
        />,
      );
    });
    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      for (let i = 0; i < 12; i++) {
        findByTestId(tree, `restore-input-${i}`).props.onChangeText(
          BAD_CHECKSUM_MNEMONIC[i],
        );
      }
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'restore-submit-btn').props.onPress();
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(findByTestId(tree, 'restore-error')).toBeTruthy();
  });
});

describe('restoreFromMnemonic (IdentityProvider)', () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  test('valid mnemonic produces the expected DID and persists the bundle', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        throw new Error('fetch should never be called during recovery');
      });

    let observed: ReturnType<typeof useIdentityState> | null = null;
    let runRestore:
      | ((words: string[]) => Promise<
          | {ok: true}
          | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'}
        >)
      | null = null;

    function Probe() {
      observed = useIdentityState();
      const {restore} = useOnboarding();
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await pumpEffects();
    expect(observed!.status).toBe('onboarding');

    let result: RestoreResult | null = null;
    await ReactTestRenderer.act(async () => {
      result = await runRestore!(VALID_MNEMONIC);
    });
    expect(result).toEqual({ok: true});
    const sR1 = observed!;
    expect(sR1.status).toBe('ready');
    if (sR1.status === 'ready') {
      expect(sR1.identity.didFull).toBe(
        expectedDidFromMnemonic(VALID_MNEMONIC),
      );
    }

    const persisted = await loadIdentity();
    expect(persisted).not.toBeNull();
    expect(persisted!.version).toBe(1);

    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    root!.unmount();
  });

  test('invalid checksum returns an error and does NOT persist anything', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        throw new Error('fetch should never be called during recovery');
      });

    let runRestore:
      | ((words: string[]) => Promise<
          | {ok: true}
          | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'}
        >)
      | null = null;
    let observed: ReturnType<typeof useIdentityState> | null = null;

    function Probe() {
      observed = useIdentityState();
      const {restore} = useOnboarding();
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await pumpEffects();

    let result: RestoreResult | null = null;
    await ReactTestRenderer.act(async () => {
      result = await runRestore!(BAD_CHECKSUM_MNEMONIC);
    });
    expect(result).toEqual({ok: false, reason: 'bad_checksum'});
    expect(observed!.status).toBe('onboarding');
    const persisted = await loadIdentity();
    expect(persisted).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    root!.unmount();
  });

  test('wrong word count surfaces wrong_word_count', async () => {
    let runRestore:
      | ((words: string[]) => Promise<
          | {ok: true}
          | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'}
        >)
      | null = null;

    function Probe() {
      const {restore} = useOnboarding();
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await pumpEffects();

    let result: RestoreResult | null = null;
    await ReactTestRenderer.act(async () => {
      result = await runRestore!(['abandon', 'abandon']);
    });
    expect(result).toEqual({ok: false, reason: 'wrong_word_count'});

    root!.unmount();
  });

  test('unknown word surfaces unknown_word', async () => {
    let runRestore:
      | ((words: string[]) => Promise<
          | {ok: true}
          | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'}
        >)
      | null = null;

    function Probe() {
      const {restore} = useOnboarding();
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await pumpEffects();

    let result: RestoreResult | null = null;
    const bad = [...VALID_MNEMONIC];
    bad[0] = 'notaword';
    await ReactTestRenderer.act(async () => {
      result = await runRestore!(bad);
    });
    expect(result).toEqual({ok: false, reason: 'unknown_word'});

    root!.unmount();
  });

  test('restoring REPLACES a previously auto-generated identity in storage', async () => {
    const {loadOrCreateIdentity} = require('../identity-context');
    const previous = await loadOrCreateIdentity();
    const previousBundle = await loadIdentity();
    expect(previousBundle).not.toBeNull();

    let observed: ReturnType<typeof useIdentityState> | null = null;
    let runRestore:
      | ((words: string[]) => Promise<
          | {ok: true}
          | {ok: false; reason: 'wrong_word_count' | 'unknown_word' | 'bad_checksum'}
        >)
      | null = null;

    function Probe() {
      observed = useIdentityState();
      const {restore} = useOnboarding();
      runRestore = restore;
      return null;
    }

    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <IdentityProvider>
          <Probe />
        </IdentityProvider>,
      );
    });
    await pumpEffects();
    const sR2 = observed!;
    expect(sR2.status).toBe('ready');
    if (sR2.status === 'ready') {
      expect(sR2.identity.didFull).toBe(`did:yawp:${previous.did}`);
    }

    await ReactTestRenderer.act(async () => {
      const result = await runRestore!(VALID_MNEMONIC);
      expect(result).toEqual({ok: true});
    });

    const after = await loadIdentity();
    expect(after).not.toBeNull();
    const restoredMasterSk = b64UrlToBytes(after!.master.sk);
    const restoredMaster = masterFromMnemonicSeed(
      mnemonicToSeed(VALID_MNEMONIC),
    );
    expect(Array.from(restoredMasterSk)).toEqual(
      Array.from(restoredMaster.sk),
    );
    const sR3 = observed!;
    if (sR3.status === 'ready') {
      expect(sR3.identity.didFull).toBe(
        expectedDidFromMnemonic(VALID_MNEMONIC),
      );
    }
    expect(after!.device.deviceId).not.toBe(previousBundle!.device.deviceId);

    root!.unmount();
  });
});
