// src/components/WatchSections.js (o el nombre que tenga tu archivo)
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WatchCard from './WatchCard';
import PublicWatchCard from './PublicWatchCard';
import AuctionCard from './AuctionCard';
import { colors, globalStyles, userStyles } from '../themes/styles.js';

export default function WatchSections({
  myNfts,
  walletAddress,
  userRoles,
  onOpenImportModal,
  removeNFT,
  navigation,
  onRefresh,
  refreshing,
  myBids,
}) {
  const isDealer = (userRoles || []).includes('DEALER');
  const isParticular = !isDealer;
  const [activeTab, setActiveTab] = useState('collection');
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Lógica de rotación del mini-reloj
  useEffect(() => {
    if (refreshing) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    }
  }, [refreshing]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const listedNfts  = myNfts.filter(nft => nft.is_listed && !nft.is_buyer && !nft.is_auction);

  const tabs = [
    { key: 'collection', label: isDealer ? 'Stock' : 'Mi Colección' },
    { key: 'listed',     label: 'En Venta' },
    ...(isParticular ? [{ key: 'bids', label: 'Subastas' }] : []),
  ];

  return (
    <View style={{ marginBottom: 30 }}>
      {/* BARRA DE PESTAÑAS */}
      <View style={globalStyles.tabBar}>

        {/* LADO IZQUIERDO: Pestañas */}
        <View style={{ flexDirection: 'row' }}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                globalStyles.tabButton,
                activeTab === tab.key && { borderBottomWidth: 2, borderBottomColor: colors.primary }
              ]}
            >
              <Text style={[
                globalStyles.tabText,
                { color: activeTab === tab.key ? colors.primary : colors.textSecondary,
                  fontWeight: activeTab === tab.key ? 'bold' : 'normal' }
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LADO DERECHO: Refresh + Importar */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 8, marginRight: 5, gap: 4 }}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons
                name="watch-outline"
                size={22}
                color={refreshing ? colors.primaryLight : colors.textSecondary}
              />
            </Animated.View>
            <Text style={{ color: refreshing ? colors.primaryLight : colors.textSecondary, fontSize: 11 }}>
              Actualizar
            </Text>
          </TouchableOpacity>

          {walletAddress && (
            <TouchableOpacity 
              onPress={onOpenImportModal} 
              style={globalStyles.importButton}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={globalStyles.importText}>Importar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* CONTENIDO DE LAS PESTAÑAS */}
      <View style={{ paddingHorizontal: 20 }}>
        {activeTab === 'collection' && (
          myNfts.length === 0 ? (
            <View style={userStyles.emptyCard}>
              <Ionicons name="watch-outline" size={40} color={colors.border} />
              <Text style={userStyles.emptyText}>
                Aún no has importado ningún reloj.
              </Text>
            </View>
          ) : (
            <View style={globalStyles.grid}>
              {myNfts.map((nft) => (
                <View key={nft.id} style={{ width: 210, overflow: 'visible', marginTop: 12, marginLeft: 12, marginBottom: 10 }}>
                  {nft.is_auction && nft.auction_data ? (
                    <AuctionCard
                      navigation={navigation}
                      auction={{
                        token_id: nft.id,
                        highest_bid: nft.auction_data.highest_bid,
                        min_price: nft.auction_data.min_price,
                        seconds_remaining: nft.auction_data.seconds_remaining,
                        seller_name: null,
                        watch: { image: nft.image, brand: nft.brand, model: nft.model },
                      }}
                    />
                  ) : (
                    <WatchCard
                      nft={nft}
                      removeNFT={removeNFT}
                      navigation={navigation}
                      isAdminView={false}
                      isBuyer={nft.is_buyer}
                      onRefresh={onRefresh}
                      walletConnected={!!walletAddress}
                    />
                  )}
                </View>
              ))}
            </View>
          )
        )}

        {activeTab === 'listed' && (
          listedNfts.length === 0 ? (
            <View style={userStyles.emptyCard}>
              <Ionicons name="pricetag-outline" size={40} color={colors.border} />
              <Text style={userStyles.emptyText}>No tienes relojes en venta actualmente.</Text>
            </View>
          ) : (
            <View style={globalStyles.grid}>
              {listedNfts.map((nft) => (
                <View key={nft.id} style={{ width: 200, overflow: 'visible', marginTop: 12, marginLeft: 12, marginBottom: 10 }}>
                  <WatchCard
                    nft={nft}
                    removeNFT={removeNFT}
                    navigation={navigation}
                    isAdminView={false}
                    isBuyer={nft.is_buyer}
                    onRefresh={onRefresh}
                    walletConnected={!!walletAddress}
                  />
                </View>
              ))}
            </View>
          )
        )}

        {isParticular && activeTab === 'bids' && (
          (!myBids || myBids.length === 0) ? (
            <View style={userStyles.emptyCard}>
              <Ionicons name="hammer-outline" size={40} color={colors.border} />
              <Text style={userStyles.emptyText}>No estás pujando en ninguna subasta.</Text>
            </View>
          ) : (
            <View style={globalStyles.grid}>
              {myBids.map((auction) => (
                <View key={auction.token_id} style={{ width: 210, overflow: 'visible', marginTop: 12, marginLeft: 12, marginBottom: 10 }}>
                  <AuctionCard
                    navigation={navigation}
                    auction={auction}
                  />
                </View>
              ))}
            </View>
          )
        )}

      </View>
    </View>
  );
}

const FILTER_CHIPS = [
  { key: 'all',     label: 'Todos',          icon: 'apps-outline' },
  { key: 'sale',    label: 'Venta directa',  icon: 'pricetag-outline' },
  { key: 'auction', label: 'Subastas',       icon: 'trending-up-outline' },
];

const SORT_OPTIONS = [
  { key: 'recent',     label: 'Reciente' },
  { key: 'price_asc',  label: 'Precio ↑' },
  { key: 'price_desc', label: 'Precio ↓' },
];

const HOW_IT_WORKS = [
  {
    icon: 'hardware-chip-outline', color: '#8b5cf6',
    title: 'Certificación NFC',
    desc: 'Cada reloj lleva un chip NFC único vinculado a su gemelo digital en la blockchain de Polygon.',
  },
  {
    icon: 'shield-checkmark-outline', color: '#10b981',
    title: 'Autenticidad garantizada',
    desc: 'El historial de propiedad es inmutable. Cualquier intento de falsificación queda registrado y bloqueado.',
  },
  {
    icon: 'wallet-outline', color: '#3b82f6',
    title: 'Pago seguro en USDC',
    desc: 'Los fondos quedan bloqueados en Escrow hasta que el comprador confirma la entrega del reloj.',
  },
];

export function MarketplaceWatchSection({ watches, navigation }) {
  const { width } = useWindowDimensions();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [sortBy, setSortBy]   = useState('recent');

  let cols = 2;
  if (width >= 1200) cols = 5;
  else if (width >= 960) cols = 4;
  else if (width >= 720) cols = 3;

  const getPrice = (w) =>
    w.auction_data
      ? (w.auction_data.highest_bid || w.auction_data.min_price || 0)
      : (w.listing_price_usdc || 0);

  const filtered = watches
    .filter(w => {
      if (filter === 'auction') return !!w.auction_data;
      if (filter === 'sale')    return !w.auction_data;
      return true;
    })
    .filter(w => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (w.brand        || '').toLowerCase().includes(q) ||
        (w.model        || '').toLowerCase().includes(q) ||
        (w.seller_name  || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc')  return getPrice(a) - getPrice(b);
      if (sortBy === 'price_desc') return getPrice(b) - getPrice(a);
      return 0;
    });

  const hasActiveFilters = search.trim() || filter !== 'all' || sortBy !== 'recent';

  const clearFilters = () => { setSearch(''); setFilter('all'); setSortBy('recent'); };

  return (
    <View style={{ flex: 1, paddingTop: 10 }}>

      {/* ── Barra de búsqueda ── */}
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: colors.backgroundAlt,
          borderRadius: 12, borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: 14, paddingVertical: 10,
        }}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={{
              flex: 1, color: colors.text, fontSize: 14,
              ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
            }}
            placeholder="Buscar por marca, modelo o vendedor..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filtros + Ordenación ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, marginBottom: 14,
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        {/* Chips de tipo */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {FILTER_CHIPS.map(chip => {
            const active = filter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 11, paddingVertical: 6,
                  borderRadius: 20, borderWidth: 1,
                  backgroundColor: active ? colors.primary + '1a' : 'transparent',
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Ionicons name={chip.icon} size={12} color={active ? colors.primary : colors.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: active ? '700' : '400', color: active ? colors.primary : colors.textSecondary }}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Ordenación */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {SORT_OPTIONS.map(opt => {
            const active = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSortBy(opt.key)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 20, borderWidth: 1,
                  backgroundColor: active ? colors.surface : 'transparent',
                  borderColor: active ? colors.borderLight : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, color: active ? colors.text : colors.textMuted, fontWeight: active ? '600' : '400' }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Contador de resultados ── */}
      {watches.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            {hasActiveFilters && filtered.length !== watches.length ? ` de ${watches.length}` : ''}
          </Text>
        </View>
      )}

      <FlatList
        key={`grid-${cols}`}
        data={filtered}
        keyExtractor={(item) => (item.token_id || item.id).toString()}
        numColumns={cols}
        columnWrapperStyle={{ justifyContent: 'flex-start', gap: 20 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 14 }}
        renderItem={({ item }) => (
          <View style={{ width: 210, marginBottom: 25 }}>
            {item.auction_data ? (
              <AuctionCard
                navigation={navigation}
                auction={{
                  token_id: item.token_id,
                  highest_bid: item.auction_data.highest_bid,
                  min_price: item.auction_data.min_price,
                  seconds_remaining: item.auction_data.seconds_remaining,
                  seller_name: item.seller_name,
                  watch: { image: item.image, brand: item.brand, model: item.model },
                }}
              />
            ) : (
              <PublicWatchCard nft={item} navigation={navigation} />
            )}
          </View>
        )}
        ListEmptyComponent={
          hasActiveFilters ? (
            /* Estado vacío — sin resultados para los filtros activos */
            <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 }}>
              <View style={{
                width: 60, height: 60, borderRadius: 30,
                backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.border,
                alignItems: 'center', justifyContent: 'center', marginBottom: 14,
              }}>
                <Ionicons name="search-outline" size={26} color={colors.textMuted} />
              </View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
                Sin resultados
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
                Ningún reloj coincide con tu búsqueda o filtros actuales.
              </Text>
              <TouchableOpacity
                onPress={clearFilters}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: colors.primary + '15',
                  borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '40',
                  paddingHorizontal: 16, paddingVertical: 8,
                }}
              >
                <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Limpiar filtros</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Estado vacío — marketplace sin listados */
            <View style={{ paddingTop: 10 }}>
              <View style={{
                marginBottom: 20, padding: 28,
                backgroundColor: colors.backgroundAlt,
                borderRadius: 16, borderWidth: 1, borderColor: colors.border,
                alignItems: 'center',
              }}>
                <View style={{
                  width: 60, height: 60, borderRadius: 30,
                  backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '30',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Ionicons name="storefront-outline" size={26} color={colors.primary} />
                </View>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
                  El marketplace está vacío por ahora
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                  Los primeros relojes certificados en blockchain aparecerán aquí.
                </Text>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                Cómo funciona AXIA
              </Text>
              {HOW_IT_WORKS.map(step => (
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
          )
        }
      />
    </View>
  );
}