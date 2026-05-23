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
import UserInfo from '../components/UserInfo';
import WatchCard from '../components/WatchCard';
import { useTheme } from '../context/ThemeContext';
import AlertModal, { useAlert } from '../components/AlertModal';

// Pantalla principal 
export default function ManufacturerScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = 200;
  const cols = Math.max(1, Math.floor((Math.min(width, 1200) - 32) / (cardWidth + 16)));

  const [loggedUser, setLoggedUser]   = useState(null);
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
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100, overflow: 'visible' }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: 'bold' }}>
              Panel de Fabricante
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') localStorage.clear();
                navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Login' }] });
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 10, paddingVertical: 6,
                backgroundColor: '#f43f5e18',
                borderRadius: 8, borderWidth: 1, borderColor: '#f43f5e40',
              }}
            >
              <Ionicons name="log-out-outline" size={15} color="#f43f5e" />
              <Text style={{ color: '#f43f5e', fontSize: 12, fontWeight: '600' }}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginHorizontal: -16, marginBottom: 22 }}>
            <UserInfo loggedUser={loggedUser} showAlert={showAlert} />
          </View>

          {/* Tarjetas de estadísticas */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
            <StatCard icon="cube-outline"     label="En Stock"       value={stock.length}   color="#10b981"         colors={colors} />
            <StatCard icon="pricetag-outline" label="En Venta"       value={listed.length}  color={colors.primary}  colors={colors} />
            <StatCard icon="warning-outline"  label="Alterados"      value={altered.length} color="#f43f5e"         colors={colors} />
            <StatCard icon="layers-outline"   label="Total Mintados" value={mintedCount}     color={colors.primaryLight} colors={colors} />
          </View>

          {/* Fila: nota + botón importar */}
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

          {/* Tabs de filtro */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
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

          {/* Lista de relojes */}
          {filteredWatches.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="watch-outline" size={56} color={colors.border} />
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>
                No hay relojes en esta categoría
              </Text>
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

//  Tarjeta de estadística
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
