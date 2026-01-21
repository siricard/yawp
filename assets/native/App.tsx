import React, {useState} from 'react';
import {StatusBar, StyleSheet, useColorScheme, View} from 'react-native';
import {DidScreen} from './src/screens/DidScreen';
import {VectorTestScreen} from './src/screens/VectorTestScreen';

type Screen = 'home' | 'vector';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {screen === 'home' ? (
        <DidScreen onOpenVectorTest={() => setScreen('vector')} />
      ) : (
        <VectorTestScreen onBack={() => setScreen('home')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});

export default App;
