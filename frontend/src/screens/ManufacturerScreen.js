import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, ScrollView,
  useWindowDimensions, Modal, TextInput, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import api, { getToken, WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import UserInfo from '../components/UserInfo';
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
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [activeTab, setActiveTab]     = useState('all');
  const [infoExpanded, setInfoExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [userRes, watchRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/nfts/my-collection'),
      ]);
      setLoggedUser(userRes.data);
      setWatches(watchRes.data.filter(w => !w.is_buyer));
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

  const stock  = watches.filter(w => !w.is_listed && w.marketplace_state < 2 && w.security_state !== 4);
  const listed = watches.filter(w => w.is_listed || w.marketplace_state >= 2);

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

          {/* Perfil — igual que el resto de dashboards */}
          <UserInfo
            noMargin
            loggedUser={loggedUser}
            showAlert={showAlert}
            onSettings={() => navigation.navigate('Configuracion')}
          />

          {/* Sección: configuración de la herramienta */}
          <ToolConfigSection
            loggedUser={loggedUser}
            expanded={infoExpanded}
            onToggle={() => setInfoExpanded(v => !v)}
            colors={colors}
          />

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
                <View style={{ width: cardWidth, overflow: 'visible' }}>
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

const AMOY_RPC   = 'https://rpc-amoy.polygon.technology';
const BACKEND_URL = 'https://axia-8ivf.onrender.com';

function ToolConfigSection({ loggedUser, expanded, onToggle, colors }) {
  const [copied, setCopied] = useState(null);

  const copy = async (key, value) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const rows = [
    { key: 'API_URL',             label: 'API_URL',             value: BACKEND_URL,                                                       secret: false },
    { key: 'RPC_URL',             label: 'RPC_URL',             value: AMOY_RPC,                                                          secret: false },
    { key: 'WATCH_NFT_ADDRESS',   label: 'WATCH_NFT_ADDRESS',   value: process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS   || '0x98663d8A262A9F8F92aCC349CD9f15f2010814b0', secret: false },
    { key: 'MARKETPLACE_ADDRESS', label: 'MARKETPLACE_ADDRESS', value: process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0x0b37B3C1A5e3ae541c0793eAd83975f683dA3aB5', secret: false },
    { key: 'USDC_ADDRESS',        label: 'USDC_ADDRESS',        value: process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS || '0x8612685dE8228E787378a984b8aee8bfad5CC550', secret: false },
    { key: 'wallet',              label: 'Tu wallet en AXIA',   value: loggedUser?.wallet_address || null,                                 secret: false, note: !loggedUser?.wallet_address ? 'No tienes wallet vinculada aún' : null },
  ];

  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 20 }}>
      <View style={{ height: 2, backgroundColor: colors.primary }} />

      {/* Cabecera colapsable */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="terminal-outline" size={18} color={colors.primaryLight} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
            Configuración de la herramienta
          </Text>
          <View style={{
            backgroundColor: `${colors.primary}20`, borderRadius: 10,
            paddingHorizontal: 7, paddingVertical: 2,
          }}>
            <Text style={{ color: colors.primaryLight, fontSize: 10, fontWeight: '700' }}>
              manufacturer_tool
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16} color={colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Contenido expandible */}
      {expanded && (
        <View style={{ backgroundColor: colors.backgroundAlt, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10, marginBottom: 14 }}>
            Introduce estos valores en la pantalla de <Text style={{ color: colors.primaryLight, fontWeight: '600' }}>Configuración</Text> de la herramienta de escritorio AXIA Manufacturer Tool.
            {'\n'}Tu <Text style={{ color: colors.primaryLight, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>PRIVATE_KEY</Text> y las claves de <Text style={{ color: colors.primaryLight }}>Pinata</Text> debes introducirlas tú en la misma pantalla (no se muestran aquí por seguridad).
          </Text>

          {rows.map(({ key, label, value, note }) => (
            <View key={key} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border,
              gap: 10,
            }}>
              <Text style={{
                color: colors.textSecondary, fontSize: 11, fontWeight: '600',
                width: 160, flexShrink: 0,
                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              }}>
                {label}
              </Text>
              <View style={{ flex: 1 }}>
                {value ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.text, fontSize: 11,
                      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                    }}
                  >
                    {value}
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontStyle: 'italic' }}>
                    {note}
                  </Text>
                )}
              </View>
              {value ? (
                <TouchableOpacity
                  onPress={() => copy(key, value)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 8, paddingVertical: 4,
                    backgroundColor: copied === key ? '#10b98120' : colors.surface,
                    borderRadius: 6, borderWidth: 1,
                    borderColor: copied === key ? '#10b98140' : colors.border,
                  }}
                >
                  <Ionicons
                    name={copied === key ? 'checkmark' : 'copy-outline'}
                    size={12}
                    color={copied === key ? '#10b981' : colors.textSecondary}
                  />
                  <Text style={{
                    fontSize: 10, fontWeight: '600',
                    color: copied === key ? '#10b981' : colors.textSecondary,
                  }}>
                    {copied === key ? 'Copiado' : 'Copiar'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {/* Aviso Pinata */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
            marginTop: 14, padding: 12,
            backgroundColor: `${'#f59e0b'}12`,
            borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b30',
          }}>
            <Ionicons name="key-outline" size={15} color="#f59e0b" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '600', marginBottom: 3 }}>
                Claves de Pinata (IPFS)
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17 }}>
                Necesitas <Text style={{ color: colors.text, fontWeight: '600' }}>PINATA_API_KEY</Text> y <Text style={{ color: colors.text, fontWeight: '600' }}>PINATA_SECRET_KEY</Text> para subir imágenes y metadatos a IPFS al mintear.{' '}
                Créate una cuenta gratuita en Pinata y genera tus claves desde el panel de API Keys.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://app.pinata.cloud/developers/api-keys')}
                style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name="open-outline" size={12} color={colors.primaryLight} />
                <Text style={{ color: colors.primaryLight, fontSize: 11, fontWeight: '600' }}>
                  Ir a Pinata API Keys
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
