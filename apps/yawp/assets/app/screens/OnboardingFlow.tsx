
import React, {useMemo, useState} from 'react';

import {useIdentityState, useOnboarding} from '../identity-context';
import {OnboardingChoiceScreen} from './OnboardingChoiceScreen';
import {OnboardingCompleteScreen} from './OnboardingCompleteScreen';
import {OnboardingDisplayNameScreen} from './OnboardingDisplayNameScreen';
import {OnboardingMnemonicScreen} from './OnboardingMnemonicScreen';
import {OnboardingPassphraseScreen} from './OnboardingPassphraseScreen';
import {RestoreMnemonicScreen} from './RestoreMnemonicScreen';
import {fingerprintFromPubkey} from '../identity/did';
import {defaultDisplayName} from '../identity/word-pair';

type Props = {
  /** Called when the user clicks "Go to home" on the complete screen. */
  onDone: () => void;
  /**
   * Override of the default display name. Defaults to the
   * deterministic word-pair derivation (`defaultDisplayName`).
   */
  defaultDisplayNameFor?: (masterPk: Uint8Array) => string;
};

export function OnboardingFlow({
  onDone,
  defaultDisplayNameFor = defaultDisplayName,
}: Props) {
  const state = useIdentityState();
  const {advance, complete, finish, restore} = useOnboarding();
  const [pendingPassphrase, setPendingPassphrase] = useState<string | null>(null);
  const [chosenOverride, setChosenOverride] = useState<string | null>(null);

  const defaultName = useMemo(() => {
    if (state.status !== 'onboarding') return '';
    return defaultDisplayNameFor(state.draftIdentity.masterPk);
  }, [state, defaultDisplayNameFor]);

  if (state.status !== 'onboarding') {
    return null;
  }

  switch (state.step) {
    case 'choose_path':
      return (
        <OnboardingChoiceScreen
          onCreate={() => advance('mnemonic')}
          onRestore={() => advance('restore')}
        />
      );
    case 'restore':
      return (
        <RestoreMnemonicScreen
          onRestore={restore}
          onCancel={() => advance('choose_path')}
        />
      );
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
          error={state.error}
          onSubmit={async override => {
            setChosenOverride(override);
            await complete({
              passphrase: pendingPassphrase,
              displayName: override,
            });
          }}
        />
      );
    case 'complete':
      return (
        <OnboardingCompleteScreen
          displayName={chosenOverride ?? defaultName}
          fingerprint={fingerprintFromPubkey(state.draftIdentity.masterPk)}
          onGoHome={() => {
            finish();
            onDone();
          }}
        />
      );
  }
}
