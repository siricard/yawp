require('fake-indexeddb/auto');

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
    ACCESSIBLE: {},
    ACCESS_CONTROL: {},
    AUTHENTICATION_TYPE: {},
    SECURITY_LEVEL: {},
    STORAGE_TYPE: {},
    BIOMETRY_TYPE: {},
  };
});
