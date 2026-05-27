import React, { useState, useCallback } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import api, { WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import { MarketplaceWatchSection } from '../components/WatchSections';
import AlertModal, { useAlert } from '../components/AlertModal';
import { useTheme } from '../context/ThemeContext';
import { useScrollAware, HEADER_HEIGHT } from '../hooks/useScrollAware';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [watches, setWatches] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loggedUser, setLoggedUser] = useState({});
  const { alertProps, showAlert } = useAlert();
  const { onScroll, headerTranslate } = useScrollAware();

  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true);
      try {
        const userRes = await api.get('/users/me');
        setLoggedUser(userRes.data);
      } catch {} // modo invitado: continuar sin usuario
      const marketRes = await api.get('/marketplace');
      setWatches(marketRes.data);
    } catch (error) {
      console.error("Error cargando HomeScreen:", error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      const ws = new WebSocket(`${WS_URL}/ws/admin`);
      
      ws.onmessage = ({ data }) => {
        let type = data;
        try { type = JSON.parse(data)?.type ?? data; } catch {}
        if (type === 'update_marketplace') fetchData();
      };

      return () => {
        if (ws) ws.close();
      };
    }, [fetchData])
  ); 

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userData');
      } else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userData');
      }
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }], 
        })
      );
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  if (loadingData && watches.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        title="Marketplace"
        onWalletChange={setLoggedUser}
        navigation={navigation}
        translateAnim={headerTranslate}
      />

      <MarketplaceWatchSection
        watches={watches}
        navigation={navigation}
        onScroll={onScroll}
        topOffset={HEADER_HEIGHT}
      />

      <AlertModal {...alertProps} />
    </View>
  );
}