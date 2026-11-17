import React, { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { storageService, OnboardingView } from '../../services/storage';
import { LanguageCode, getTranslation } from '../../services/i18n';
import LanguageSelectionView from '../../components/LanguageSelectionView';
import LocationSelectionView from '../../components/LocationSelectionView';
import FarmerLoginView from '../../components/FarmerLoginView';

export default function TabLayout() {
  // Top-level state machine: only ONE view is mounted at a time
  // Strict 3-step sequence: Language → Location → Login → Dashboard
  const [view, setView] = useState<'loading' | OnboardingView>('loading');
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');

  useEffect(() => {
    (async () => {
      const savedLang = await storageService.getLanguage();
      if (savedLang) {
        setCurrentLang(savedLang as LanguageCode);
      }

      const hasOnboarded = await storageService.hasCompletedOnboarding();
      if (hasOnboarded) {
        setView('dashboard');
      } else {
        setView('language');
      }
    })();

    // Listen for language changes
    const unsubLang = storageService.onLanguageChange((newLang) => {
      setCurrentLang(newLang as LanguageCode);
    });

    // Listen for onboarding flow resets (e.g. logout)
    const unsubOnboarding = storageService.onOnboardingChange((newView) => {
      setView(newView);
    });

    return () => {
      unsubLang();
      unsubOnboarding();
    };
  }, []);

  // 1. Storage Loading Placeholder
  if (view === 'loading') {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color="#15803D" />
      </View>
    );
  }

  // 2. Step 1: Pure, Isolated Language Selection (Zero Leaks: No tabs, no dashboard)
  if (view === 'language') {
    return (
      <LanguageSelectionView
        currentLang={currentLang}
        onSelect={async (code) => {
          await storageService.setLanguage(code);
          setCurrentLang(code);
          setView('location');
        }}
      />
    );
  }

  // 3. Step 2: Pure, Isolated Location Selection (Zero Leaks: No tabs, no dashboard)
  if (view === 'location') {
    return (
      <LocationSelectionView
        currentLang={currentLang}
        onBack={() => setView('language')}
        onContinue={async (state, district) => {
          await storageService.saveLocation(state, district);
          setView('login');
        }}
      />
    );
  }

  // 4. Step 3: Pure, Isolated Farmer Login (Mobile/OTP + Continue as Guest)
  if (view === 'login') {
    return (
      <FarmerLoginView
        currentLang={currentLang}
        onBack={() => setView('location')}
        onSuccess={() => {
          setView('dashboard');
        }}
      />
    );
  }

  // 4. Main Dashboard Tabs: Mounted ONLY when view === 'dashboard'
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarActiveTintColor: '#1B5E20',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: getTranslation(currentLang, 'tabAsk') || 'Ask Query',
          tabBarAccessibilityLabel: `${getTranslation(currentLang, 'tabAsk') || 'Ask Query'}, Tab 1 of 3`,
          tabBarIcon: ({ focused }) => (
            <View style={focused ? styles.iconPillActive : styles.iconPillInactive}>
              <MaterialCommunityIcons
                name={(focused ? 'comment-text' : 'comment-text-outline') as any}
                color={focused ? '#1B5E20' : '#6B7280'}
                size={24}
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontSize: 11,
                fontWeight: focused ? '700' : '500',
                color: focused ? '#1B5E20' : '#6B7280',
                marginTop: 2,
              }}
            >
              {getTranslation(currentLang, 'tabAsk') || 'Ask Query'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: getTranslation(currentLang, 'tabPhoto') || 'Crop Scan',
          tabBarAccessibilityLabel: `${getTranslation(currentLang, 'tabPhoto') || 'Crop Scan'}, Tab 2 of 3`,
          tabBarIcon: ({ focused }) => (
            <View style={focused ? styles.iconPillActive : styles.iconPillInactive}>
              <MaterialCommunityIcons
                name={(focused ? 'camera-iris' : 'camera-outline') as any}
                color={focused ? '#1B5E20' : '#6B7280'}
                size={24}
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontSize: 11,
                fontWeight: focused ? '700' : '500',
                color: focused ? '#1B5E20' : '#6B7280',
                marginTop: 2,
              }}
            >
              {getTranslation(currentLang, 'tabPhoto') || 'Crop Scan'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: getTranslation(currentLang, 'tabHistory') || 'History',
          tabBarAccessibilityLabel: `${getTranslation(currentLang, 'tabHistory') || 'History'}, Tab 3 of 3`,
          tabBarIcon: ({ focused }) => (
            <View style={focused ? styles.iconPillActive : styles.iconPillInactive}>
              <MaterialCommunityIcons
                name={(focused ? 'history' : 'clock-outline') as any}
                color={focused ? '#1B5E20' : '#6B7280'}
                size={24}
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontSize: 11,
                fontWeight: focused ? '700' : '500',
                color: focused ? '#1B5E20' : '#6B7280',
                marginTop: 2,
              }}
            >
              {getTranslation(currentLang, 'tabHistory') || 'History'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="diagnosis"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingCenter: {
    flex: 1,
    backgroundColor: '#FDFBF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    height: 68,
    paddingTop: 6,
    paddingBottom: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillInactive: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
