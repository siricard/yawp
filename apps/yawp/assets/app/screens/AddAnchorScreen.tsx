import React, {useState} from 'react';
import {Text, View} from 'react-native';

import {submitAddAnchor} from '../add-anchor';
import {
  useBundleMetadata,
  useDisplayName,
  useIdentityState,
  useWorkspaceServers,
} from '../identity-context';
import {Banner, Button, Field, Input} from '../ui';

type Props = {
  onCancel: () => void;
  onAdded: () => void;
};

export function AddAnchorScreen({onCancel, onAdded}: Props) {
  const identityState = useIdentityState();
  const {servers} = useWorkspaceServers();
  const {effectiveDisplayName} = useDisplayName();
  const {metadata, mutate} = useBundleMetadata();

  const primaryAnchorUrl = servers.length > 0 ? servers[0].url : null;

  const [newAnchorHost, setNewAnchorHost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const identityReady = identityState.status === 'ready';
  const canSubmit =
    identityReady &&
    !submitting &&
    primaryAnchorUrl !== null &&
    newAnchorHost.trim().length > 0;

  async function handleSubmit() {
    if (!identityReady || submitting || primaryAnchorUrl === null) return;

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const anchors = servers.map(s => s.url.replace(/^https?:\/\//, '').replace(/\/+$/, ''));
    const publishedProfile = metadata.publishedProfile;
    const baseAnchors = publishedProfile?.anchors ?? anchors;
    const displayName =
      publishedProfile?.display_name ?? effectiveDisplayName ?? undefined;

    const result = await submitAddAnchor({
      primaryAnchorUrl,
      newAnchorHost,
      identity: identityState.identity,
      profile: {
        profileVersion: metadata.profileVersion ?? 0,
        anchors: baseAnchors,
        displayName,
        avatarRef: publishedProfile?.avatar_ref,
        bio: publishedProfile?.bio,
      },
    });

    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    await mutate(prev => ({
      ...prev,
      profileVersion: result.profileVersion,
      publishedProfile: {
        ...(prev.publishedProfile ?? {}),
        display_name: displayName,
        anchors: result.anchorList,
      },
    }));

    setSuccessMessage(
      'Anchor added. Your identity is now replicating to the new anchor.',
    );
    onAdded();
  }

  return (
    <View
      className="flex-1 bg-bg px-6 pt-8 pb-4"
      nativeID="add-anchor-screen"
      testID="add-anchor-screen">
      <Text className="font-display text-3xl font-bold text-text mb-1">
        Add a second anchor
      </Text>
      <Text className="text-sm text-text-secondary mb-4">
        A second anchor keeps your identity reachable if your home anchor goes
        offline. Enter the new anchor&apos;s host and we&apos;ll replicate your
        profile and settings to it.
      </Text>

      {primaryAnchorUrl === null ? (
        <Banner
          kind="warning"
          testID="add-anchor-no-primary"
          message="You need a home anchor before you can add a second one. Add a server first."
        />
      ) : (
        <>
          <View className="mb-3">
            <Text className="text-xs font-semibold text-text-secondary uppercase mb-1">
              Home anchor
            </Text>
            <Text
              testID="add-anchor-primary-url"
              className="text-sm font-mono text-text">
              {primaryAnchorUrl.replace(/\/+$/, '')}
            </Text>
          </View>

          <Field
            label="New anchor host"
            helper="Just the host (and port), e.g. anchor-b.example or localhost:4100.">
            <Input
              testID="new-anchor-input"
              accessibilityLabel="new anchor host"
              value={newAnchorHost}
              onChangeText={setNewAnchorHost}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              placeholder="anchor-b.example"
            />
          </Field>

          {errorMessage ? (
            <View className="mb-4">
              <Banner
                kind="danger"
                message={errorMessage}
                testID="add-anchor-error"
              />
            </View>
          ) : null}

          {successMessage ? (
            <View className="mb-4">
              <Banner
                kind="info"
                message={successMessage}
                testID="add-anchor-success"
              />
            </View>
          ) : null}

          <View className="flex-row" style={{gap: 12}}>
            <Button
              testID="add-anchor-submit"
              accessibilityLabel="add anchor"
              variant="primary"
              size="lg"
              disabled={!canSubmit}
              label={submitting ? 'Adding…' : 'Add anchor'}
              onPress={handleSubmit}
            />
            <Button
              testID="add-anchor-cancel"
              accessibilityLabel="cancel"
              variant="secondary"
              size="lg"
              disabled={submitting}
              label="Cancel"
              onPress={onCancel}
            />
          </View>
        </>
      )}
    </View>
  );
}
