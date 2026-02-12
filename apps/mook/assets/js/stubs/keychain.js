
const notSupported = (name) => async () => {
  throw new Error(
    `react-native-keychain.${name} called in the web bundle. The web identity ` +
      `module uses localStorage via assets/app/identity/storage.web.ts.`,
  );
};

export const setGenericPassword = notSupported('setGenericPassword');
export const getGenericPassword = notSupported('getGenericPassword');
export const resetGenericPassword = notSupported('resetGenericPassword');

export default {
  setGenericPassword,
  getGenericPassword,
  resetGenericPassword,
};
