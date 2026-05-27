import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity, useWindowDimensions, Platform, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api, { getToken, WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import AlertModal, { useAlert } from '../components/AlertModal';
import AuctionCard from '../components/AuctionCard';
import { useTheme } from '../context/ThemeContext';

const SORT_OPTIONS = [
  { key: 'recent',    label: 'Reciente' },
  { key: 'ending',    label: 'Cierra antes' },
  { key: 'price_asc', label: 'Precio ↑' },
  { key: 'price_desc',label: 'Precio ↓' },
];

const HOW_AUCTIONS_WORK = [
  {
    icon: 'storefront-outline', color: '#f59e0b',
    title: 'Solo dealers verificados',
    desc: 'Únicamente los usuarios con rol Dealer pueden crear subastas para sus piezas.',
  },
  {
    icon: 'trending-up-outline', color: '#8b5cf6',
    title: 'Pujas en tiempo real',
    desc: 'Cada nueva puja supera a la anterior. El pujante superado recibe su dinero de vuelta automáticamente.',
  },
  {
    icon: 'wallet-outline', color: '#10b981',
    title: 'Pago automático al ganar',
    desc: 'Al cerrar la subasta, el contrato transfiere el reloj al ganador y liquida el pago en USDC.',
  },
];

function HowAuctionsWork({ isMobile, colors }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const maxH   = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 600] });

  const toggle = () => {
    Animated.spring(anim, { toValue: open ? 0 : 1, useNativeDriver: false, bounciness: 0, speed: 20 }).start();
    setOpen(o => !o);
  };

  const steps = (
    <View style={{ paddingTop: 10, paddingBottom: 10 }}>
      {HOW_AUCTIONS_WORK.map(step => (
        <View key={step.title} style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 14,
          backgroundColor: colors.backgroundAlt,
          borderRadius: 12, borderWidth: 1, borderColor: colors.border,
          padding: 16, marginBottom: 10,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: step.color + '18', borderWidth: 1, borderColor: step.color + '35',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Ionicons name={step.icon} size={17} color={step.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 3 }}>{step.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>{step.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  if (!isMobile) {
    return (
      <View style={{ paddingTop: 24, paddingBottom: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
          Cómo funcionan las subastas
        </Text>
        {steps}
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 16, paddingBottom: 10 }}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.backgroundAlt,
          borderRadius: 12, borderWidth: 1, borderColor: open ? colors.primary + '40' : colors.border,
          paddingHorizontal: 14, paddingVertical: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="help-circle-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
            ¿Cómo funcionan las subastas?
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      <Animated.View style={{ maxHeight: maxH, overflow: 'hidden' }}>
        {steps}
      </Animated.View>
    </View>
  );
}

export default function AuctionsScreen({ navigation }) {
  const { colors } = useTheme();
  const { width }  = useWindowDimensions();

  const [auctions, setAuctions]     = useState([]);
  const [loggedUser, setLoggedUser] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy]         = useState('recent');
  const { alertProps } = useAlert();

  const isMobile = width < 768;
  const isDesktop = width >= 768;
  const hPad = isDesktop ? Math.max(24, Math.floor((width - 1000) / 2)) : 16;
  const contentW = width - 2 * hPad;

  let cols = 2;
  if (contentW >= 1100) cols = 5;
  else if (contentW >= 850) cols = 4;
  else if (contentW >= 620) cols = 3;

  const fetchData = useCallback(async () => {
    try {
      try {
        const userRes = await api.get('/users/me');
        setLoggedUser(userRes.data);
      } catch {}
      const auctionsRes = await api.get('/auctions');
      setAuctions(auctionsRes.data);
    } catch (e) {
      console.error('Error cargando subastas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    // WebSocket público para actualizaciones en tiempo real sin login
    const ws = new WebSocket(`${WS_URL}/ws/admin`);
    ws.onmessage = ({ data }) => {
      let type = data;
      try { type = JSON.parse(data)?.type ?? data; } catch {}
      if (type === 'update_marketplace' || type === 'update_auction') fetchData();
    };
    return () => ws.close();
  }, [fetchData]));

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

  const sorted = [...auctions].sort((a, b) => {
    if (sortBy === 'ending')     return (a.seconds_remaining ?? 0) - (b.seconds_remaining ?? 0);
    if (sortBy === 'price_asc')  return (a.min_price ?? 0) - (b.min_price ?? 0);
    if (sortBy === 'price_desc') return (b.min_price ?? 0) - (a.min_price ?? 0);
    return 0;
  });

  const urgentCount  = auctions.filter(a => (a.seconds_remaining ?? 0) > 0 && (a.seconds_remaining ?? 0) < 3600).length;
  const sellersCount = [...new Set(auctions.map(a => a.seller_name))].filter(Boolean).length;

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

      <FlatList
        data={sorted}
        keyExtractor={item => String(item.token_id)}
        numColumns={cols}
        key={`auction-grid-${cols}`}
        columnWrapperStyle={cols > 1 ? { gap: 20, justifyContent: 'flex-start' } : undefined}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <View style={{ width: Math.floor((contentW - (cols - 1) * 20) / cols), marginBottom: 20 }}>
            <AuctionCard auction={item} navigation={navigation} />
          </View>
        )}
        ListHeaderComponent={
          <View>
            {/* ── Hero banner ── */}
            <View style={{
              marginTop: isMobile ? 10 : 18, marginBottom: isMobile ? 10 : 16,
              backgroundColor: colors.backgroundAlt,
              borderRadius: 16, borderWidth: 1, borderColor: colors.border,
              padding: isMobile ? 14 : 20,
              ...(Platform.OS === 'web' && {
                background: `linear-gradient(135deg, ${colors.backgroundAlt} 0%, #1a1040 100%)`,
              }),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isMobile ? 4 : 8 }}>
                <Ionicons name="trending-up-outline" size={isMobile ? 14 : 18} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Subastas en vivo · Blockchain
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: isMobile ? 17 : 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 }}>
                Subastas AXIA
              </Text>
              {!isMobile && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                  Puja en tiempo real por relojes de alta relojería certificados en blockchain.
                </Text>
              )}

              {/* Stats — solo desktop */}
              {!isMobile && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
                  {[
                    { icon: 'hammer-outline',       label: 'Activas',       value: auctions.length },
                    { icon: 'storefront-outline',    label: 'Vendedores',    value: sellersCount },
                    { icon: 'alert-circle-outline',  label: 'Cierran pronto',value: urgentCount },
                  ].map(m => (
                    <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name={m.icon} size={12} color={m.value > 0 ? colors.primaryLight : colors.textMuted} />
                      <Text style={{ color: m.value > 0 ? colors.primaryLight : colors.textMuted, fontWeight: '700', fontSize: 12 }}>{m.value}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── Ordenación ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              {SORT_OPTIONS.map(opt => {
                const active = sortBy === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setSortBy(opt.key)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 20, borderWidth: 1,
                      backgroundColor: active ? colors.primary + '1a' : 'transparent',
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: active ? '700' : '400', color: active ? colors.primary : colors.textSecondary }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{
            padding: 28, marginBottom: 20,
            backgroundColor: colors.backgroundAlt,
            borderRadius: 16, borderWidth: 1, borderColor: colors.border,
            alignItems: 'center',
          }}>
            <View style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '30',
              alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Ionicons name="hammer-outline" size={26} color={colors.primary} />
            </View>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
              No hay subastas activas
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
              Cuando un Dealer publique una subasta aparecerá aquí en tiempo real.
            </Text>
          </View>
        }
        ListFooterComponent={<HowAuctionsWork isMobile={isMobile} colors={colors} />}
      />

      <AlertModal {...alertProps} />
    </View>
  );
}
