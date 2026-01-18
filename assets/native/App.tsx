import {StatusBar, StyleSheet, Text, useColorScheme, View} from 'react-native';
import type {ActionConfig} from './src/ash_generated';

const ashTypecheckProbe: ActionConfig = {};

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Text style={styles.title}>Mook</Text>
      <Text style={styles.subtitle}>
        Generated Ash RPC types loaded: {Object.keys(ashTypecheckProbe).length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    marginTop: 12,
  },
});

export default App;
