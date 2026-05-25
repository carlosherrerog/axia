import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, ScrollView,
  useWindowDimensions, Modal, TextInput, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api, { getToken, WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import WatchCard from '../components/WatchCard';
import { useTheme } from '../context/ThemeContext';
import AlertModal, { useAlert } from '../components/AlertModal';

function getStoredUser() {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem('userData');
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}

export default function ManufacturerScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const cardWidth = 200;
  const cols = Math.max(1, Math.floor((Math.min(width, 1000) - 32) / (cardWidth + 16)));

  const [loggedUser, setLoggedUser]   = useState(getStoredUser);
  const [watches, setWatches]         = useState([]);
  const [mintedCount, setMintedCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [activeTab, setActiveTab]     = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [userRes, watchRes, countRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/nfts/my-collection'),
        api.get('/nfts/minted-count'),
      ]);
      setLoggedUser(userRes.data);
      setWatches(watchRes.data.filter(w => !w.is_buyer));
      setMintedCount(countRes.data.count);
    } catch (e) {
      console.error('Error cargando dashboard fabricante:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleWalletChange = useCallback((updatedUser) => {
    setLoggedUser(updatedUser);
  }, []);

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [tokenIdInput, setTokenIdInput]             = useState('');
  const [importing, setImporting]                   = useState(false);
  const [confirmAlert, setConfirmAlert]             = useState({ visible: false, title: '', message: '', onConfirm: null });

  const { alertProps, showAlert } = useAlert();

  const importNFT = async () => {
    if (!tokenIdInput.trim()) {
      showAlert('Atención', 'Introduce un ID de token válido.', 'warning');
      return;
    }
    try {
      setImporting(true);
      await api.post(`/nfts/import/${tokenIdInput.trim()}`);
      await fetchData();
      setImportModalVisible(false);
      setTokenIdInput('');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo importar el reloj.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const removeNFT = (tokenId) => {
    setConfirmAlert({
      visible: true,
      title: 'Ocultar reloj',
      message: '¿Quieres ocultar este reloj del dashboard? Seguirá siendo tuyo en la blockchain.',
      onConfirm: async () => {
        setConfirmAlert(s => ({ ...s, visible: false }));
        try {
          await api.delete(`/nfts/import/${tokenId}`);
          await fetchData();
        } catch (e) {
          showAlert('Error', 'No se pudo ocultar el reloj.', 'error');
        }
      },
    });
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    getToken().then(token => {
      ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
      ws.onmessage = (e) => { if (e.data === 'update_users') fetchData(); };
    });
    return () => ws?.close();
  }, [loggedUser?.id, fetchData]);

  const stock   = watches.filter(w => !w.is_listed && w.marketplace_state < 2 && w.security_state !== 4);
  const listed  = watches.filter(w => w.is_listed || w.marketplace_state >= 2);
  const altered = watches.filter(w => w.security_state === 4);

  const filteredWatches = activeTab === 'stock'  ? stock
                        : activeTab === 'listed' ? listed
                        : watches;

  const hasWatches = watches.length > 0;

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
        title="Panel Fabricante"
        onWalletChange={handleWalletChange}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{
          paddingHorizontal: isDesktop ? 24 : 16,
          paddingTop: isDesktop ? 24 : 16,
          paddingBottom: 100,
          maxWidth: isDesktop ? 1000 : undefined,
          alignSelf: 'center',
          width: '100%',
        }}>

          {/* Cabecera */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: 'bold' }}>
              Panel de Fabricante
            </Text>
            {loggedUser?.username ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {loggedUser.username}
              </Text>
            ) : null}
          </View>

          {/* Tarjetas de estadísticas */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatCard icon="cube-outline"     label="En Stock"       value={stock.length}   color="#10b981"             colors={colors} />
            <StatCard icon="pricetag-outline" label="En Venta"       value={listed.length}  color={colors.primary}      colors={colors} />
            <StatCard icon="warning-outline"  label="Alterados"      value={altered.length} color="#f43f5e"             colors={colors} />
            <StatCard icon="layers-outline"   label="Total Mintados" value={mintedCount}    color={colors.primaryLight} colors={colors} />
          </View>

          {/* Banner de minteo: solo cuando no hay relojes aún */}
          {!hasWatches && (
            <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: 20 }}>
              <View style={{
                flex: 1,
                backgroundColor: `${colors.primary}18`, borderRadius: 10,
                borderWidth: 1, borderColor: `${colors.primary}40`,
                padding: 14, flexDirection: 'row', alignItems: 'flex-start',
              }}>
                <Ionicons name="information-circle-outline" size={20} color={colors.primaryLight} style={{ marginRight: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.primaryLight, fontWeight: '600', fontSize: 13, marginBottom: 2 }}>
                    Minteo de Relojes
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                    Usa la herramienta de escritorio AXIA Manufacturer para mintear nuevos relojes con tu chip NFC.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setImportModalVisible(true)}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                  paddingHorizontal: 14, paddingVertical: 12,
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Ionicons name="download-outline" size={20} color={colors.primaryLight} />
                <Text style={{ color: colors.primaryLight, fontSize: 11, fontWeight: '600' }}>Importar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Fila de filtros + botón importar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              {[
                { key: 'all',    label: 'Todos' },
                { key: 'listed', label: 'En venta' },
                { key: 'stock',  label: 'Stock disponible' },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: activeTab === tab.key ? colors.primary : colors.surface,
                    borderWidth: 1, borderColor: activeTab === tab.key ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{
                    color: activeTab === tab.key ? '#FFF' : colors.textSecondary,
                    fontSize: 13, fontWeight: activeTab === tab.key ? '600' : '400',
                  }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {hasWatches && (
              <TouchableOpacity
                onPress={() => setImportModalVisible(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: `${colors.primary}18`,
                  borderRadius: 20, borderWidth: 1, borderColor: `${colors.primary}40`,
                  paddingHorizontal: 14, paddingVertical: 8,
                }}
              >
                <Ionicons name="download-outline" size={15} color={colors.primaryLight} />
                <Text style={{ color: colors.primaryLight, fontSize: 13, fontWeight: '600' }}>Importar</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Lista de relojes / estado vacío */}
          {filteredWatches.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: `${colors.primary}12`,
                borderWidth: 1, borderColor: `${colors.primary}25`,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Ionicons name="watch-outline" size={34} color={`${colors.primary}80`} />
              </View>
              {!hasWatches ? (
                <>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6 }}>
                    Aún no tienes relojes
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 20, marginBottom: 20 }}>
                    Importa tu primer reloj mintado para empezar a gestionar tu stock.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setImportModalVisible(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.primary,
                      borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12,
                    }}
                  >
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Importar primer reloj</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  No hay relojes en esta categoría
                </Text>
              )}
            </View>
          ) : (
            <FlatList
              key={`grid-${cols}`}
              data={filteredWatches}
              keyExtractor={w => w.id.toString()}
              numColumns={cols}
              scrollEnabled={false}
              columnWrapperStyle={cols > 1 ? { gap: 16, marginBottom: 16, overflow: 'visible' } : undefined}
              contentContainerStyle={cols === 1 ? { gap: 16, overflow: 'visible' } : undefined}
              renderItem={({ item: watch }) => (
                <View style={{ width: cardWidth, overflow: 'visible', marginTop: 12, marginLeft: 12 }}>
                  <WatchCard
                    nft={watch}
                    removeNFT={removeNFT}
                    navigation={navigation}
                    isAdminView={false}
                    onRefresh={fetchData}
                    isManufacturer={true}
                    walletConnected={!!loggedUser?.wallet_address}
                  />
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Modal importar reloj */}
      <Modal visible={importModalVisible} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 24,
            padding: 28, width: '88%', maxWidth: 380,
            borderWidth: 1, borderColor: colors.border,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 6, color: colors.text }}>
              Importar Reloj
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
              Introduce el ID del token blockchain que quieres añadir a tu dashboard.
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.surface, color: colors.text,
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 15, marginBottom: 20,
                borderWidth: 1, borderColor: colors.border,
                ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
              }}
              placeholder="ID del token (ej. 42)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={tokenIdInput}
              onChangeText={setTokenIdInput}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setImportModalVisible(false); setTokenIdInput(''); }}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center',
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={importNFT}
                disabled={importing}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center', backgroundColor: colors.primary }}
              >
                {importing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Importar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AlertModal {...alertProps} />
      <AlertModal
        visible={confirmAlert.visible}
        type="warning"
        title={confirmAlert.title}
        message={confirmAlert.message}
        confirmLabel="Ocultar"
        onConfirm={confirmAlert.onConfirm}
        cancelLabel="Cancelar"
        onCancel={() => setConfirmAlert(s => ({ ...s, visible: false }))}
      />
    </View>
  );
}

function StatCard({ icon, label, value, color, colors }) {
  return (
    <View style={{
      flex: 1, minWidth: 120,
      backgroundColor: colors.surface, borderRadius: 12,
      borderWidth: 1, borderColor: `${color}40`,
      padding: 14, alignItems: 'center',
      shadowColor: color, shadowOpacity: 0.2, shadowRadius: 6,
    }}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={{ color, fontSize: 22, fontWeight: 'bold', marginTop: 6 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}
