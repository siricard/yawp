require('fake-indexeddb/auto');

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
    getString: jest.fn(async () => ''),
  },
}));

jest.mock('react-native-keychain', () => {
  const store = new Map();

  return {
    getGenericPassword: jest.fn(async (options = {}) => {
      const service = options.service || 'default';
      const entry = store.get(service);
      return entry ? {service, ...entry} : false;
    }),
    setGenericPassword: jest.fn(async (username, password, options = {}) => {
      const service = options.service || 'default';
      store.set(service, {username, password});
      return {service, storage: 'mock'};
    }),
    resetGenericPassword: jest.fn(async (options = {}) => {
      const service = options.service || 'default';
      store.delete(service);
      return true;
    }),
    getSupportedBiometryType: jest.fn(async () => 'FaceID'),
    isPasscodeAuthAvailable: jest.fn(async () => true),
    ACCESSIBLE: {
      WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'AccessibleWhenPasscodeSetThisDeviceOnly',
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    },
    ACCESS_CONTROL: {
      BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
      BIOMETRY_ANY: 'BiometryAny',
      BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE:
        'BiometryCurrentSetOrDevicePasscode',
    },
    AUTHENTICATION_TYPE: {
      BIOMETRICS: 'AuthenticationWithBiometrics',
      DEVICE_PASSCODE_OR_BIOMETRICS: 'AuthenticationWithBiometricsDevicePasscode',
    },
    SECURITY_LEVEL: {},
    STORAGE_TYPE: {},
    BIOMETRY_TYPE: {},
  };
});
