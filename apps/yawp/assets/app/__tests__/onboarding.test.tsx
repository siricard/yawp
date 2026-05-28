/**
 * Onboarding ceremony tests.
 *
 * Covers:
 * - Mnemonic screen renders 12 word slots.
 * - The 5-second countdown blocks the confirm button.
 * - The verify step accepts the right 3 words and rejects wrong ones.
 * - Failing twice does not regenerate the mnemonic.
 * - No network request is made during the ceremony.
 * - Completing onboarding persists the bundle to storage.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {clearIdentity} from '../identity';
import {loadIdentity} from '../identity/storage-bundle';
import {
  IdentityProvider,
  useIdentityState,
} from '../identity-context';
import {
  COUNTDOWN_SECONDS,
  OnboardingMnemonicScreen,
} from '../screens/OnboardingMnemonicScreen';

function findByTestId(
  tree: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  return tree.findByProps({testID});
}

const SAMPLE_MNEMONIC = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
];

describe('OnboardingMnemonicScreen', () => {
  let now = 0;
  beforeEach(() => {
    jest.useFakeTimers();
    now = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders 12 word slots', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <OnboardingMnemonicScreen
          mnemonic={SAMPLE_MNEMONIC}
          onVerified={() => {}}
          pickPositions={() => [0, 1, 2]}
        />,
      );
    });
    const tree = root!.root;
    for (let i = 0; i < 12; i++) {
      expect(findByTestId(tree, `mnemonic-word-${i}`)).toBeTruthy();
    }
  });

  test('5-second countdown blocks the confirm button', async () => {
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <OnboardingMnemonicScreen
          mnemonic={SAMPLE_MNEMONIC}
          onVerified={() => {}}
          pickPositions={() => [0, 1, 2]}
        />,
      );
    });
    const tree = root!.root;
    const btn = findByTestId(tree, 'mnemonic-confirm-btn');
    expect(btn.props.accessibilityState.disabled).toBe(true);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(
      findByTestId(tree, 'mnemonic-confirm-btn').props.accessibilityState
        .disabled,
    ).toBe(true);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(
      findByTestId(tree, 'mnemonic-confirm-btn').props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  test('verify accepts the right words and calls onVerified', async () => {
    const onVerified = jest.fn();
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <OnboardingMnemonicScreen
          mnemonic={SAMPLE_MNEMONIC}
          onVerified={onVerified}
          pickPositions={() => [2, 5, 9]}
        />,
      );
    });
    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(COUNTDOWN_SECONDS * 1000);
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'mnemonic-confirm-btn').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-input-0').props.onChangeText('able');
      findByTestId(tree, 'verify-input-1').props.onChangeText('absent');
      findByTestId(tree, 'verify-input-2').props.onChangeText('abuse');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-submit-btn').props.onPress();
    });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  test('verify rejects wrong words, fails twice without regenerating mnemonic', async () => {
    const onVerified = jest.fn();
    let callIdx = 0;
    const pick = () => (callIdx++ === 0 ? [0, 1, 2] : [3, 4, 5]);
    let root: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        <OnboardingMnemonicScreen
          mnemonic={SAMPLE_MNEMONIC}
          onVerified={onVerified}
          pickPositions={pick}
        />,
      );
    });
    const tree = root!.root;
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(COUNTDOWN_SECONDS * 1000);
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'mnemonic-confirm-btn').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-input-0').props.onChangeText('wrong');
      findByTestId(tree, 'verify-input-1').props.onChangeText('words');
      findByTestId(tree, 'verify-input-2').props.onChangeText('here');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-submit-btn').props.onPress();
    });
    expect(onVerified).not.toHaveBeenCalled();
    expect(findByTestId(tree, 'verify-error')).toBeTruthy();
    expect(findByTestId(tree, 'verify-input-0').props.value).toBe('');
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-input-0').props.onChangeText('still');
      findByTestId(tree, 'verify-input-1').props.onChangeText('wrong');
      findByTestId(tree, 'verify-input-2').props.onChangeText('words');
    });
    await ReactTestRenderer.act(async () => {
      findByTestId(tree, 'verify-submit-btn').props.onPress();
    });
    expect(onVerified).not.toHaveBeenCalled();
  });
});

describe('Onboarding ceremony (IdentityProvider)', () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  test('first-run enters onboarding state with a draft identity; nothing is persisted yet', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        throw new Error('fetch should never be called during onboarding');
      });

    let observed: ReturnType<typeof useIdentityState> | null = null;
    function Probe() {
      observed = useIdentityState();
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
    for (let i = 0; i < 5; i++) {
      await ReactTestRenderer.act(async () => {
        await Promise.resolve();
      });
    }

    const s = observed!;
    expect(s.status).toBe('onboarding');
    if (s.status === 'onboarding') {
      expect(s.step).toBe('choose_path');
      expect(s.draftIdentity.mnemonic).toHaveLength(12);
      expect(s.draftIdentity.masterPk.length).toBe(32);
    }
    const persisted = await loadIdentity();
    expect(persisted).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    root!.unmount();
  });

  test('completeOnboarding persists the draft bundle and transitions to ready; no fetch fires', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => {
        throw new Error('fetch should never be called during onboarding');
      });

    let observed: ReturnType<typeof useIdentityState> | null = null;
    let runComplete:
      | ((opts: {passphrase: string | null; displayName: string}) => Promise<void>)
      | null = null;
    let runFinish: (() => void) | null = null;

    function Probe() {
      observed = useIdentityState();
      const {complete, finish} =
        require('../identity-context').useOnboarding();
      runComplete = complete;
      runFinish = finish;
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
    for (let i = 0; i < 5; i++) {
      await ReactTestRenderer.act(async () => {
        await Promise.resolve();
      });
    }
    expect(observed!.status).toBe('onboarding');

    await ReactTestRenderer.act(async () => {
      await runComplete!({passphrase: null, displayName: 'Test Yawper'});
    });
    const s2 = observed!;
    expect(s2.status).toBe('onboarding');
    if (s2.status === 'onboarding') {
      expect(s2.step).toBe('complete');
    }
    await ReactTestRenderer.act(async () => {
      runFinish!();
    });
    expect(observed!.status).toBe('ready');

    const persisted = await loadIdentity();
    expect(persisted).not.toBeNull();
    expect(persisted!.version).toBe(1);
    expect(persisted!.device.deviceId.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    root!.unmount();
  });
});
