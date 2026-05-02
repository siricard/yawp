
import React, {useMemo, useState} from 'react';

import {useIdentityState, useOnboarding} from '../identity-context';
import {OnboardingCompleteScreen} from './OnboardingCompleteScreen';
import {OnboardingDisplayNameScreen} from './OnboardingDisplayNameScreen';
import {OnboardingMnemonicScreen} from './OnboardingMnemonicScreen';
import {OnboardingPassphraseScreen} from './OnboardingPassphraseScreen';
import {fingerprintFromPubkey} from '../identity/did';

type Props = {
  /** Called when the user clicks "Go to home" on the complete screen. */
  onDone: () => void;
  /**
   * Override of the default display name. will land a deterministic
   * word-pair derivation; for we just show a stable placeholder
   * derived from the master fingerprint so onboarding is self-contained.
   */
  defaultDisplayNameFor?: (masterPk: Uint8Array) => string;
};

function placeholderDisplayName(masterPk: Uint8Array): string {
  const fp = fingerprintFromPubkey(masterPk);
  const m = fp.match(/^yp:([0-9a-f]{4})/);
  return m ? `Yawp ${m[1]}` : 'New User';
}

export function OnboardingFlow({
  onDone,
  defaultDisplayNameFor = placeholderDisplayName,
}: Props) {
  const state = useIdentityState();
  const {advance, complete, finish} = useOnboarding();
  const [pendingPassphrase, setPendingPassphrase] = useState<string | null>(null);

  const defaultName = useMemo(() => {
    if (state.status !== 'onboarding') return '';
    return defaultDisplayNameFor(state.draftIdentity.masterPk);
  }, [state, defaultDisplayNameFor]);

  if (state.status !== 'onboarding') {
    return null;
  }

  switch (state.step) {
    case 'mnemonic':
      return (
        <OnboardingMnemonicScreen
          mnemonic={state.draftIdentity.mnemonic}
          onVerified={() => advance('passphrase')}
        />
      );
    case 'passphrase':
      return (
        <OnboardingPassphraseScreen
          onSubmit={({passphrase}) => {
            setPendingPassphrase(passphrase);
            advance('display_name');
          }}
        />
      );
    case 'display_name':
      return (
        <OnboardingDisplayNameScreen
          defaultDisplayName={defaultName}
          onSubmit={async chosenName => {
            await complete({
              passphrase: pendingPassphrase,
              displayName: chosenName,
            });
          }}
        />
      );
    case 'complete':
      return (
        <OnboardingCompleteScreen
          displayName={defaultName}
          fingerprint={fingerprintFromPubkey(state.draftIdentity.masterPk)}
          onGoHome={() => {
            finish();
            onDone();
          }}
        />
      );
  }
}
