// App.js
import React, { useState, useEffect } from 'react';
import { Platform, View, useWindowDimensions, Text, Pressable } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from './src/api/api';
import * as SecureStore from 'expo-secure-store';
if (Platform.OS === 'web') { require('./src/wallet/walletconnect'); }

// IMPORTACIÓN DE PANTALLAS
import AuthScreen                from './src/screens/AuthScreen';
import RoleSelectionScreen       from './src/screens/RoleSelectionScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import WatchScreen               from './src/screens/WatchScreen';
import AdminScreen               from './src/screens/AdminScreen';
import UserScreens               from './src/screens/UserScreens';
import HomeScreen                from './src/screens/HomeScreen';
import AuctionsScreen            from './src/screens/AuctionsScreen';
import ProfessionalRequestScreen from './src/screens/ProfessionalRequestScreen';
import PublicWatchScreen         from './src/screens/PublicWatchScreen';
import PublicProfileScreen       from './src/screens/PublicProfileScreen';
import NotificationsScreen       from './src/screens/NotificationsScreen';
import { NavTabContext }         from './src/context/NavTabContext';
import WatchmakerScreen          from './src/screens/WatchmakerScreen';
import ManufacturerScreen        from './src/screens/ManufacturerScreen';
import ConfiguracionScreen       from './src/screens/ConfiguracionScreen';
import SaleScreen                from './src/screens/SaleScreen';
import InfoScreen                from './src/screens/InfoScreen';
import AuctionScreen             from './src/screens/AuctionScreen';
import NFCPassportScreen         from './src/screens/NFCPassportScreen';

const navigationRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();

const theme = {
  bg:           '#0d0d0d',
  bgAlt:        '#18181b',
  primary:      '#8b5cf6',
  primaryLight: '#a78bfa',
  border:       '#3f3f46',
  text:         '#fafafa',
  textMuted:    '#71717a',
};

const TABS = [
  { name: 'Marketplace', icon: 'home',               label: 'Mercado'      },
  { name: 'Subastas',    icon: 'hammer',             label: 'Subastas'     },
  { name: 'Perfil',      icon: 'person',             label: 'Perfil'       },
  { name: 'Info',        icon: 'information-circle', label: 'Información', webOnly: true },
];

const PUBLIC_TABS = [
  { name: 'Marketplace', icon: 'home',               label: 'Mercado'   },
  { name: 'Subastas',    icon: 'hammer',             label: 'Subastas'  },
  { name: 'Info',        icon: 'information-circle', label: 'Info'      },
];

// BARRA INFERIOR MÓVIL — plana con etiquetas
function MobileBottomBar({ activeTab, onTabPress, tabs, extraRight }) {
  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: Platform.OS === 'ios' ? 90 : 60,
      paddingBottom: Platform.OS === 'ios' ? 34 : 0,
      flexDirection: 'row',
      backgroundColor: 'rgba(24,24,27,0.97)',
      borderTopWidth: 1, borderTopColor: theme.border,
      zIndex: 100,
      ...(Platform.OS === 'web' && {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }),
    }}>
      {tabs.filter(t => !t.webOnly).map(({ name, icon, label }) => {
        const isFocused = activeTab === name;
        return (
          <Pressable
            key={name}
            onPress={() => onTabPress(name)}
            style={[{
              flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3,
            }, Platform.OS === 'web' && { cursor: 'pointer' }]}
          >
            <Ionicons
              name={isFocused ? icon : `${icon}-outline`}
              size={22}
              color={isFocused ? theme.primary : theme.textMuted}
            />
            <Text style={{
              fontSize: 10, fontWeight: isFocused ? '700' : '400',
              color: isFocused ? theme.primaryLight : theme.textMuted,
            }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
      {extraRight}
    </View>
  );
}

// DASHBOARD PRINCIPAL USUARIOS
function UserDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeTab, setActiveTab] = useState('Marketplace');
  const [hideBar, setHideBar] = useState(false);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const route = navigationRef.getCurrentRoute();
      if (!route) return;
      const { name } = route;
      setHideBar(name === 'NFCPassport');
      if (['Marketplace', 'Subastas', 'Info'].includes(name)) setActiveTab(name);
      else if (['Perfil', 'ProfessionalRequest', 'Configuracion'].includes(name)) setActiveTab('Perfil');
    });
    return unsubscribe;
  }, []);

  const handleTabPress = (name) => {
    setActiveTab(name);
    navigationRef.navigate(name);
  };

  return (
    <NavTabContext.Provider value={{ activeTab, onTabPress: handleTabPress, tabs: TABS }}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <View style={{ flex: 1, width: '100%' }}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Marketplace"         component={HomeScreen} />
              <Stack.Screen name="Subastas"            component={AuctionsScreen} />
              <Stack.Screen name="Perfil"              component={UserScreens} />
              <Stack.Screen name="WatchScreen"         component={WatchScreen} />
              <Stack.Screen name="PublicWatch"         component={PublicWatchScreen} />
              <Stack.Screen name="NFCPassport"         component={NFCPassportScreen} />
              <Stack.Screen name="AuctionScreen"       component={AuctionScreen} />
              <Stack.Screen name="PublicProfile"       component={PublicProfileScreen} />
              <Stack.Screen name="ProfessionalRequest" component={ProfessionalRequestScreen} />
              <Stack.Screen name="Notificaciones"      component={NotificationsScreen} />
              <Stack.Screen name="SaleScreen"          component={SaleScreen} />
              <Stack.Screen name="Configuracion"       component={ConfiguracionScreen} />
              <Stack.Screen name="Info"                component={InfoScreen} />
            </Stack.Navigator>
          </View>
          {!isDesktop && !hideBar && (
            <MobileBottomBar
              activeTab={activeTab}
              onTabPress={handleTabPress}
              tabs={TABS}
            />
          )}
        </View>
      </View>
    </NavTabContext.Provider>
  );
}

// DASHBOARD PÚBLICO (sin login)
function PublicDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeTab, setActiveTab] = useState('Marketplace');
  const [hideBar, setHideBar] = useState(false);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const route = navigationRef.getCurrentRoute();
      if (!route) return;
      setHideBar(route.name === 'NFCPassport');
      if (['Marketplace', 'Subastas', 'Info'].includes(route.name)) setActiveTab(route.name);
    });
    return unsubscribe;
  }, []);

  const handleTabPress = (name) => {
    setActiveTab(name);
    navigationRef.navigate(name);
  };

  return (
    <NavTabContext.Provider value={{ activeTab, onTabPress: handleTabPress, tabs: PUBLIC_TABS }}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <View style={{ flex: 1, width: '100%' }}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="Marketplace"   component={HomeScreen} />
              <Stack.Screen name="Subastas"      component={AuctionsScreen} />
              <Stack.Screen name="PublicWatch"   component={PublicWatchScreen} />
              <Stack.Screen name="NFCPassport"   component={NFCPassportScreen} />
              <Stack.Screen name="AuctionScreen" component={AuctionScreen} />
              <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
              <Stack.Screen name="Info"          component={InfoScreen} />
            </Stack.Navigator>
          </View>
          {!isDesktop && !hideBar && (
            <MobileBottomBar
              activeTab={activeTab}
              onTabPress={handleTabPress}
              tabs={PUBLIC_TABS}
            />
          )}
        </View>
      </View>
    </NavTabContext.Provider>
  );
}

//  DASHBOARD RELOJERO
function WatchmakerDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, width: '100%', paddingBottom: Platform.select({ ios: 110, android: 100, web: 0 }) }}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="WatchmakerScreen" component={WatchmakerScreen} />
          <Stack.Screen name="NFCPassport"      component={NFCPassportScreen} />
          <Stack.Screen name="Notificaciones"   component={NotificationsScreen} />
          <Stack.Screen name="SaleScreen"       component={SaleScreen} />
          <Stack.Screen name="Configuracion"    component={ConfiguracionScreen} />
          <Stack.Screen name="Info"             component={InfoScreen} />
        </Stack.Navigator>
      </View>
    </View>
  );
}

// DASHBOARD FABRICANTE
function ManufacturerDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, width: '100%', paddingBottom: Platform.select({ ios: 110, android: 100, web: 0 }) }}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="ManufacturerScreen" component={ManufacturerScreen} />
          <Stack.Screen name="WatchScreen"        component={WatchScreen} />
          <Stack.Screen name="NFCPassport"        component={NFCPassportScreen} />
          <Stack.Screen name="Notificaciones"     component={NotificationsScreen} />
          <Stack.Screen name="SaleScreen"         component={SaleScreen} />
          <Stack.Screen name="Configuracion"      component={ConfiguracionScreen} />
          <Stack.Screen name="Info"               component={InfoScreen} />
        </Stack.Navigator>
      </View>
    </View>
  );
}

// CONFIGURACIÓN DE RUTAS (LINKING)
const linking = {
  prefixes: ['http://localhost:8081', 'axia://'],
  config: {
    screens: {
      PublicDashboard: {
        path: '',
        screens: {
          Marketplace: 'marketplace',
          Subastas: 'auctions',
          PublicWatch: 'watch/:watchId',
          NFCPassport: 'nfc-scan/:tokenId',
          AuctionScreen: 'auction/:tokenId',
        },
      },
      Login: 'login',
      RoleSelection: 'onboarding',
      Admin: 'admin',
      WatchmakerDashboard: {
        path: 'watchmaker',
        screens: {
          WatchmakerScreen: '',
          NFCPassport: 'nfc-scan/:tokenId',
          Notificaciones: 'notifications',
        }
      },
      ManufacturerDashboard: {
        path: 'manufacturer',
        screens: {
          ManufacturerScreen: '',
          WatchScreen: 'watch/:watchId',
          NFCPassport: 'nfc-scan/:tokenId',
          Notificaciones: 'notifications',
        }
      },
      UserDashboard: {
        path: 'app',
        screens: {
          Marketplace: 'marketplace',
          Subastas: 'auctions',
          Perfil: 'profile',
          WatchScreen: 'watch/:watchId',
          AuctionScreen: 'auction/:tokenId',
          NFCPassport: 'nfc-scan/:tokenId',
          Notificaciones: 'notifications',
        }
      },
      Admin: 'admin',
    },
  },
};

// APP ROOT
function AppNavigator() {
  const handleReady = async () => {
    try {
      // Si el deep link ya resolvió NFCPassport, no redirigir al dashboard
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute?.name === 'NFCPassport') return;

      const token = Platform.OS === 'web'
        ? localStorage.getItem('userToken')
        : await SecureStore.getItemAsync('userToken');
      if (!token) return;

      const res = await api.get('/users/me');
      const u = res.data;

      if (u.is_admin)
        navigationRef.reset({ index: 0, routes: [{ name: 'Admin', params: { user: u } }] });
      else if (u.roles?.includes('RELOJERO'))
        navigationRef.reset({ index: 0, routes: [{ name: 'WatchmakerDashboard', params: { user: u } }] });
      else if (u.roles?.includes('FABRICANTE'))
        navigationRef.reset({ index: 0, routes: [{ name: 'ManufacturerDashboard', params: { user: u } }] });
      else
        navigationRef.reset({ index: 0, routes: [{ name: 'UserDashboard', params: { user: u } }] });
    } catch {
      // Token inválido o expirado — quedarse en PublicDashboard
    }
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleReady}>
      <Stack.Navigator initialRouteName="PublicDashboard" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="PublicDashboard"       component={PublicDashboard} />
        <Stack.Screen name="Login"                 component={AuthScreen} />
        <Stack.Screen name="RoleSelection"         component={RoleSelectionScreen} />
        <Stack.Screen name="Admin"                 component={AdminScreen} />
        <Stack.Screen name="UserDashboard"         component={UserDashboard} />
        <Stack.Screen name="WatchmakerDashboard"   component={WatchmakerDashboard} />
        <Stack.Screen name="ManufacturerDashboard" component={ManufacturerDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}