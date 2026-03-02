import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import OnboardingScreen from '@/components/OnboardingScreen';
import { useColorScheme } from '@/components/useColorScheme';
import { PanoramaProvider } from '@/context/PanoramaContext';

export {
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const ONBOARDING_FLAG = `${FileSystem.documentDirectory}onboarding_complete.flag`;

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0F0F1A',
    card: '#1A1A2E',
    primary: '#6C63FF',
    text: '#F9FAFB',
    border: '#2D2D44',
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F8F9FE',
    card: '#FFFFFF',
    primary: '#6C63FF',
    text: '#1A1A2E',
    border: '#E5E7EB',
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  // Check if onboarding has been completed
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const info = await FileSystem.getInfoAsync(ONBOARDING_FLAG);
        setShowOnboarding(!info.exists);
      } catch {
        setShowOnboarding(true);
      }
    }
    checkOnboarding();
  }, []);

  const handleOnboardingComplete = async () => {
    try {
      await FileSystem.writeAsStringAsync(ONBOARDING_FLAG, 'done');
    } catch (e) {
      // Ignore write errors
    }
    setShowOnboarding(false);
  };

  // Still loading onboarding state
  if (showOnboarding === null) {
    return null;
  }

  // Show onboarding on first launch
  if (showOnboarding) {
    return (
      <PanoramaProvider>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </PanoramaProvider>
    );
  }

  return (
    <PanoramaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : CustomLightTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="capture"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="viewer"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', title: 'About' }}
          />
        </Stack>
      </ThemeProvider>
    </PanoramaProvider>
  );
}
