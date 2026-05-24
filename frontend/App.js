// App.js
import React, { useState, useEffect } from 'react';
import { Platform, View, useWindowDimensions, Text, Pressable, Image, TouchableOpacity } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import api from './src/api/api';
import * as SecureStore from 'expo-secure-store';

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
import MenuDropdown              from './src/components/MenuDropDown';
import WatchmakerScreen          from './src/screens/WatchmakerScreen';
import ManufacturerScreen        from './src/screens/ManufacturerScreen';
import ConfiguracionScreen       from './src/screens/ConfiguracionScreen';
import SaleScreen                from './src/screens/SaleScreen';
import InfoScreen                from './src/screens/InfoScreen';
import AuctionScreen             from './src/screens/AuctionScreen';

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
  { name: 'Marketplace', icon: 'home' },
  { name: 'Subastas',    icon: 'hammer' },
  { name: 'Perfil',      icon: 'person' },
];

const PUBLIC_TABS = [
  { name: 'Marketplace', icon: 'home' },
  { name: 'Subastas',    icon: 'hammer' },
];

// COMPONENTE: BOTÓN DE NAVEGACIÓN (TAB ITEM)
function TabItem({ isDesktop, isFocused, iconName, label, onPress, sidebarHovered }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      style={({ pressed }) => [
        isDesktop
          ? {
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 12, paddingHorizontal: 12,
              marginBottom: 6, borderRadius: 12, width: '100%',
              backgroundColor: isFocused
                ? 'rgba(139,92,246,0.18)'
                : isHovered ? 'rgba(139,92,246,0.10)' : 'transparent',
              borderWidth: isFocused ? 1 : 0,
              borderColor: isFocused ? 'rgba(139,92,246,0.4)' : 'transparent',
              ...(Platform.OS === 'web' && { transition: 'all 0.2s ease', cursor: 'pointer' }),
            }
          : {
              width: 48, height: 48, borderRadius: 24,
              justifyContent: 'center', alignItems: 'center',
              backgroundColor: isFocused ? theme.primary : 'transparent',
            },
        { transform: [{ scale: pressed ? 0.95 : 1 }] }
      ]}
    >
      <Ionicons
        name={iconName}
        size={isDesktop ? 22 : 24}
        color={isDesktop ? (isFocused ? theme.primaryLight : isHovered ? theme.text : theme.textMuted) : (isFocused ? '#ffffff' : theme.textMuted)}
      />
      {isDesktop && (
        <Text
          numberOfLines={1}
          style={{
            marginLeft: 14, fontSize: 15,
            fontWeight: isFocused ? '700' : '400',
            color: isFocused ? theme.text : theme.textMuted,
            opacity: sidebarHovered ? 1 : 0,
            ...(Platform.OS === 'web' && { transition: 'opacity 0.2s ease' }),
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// SIDEBAR ESCRITORIO
function DesktopSidebar({ hovered, setHovered, activeTab, onTabPress }) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const sidebarWidth = hovered ? 220 : 68;

  const sidebarMenuItems = [
    {
      icon: 'information-circle-outline',
      label: 'Información',
      color: theme.text,
      onPress: () => { setShowMoreMenu(false); navigationRef.navigate('Info'); },
    },
    { divider: true },
    {
      icon: 'log-out-outline',
      label: 'Cerrar sesión',
      color: '#f43f5e',
      onPress: () => {
        setShowMoreMenu(false);
        if (Platform.OS === 'web') localStorage.clear();
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      },
    },
  ];

  return (
    <View
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: sidebarWidth,
        backgroundColor: theme.bgAlt,
        borderRightWidth: 1, borderColor: theme.border,
        paddingTop: 36, paddingHorizontal: 10,
        zIndex: 100,
        ...(Platform.OS === 'web' && { transition: 'width 0.3s ease' }),
      }}
    >
      <View style={{ height: 48, marginBottom: 32, justifyContent: 'center', alignItems: hovered ? 'flex-start' : 'center', paddingLeft: hovered ? 4 : 0 }}>
        {hovered ? (
          <Image
            source={require('./assets/axia-icons/axia-wordmark-purple.svg')}
            style={{ width: 76, height: 22 }}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={require('./assets/axia-icons/axia-icon-rounded-purple.svg')}
            style={{ width: 34, height: 34 }}
            resizeMode="contain"
          />
        )}
      </View>

      <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 16, marginHorizontal: 2 }} />

      {TABS.map(({ name, icon }) => (
        <TabItem
          key={name} isDesktop
          isFocused={activeTab === name}
          iconName={activeTab === name ? icon : `${icon}-outline`}
          label={name} sidebarHovered={hovered}
          onPress={() => onTabPress(name)}
        />
      ))}

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 24 }}>
        <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 12, marginHorizontal: 2 }} />
        <TabItem
          isDesktop isFocused={showMoreMenu}
          iconName="menu" label="Más" sidebarHovered={hovered}
          onPress={() => setShowMoreMenu(!showMoreMenu)}
        />
      </View>

      <MenuDropdown
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        position={{ bottom: 24, left: sidebarWidth + 8 }}
        items={sidebarMenuItems}
      />
    </View>
  );
}

// NAVEGACIÓN MÓVIL
function MobileBottomBar({ activeTab, onTabPress }) {
  return (
    <View style={{
      position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20,
      left: 20, right: 20, height: 68,
      backgroundColor: 'rgba(24,24,27,0.85)', borderRadius: 34,
      flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
      borderWidth: 1, borderColor: 'rgba(63,63,70,0.7)', elevation: 12, zIndex: 100,
      ...(Platform.OS === 'web' && { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }),
    }}>
      {TABS.map(({ name, icon }) => {
        const isFocused = activeTab === name;
        return (
          <TabItem
            key={name} isDesktop={false} isFocused={isFocused}
            iconName={isFocused ? icon : `${icon}-outline`}
            onPress={() => onTabPress(name)}
          />
        );
      })}
    </View>
  );
}

// DASHBOARD PRINCIPAL USUARIOS
function UserDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [activeTab, setActiveTab] = useState('Marketplace');

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const route = navigationRef.getCurrentRoute();
      if (route) {
        const name = route.name;
        if (['Marketplace', 'Buscar', 'Subastas'].includes(name)) setActiveTab(name);
        else if (['Perfil', 'ProfessionalRequest'].includes(name)) setActiveTab('Perfil');
      }
    });
    return unsubscribe;
  }, []);

  const handleTabPress = (name) => {
    navigationRef.navigate(name);
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.bg }}>
      {isDesktop && (
        <DesktopSidebar 
          hovered={sidebarHovered} 
          setHovered={setSidebarHovered} 
          activeTab={activeTab} 
          onTabPress={handleTabPress} 
        />
      )}
      
      <View style={{ flex: 1, position: 'relative', alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 1280, paddingBottom: 0 }}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="Marketplace" component={HomeScreen} />
            <Stack.Screen name="Subastas"      component={AuctionsScreen} />
            <Stack.Screen name="Perfil"        component={UserScreens} />
            <Stack.Screen name="WatchScreen"   component={WatchScreen} />
            <Stack.Screen name="PublicWatch"   component={PublicWatchScreen} />
            <Stack.Screen name="AuctionScreen" component={AuctionScreen} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
            <Stack.Screen name="ProfessionalRequest" component={ProfessionalRequestScreen} />
            <Stack.Screen name="Notificaciones"      component={NotificationsScreen} />
            <Stack.Screen name="SaleScreen"          component={SaleScreen} />
            <Stack.Screen name="Configuracion"       component={ConfiguracionScreen} />
            <Stack.Screen name="Info"                component={InfoScreen} />
          </Stack.Navigator>
        </View>

        {!isDesktop && <MobileBottomBar activeTab={activeTab} onTabPress={handleTabPress} />}
      </View>
    </View>
  );
}

// DASHBOARD PÚBLICO (sin login)
function PublicDashboard() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [activeTab, setActiveTab] = useState('Marketplace');

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const route = navigationRef.getCurrentRoute();
      if (route && ['Marketplace', 'Subastas'].includes(route.name)) setActiveTab(route.name);
    });
    return unsubscribe;
  }, []);

  const handleTabPress = (name) => navigationRef.navigate(name);

  const loginButton = (
    <TouchableOpacity
      onPress={() => navigationRef.navigate('Login')}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 10, paddingHorizontal: 12,
        marginBottom: 24, borderRadius: 12,
        backgroundColor: theme.primary + '20',
        borderWidth: 1, borderColor: theme.primary + '50',
      }}
    >
      <Ionicons name="log-in-outline" size={20} color={theme.primaryLight} />
      {sidebarHovered && (
        <Text style={{ color: theme.primaryLight, fontWeight: '700', fontSize: 14 }}>
          Iniciar sesión
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.bg }}>
      {isDesktop && (
        <View
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          style={{
            width: sidebarHovered ? 220 : 68,
            backgroundColor: theme.bgAlt,
            borderRightWidth: 1, borderColor: theme.border,
            paddingTop: 36, paddingHorizontal: 10, zIndex: 100,
            ...(Platform.OS === 'web' && { transition: 'width 0.3s ease' }),
          }}
        >
          <View style={{ height: 48, marginBottom: 32, justifyContent: 'center', alignItems: sidebarHovered ? 'flex-start' : 'center', paddingLeft: sidebarHovered ? 4 : 0 }}>
            {sidebarHovered ? (
              <Image source={require('./assets/axia-icons/axia-wordmark-purple.svg')} style={{ width: 76, height: 22 }} resizeMode="contain" />
            ) : (
              <Image source={require('./assets/axia-icons/axia-icon-rounded-purple.svg')} style={{ width: 34, height: 34 }} resizeMode="contain" />
            )}
          </View>
          <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 16, marginHorizontal: 2 }} />
          {PUBLIC_TABS.map(({ name, icon }) => (
            <TabItem
              key={name} isDesktop
              isFocused={activeTab === name}
              iconName={activeTab === name ? icon : `${icon}-outline`}
              label={name} sidebarHovered={sidebarHovered}
              onPress={() => handleTabPress(name)}
            />
          ))}
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 12, marginHorizontal: 2 }} />
            {loginButton}
          </View>
        </View>
      )}

      <View style={{ flex: 1, position: 'relative', alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 1280 }}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="Marketplace"   component={HomeScreen} />
            <Stack.Screen name="Subastas"      component={AuctionsScreen} />
            <Stack.Screen name="PublicWatch"   component={PublicWatchScreen} />
            <Stack.Screen name="AuctionScreen" component={AuctionScreen} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
            <Stack.Screen name="Info"          component={InfoScreen} />
          </Stack.Navigator>
        </View>

        {!isDesktop && (
          <View style={{
            position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20,
            left: 20, right: 20, height: 68,
            backgroundColor: 'rgba(24,24,27,0.85)', borderRadius: 34,
            flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
            borderWidth: 1, borderColor: 'rgba(63,63,70,0.7)', elevation: 12, zIndex: 100,
            ...(Platform.OS === 'web' && { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }),
          }}>
            {PUBLIC_TABS.map(({ name, icon }) => (
              <TabItem
                key={name} isDesktop={false}
                isFocused={activeTab === name}
                iconName={activeTab === name ? icon : `${icon}-outline`}
                onPress={() => handleTabPress(name)}
              />
            ))}
            <TouchableOpacity
              onPress={() => navigationRef.navigate('Login')}
              style={{
                width: 48, height: 48, borderRadius: 24,
                justifyContent: 'center', alignItems: 'center',
                backgroundColor: theme.primary + '25',
                borderWidth: 1, borderColor: theme.primary + '60',
              }}
            >
              <Ionicons name="log-in-outline" size={22} color={theme.primaryLight} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

//  DASHBOARD RELOJERO
function WatchmakerDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 1280, alignSelf: 'center', paddingBottom: Platform.select({ ios: 110, android: 100, web: 0 }) }}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="WatchmakerScreen" component={WatchmakerScreen} />
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
      <View style={{ flex: 1, width: '100%', maxWidth: 1280, alignSelf: 'center', paddingBottom: Platform.select({ ios: 110, android: 100, web: 0 }) }}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="ManufacturerScreen" component={ManufacturerScreen} />
          <Stack.Screen name="WatchScreen"        component={WatchScreen} />
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
          Notificaciones: 'notifications',
        }
      },
      ManufacturerDashboard: {
        path: 'manufacturer',
        screens: {
          ManufacturerScreen: '',
          WatchScreen: 'watch/:watchId',
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
          Notificaciones: 'notifications',
        }
      },
    },
  },
};

// APP ROOT
function AppNavigator() {
  const handleReady = async () => {
    try {
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