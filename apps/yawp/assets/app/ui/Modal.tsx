import React from 'react';
import {Modal as RNModal, Pressable, Text, View} from 'react-native';

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  testID?: string;
};

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  testID = 'modal',
}: ModalProps) {
  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(8,12,18,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
        testID={`${testID}-backdrop`}>
        <Pressable
          accessibilityLabel="close modal"
          testID={`${testID}-backdrop-press`}
          onPress={closeOnBackdrop ? onClose : undefined}
          style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
        />
        <View
          testID={testID}
          accessibilityLabel={title}
          className="bg-surface rounded-lg p-4 w-full"
          style={{
            maxWidth: 480,
            shadowColor: '#08111a',
            shadowOffset: {width: 0, height: 14},
            shadowOpacity: 0.42,
            shadowRadius: 40,
            elevation: 12,
          }}>
          {title ? (
            <Text className="text-lg font-bold text-text mb-3">{title}</Text>
          ) : null}
          <View>{children}</View>
          {footer ? (
            <View className="flex-row justify-end mt-4" style={{gap: 8}}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </RNModal>
  );
}
