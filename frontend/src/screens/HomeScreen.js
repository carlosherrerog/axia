import React, { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import api, { WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import { MarketplaceWatchSection } from '../components/WatchSections';
import AlertModal, { useAlert } from '../components/AlertModal';
import { useTheme } from '../context/ThemeContext';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [watches, setWatches] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loggedUser, setLoggedUser] = useState({});
  const { alertProps, showAlert } = useAlert();

  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true);
      const userRes = await api.get('/users/me');
      setLoggedUser(userRes.data);

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
      
      ws.onmessage = (event) => {
        if (event.data === "update_marketplace") {
          fetchData(); 
        }
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
      />

      {/* ── Banner hero ─────────────────────────────────────────── */}
      <View style={{
        marginHorizontal: 20, marginTop: 18, marginBottom: 6,
        backgroundColor: colors.backgroundAlt,
        borderRadius: 16, borderWidth: 1, borderColor: colors.border,
        padding: 20,
        ...(Platform.OS === 'web' && {
          background: `linear-gradient(135deg, ${colors.backgroundAlt} 0%, ${colors.surface} 100%)`,
        }),
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Ionicons name="diamond-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Alta Relojería · Blockchain
          </Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 }}>
          Marketplace AXIA
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
          {watches.length > 0
            ? `${watches.length} ${watches.length === 1 ? 'reloj certificado' : 'relojes certificados'} disponibles — autenticidad garantizada en blockchain`
            : 'Autenticidad garantizada en blockchain · Certificado NFC'}
        </Text>

        {/* Métricas rápidas */}
        {watches.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
            {[
              { icon: 'shield-checkmark-outline', label: 'Verificados', value: watches.length },
              { icon: 'people-outline', label: 'Vendedores', value: [...new Set(watches.map(w => w.owner_id))].length },
            ].map(m => (
              <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={m.icon} size={14} color={colors.primaryLight} />
                <Text style={{ color: colors.primaryLight, fontWeight: '700', fontSize: 14 }}>{m.value}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <MarketplaceWatchSection watches={watches} navigation={navigation} />

      <AlertModal {...alertProps} />
    </View>
  );
}