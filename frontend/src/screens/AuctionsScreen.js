import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken, WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import AlertModal, { useAlert } from '../components/AlertModal';
import AuctionCard from '../components/AuctionCard';
import { useTheme } from '../context/ThemeContext';

export default function AuctionsScreen({ navigation }) {
  const { colors } = useTheme();

  const [auctions, setAuctions]     = useState([]);
  const [loggedUser, setLoggedUser] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { alertProps } = useAlert();

  const fetchData = useCallback(async () => {
    try {
      try {
        const userRes = await api.get('/users/me');
        setLoggedUser(userRes.data);
      } catch {} // modo invitado: continuar sin usuario
      const auctionsRes = await api.get('/auctions');
      setAuctions(auctionsRes.data);
    } catch (e) {
      console.error('Error cargando subastas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    getToken().then(token => {
      ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'update_auction' || msg.type === 'update_marketplace') fetchData();
        } catch {}
      };
    });
    return () => ws?.close();
  }, [loggedUser?.id, fetchData]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        navigation={navigation}
        title="Subastas"
        onWalletChange={setLoggedUser}
      />

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={{ marginTop: 16, marginBottom: 14 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: 'bold' }}>Subastas activas</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {auctions.length} subasta{auctions.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {auctions.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="hourglass-outline" size={64} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 16, fontSize: 16 }}>
              No hay subastas activas en este momento
            </Text>
          </View>
        ) : (
          <FlatList
            data={auctions}
            keyExtractor={item => String(item.token_id)}
            numColumns={2}
            columnWrapperStyle={{ gap: 16, justifyContent: 'flex-start' }}
            contentContainerStyle={{ paddingBottom: 100, gap: 16 }}
            renderItem={({ item }) => (
              <AuctionCard auction={item} navigation={navigation} />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchData(); }}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <AlertModal {...alertProps} />
    </View>
  );
}
