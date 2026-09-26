import '../services/logger';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TextSizeProvider } from '../context/TextSizeContext';

export default function RootLayout() {
  return (
    <TextSizeProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </TextSizeProvider>
  );
}
