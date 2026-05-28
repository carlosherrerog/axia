// src/screens/UserDashboardScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Platform, Image, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useEthProvider } from '../wallet/useEthProvider';
import api, { getToken, WS_URL } from '../api/api.js';
import GlobalHeader from '../components/GlobalHeader';
import WatchSections from '../components/WatchSections';
import UserInfo from '../components/UserInfo';
import { useTheme } from '../context/ThemeContext';
import AlertModal, { useAlert } from '../components/AlertModal';
import WatchAuction_ABI from '../contracts/WatchAuction.json';
import WatchNFT_ABI     from '../contracts/WatchNFT.json';
import MockUSDC_ABI     from '../contracts/MockUSDC.json';
import { waitForTx, openMetaMask, GAS_OVERRIDES } from '../utils/txUtils';
import { isMobileWithoutWallet } from '../wallet/useEthProvider';

const AUCTION_ADDRESS = process.env.EXPO_PUBLIC_AUCTION_ADDRESS      || '0x701EAa91aeB8588694B116C004D1EaAC7f55F2F2';
const NFT_ADDRESS     = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS     || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F';
const USDC_ADDRESS    = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS || '0x967187957d31d0912aE57cad1B51F764339AaEe6';

const AUCTION_ERRORS = {
  '69b8d0fe': 'La subasta ya no está activa.',
  '64637389': 'La subasta aún no ha terminado.',
  'd02e774d': 'La subasta ya ha finalizado.',
  'a0d26eb6': 'La puja es demasiado baja. Debes superar la puja actual.',
  'ef025889': 'El vendedor no puede pujar en su propia subasta.',
  '82b42900': 'No estás autorizado para realizar esta acción.',
  '90b8ec18': 'Error en la transferencia de fondos. Revisa tu aprobación de USDC.',
  '00bfc921': 'El precio mínimo no es válido.',
  '30cd7471': 'No eres el propietario de este reloj.',
  '3ee5aeb5': 'Error de reentrancy. Inténtalo de nuevo.',
};

const decodeAuctionError = (error) => {
  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? '';
  if (typeof data === 'string' && data.startsWith('0x')) {
    const selector = data.slice(2, 10).toLowerCase();
    if (AUCTION_ERRORS[selector]) return AUCTION_ERRORS[selector];
  }
  if (error?.code === 'ACTION_REJECTED') return 'Has cancelado la transacción en tu wallet.';
  return null;
};

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Finalizada';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// Tarjeta compacta de subasta (vista dealer) 
function DealerAuctionCard({ auction, navigation, colors }) {
  const [remaining, setRemaining] = useState(auction.seconds_remaining);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const isExpired = remaining <= 0;

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('AuctionScreen', { tokenId: auction.token_id })}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.backgroundAlt,
        borderRadius: 14, borderWidth: 1,
        borderColor: isExpired ? '#f59e0b' : colors.border,
        padding: 12, marginBottom: 10, gap: 12,
      }}
    >
      <Image
        source={{ uri: auction.watch?.image || 'https://via.placeholder.com/60' }}
        style={{ width: 52, height: 52, borderRadius: 8 }}
        resizeMode="cover"
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
          {auction.watch?.brand} {auction.watch?.model}
        </Text>
        <Text style={{ color: '#10b981', fontSize: 13, marginTop: 2 }}>
          {auction.highest_bid > 0
            ? `Puja actual: ${auction.highest_bid.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`
            : `Mínimo: ${auction.min_price.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`}
        </Text>
        <Text style={{
          color: isExpired ? '#f59e0b' : remaining < 3600 ? '#f59e0b' : colors.textMuted,
          fontSize: 12, marginTop: 2,
        }}>
          {isExpired ? 'Tiempo agotado — toca para finalizar' : `Tiempo: ${formatCountdown(remaining)}`}
        </Text>
      </View>
      <Ionicons
        name={isExpired ? 'flag-outline' : 'chevron-forward-outline'}
        size={16}
        color={isExpired ? '#f59e0b' : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

//  Tarjeta de puja activa (vista como postor) 
function ActiveBidCard({ auction, navigation, colors }) {
  const [remaining, setRemaining] = useState(auction.seconds_remaining);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('AuctionScreen', { tokenId: auction.token_id })}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.backgroundAlt,
        borderRadius: 14, borderWidth: 1, borderColor: `${colors.primary}40`,
        padding: 12, marginBottom: 10, gap: 12,
      }}
    >
      <Image
        source={{ uri: auction.watch?.image || 'https://via.placeholder.com/60' }}
        style={{ width: 52, height: 52, borderRadius: 8 }}
        resizeMode="cover"
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
          {auction.watch?.brand} {auction.watch?.model}
        </Text>
        <Text style={{ color: colors.primary, fontSize: 13, marginTop: 2 }}>
          Tu puja: {auction.highest_bid.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
        </Text>
        <Text style={{ color: remaining <= 0 ? colors.textMuted : colors.textSecondary, fontSize: 12, marginTop: 2 }}>
          {remaining <= 0 ? 'Subasta finalizada' : `Tiempo: ${formatCountdown(remaining)}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={{
          backgroundColor: `${colors.primary}20`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>LÍDER</Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

//  Pantalla principal
function getStoredUser() {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem('userData');
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}

export default function UserDashboardScreen({ route, navigation }) {
  const { ethProvider, getConnectedSigner } = useEthProvider();
  const user = route?.params?.userData || getStoredUser() || {};
  const { colors } = useTheme();

  // Estado general
  const [loggedUser, setLoggedUser]       = useState(user);
  const [myNfts, setMyNfts]               = useState([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [tokenIdInput, setTokenIdInput]   = useState('');
  const [importing, setImporting]         = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [confirmCallback, setConfirmCallback] = useState(null);
  const [confirmBtnText, setConfirmBtnText]   = useState('Confirmar');
  const [activeTab, setActiveTab]         = useState('coleccion');

  // Estado de subastas (dealers y particulares)
  const [myAuctions, setMyAuctions]       = useState([]);
  const [allAuctions, setAllAuctions]     = useState([]);
  const [myBids, setMyBids]               = useState([]);
  const [auctionsLoading, setAuctionsLoading] = useState(false);
  const [txLoading, setTxLoading]         = useState(false);
  const [createModal, setCreateModal]     = useState(false);
  const [availableWatches, setAvailableWatches] = useState([]);
  const [selectedWatch, setSelWatch]      = useState(null);
  const [minPrice, setMinPrice]           = useState('');
  const [duration, setDuration]           = useState('3600');

  const { alertProps, showAlert, hideAlert } = useAlert();
  const [confirmAlert, setConfirmAlert]   = useState({ visible: false, title: '', message: '' });

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isDealer = loggedUser?.roles?.includes('DEALER');
  const hPad = isDesktop ? Math.max(24, Math.floor((width - 1000) / 2)) : 16;

  const showConfirm = (title, message, onConfirmCallback, btnText = 'Confirmar') => {
    setConfirmCallback(() => onConfirmCallback);
    setConfirmBtnText(btnText);
    setConfirmAlert({ visible: true, title, message });
  };

  // Fetch colección
  const fetchMyCollection = useCallback(async () => {
    try {
      const resNfts = await api.get('/nfts/my-collection');
      setMyNfts(resNfts.data);
    } catch (error) {
      console.error('Error consultando relojes importados', error);
    }
  }, []);

  // Fetch subastas
  const fetchAuctions = useCallback(async () => {
    setAuctionsLoading(true);
    try {
      const [myRes, allRes, colRes] = await Promise.all([
        api.get('/auctions/my'),
        api.get('/auctions'),
        api.get('/nfts/my-collection'),
      ]);
      setMyAuctions(myRes.data);
      setAllAuctions(allRes.data);
      setAvailableWatches(colRes.data.filter(w => !w.is_buyer && !w.is_listed));
    } catch (error) {
      console.error('Error cargando subastas', error);
    } finally {
      setAuctionsLoading(false);
    }
  }, []);

  // Fetch subastas donde el usuario ha pujado 
  const fetchMyBids = useCallback(async () => {
    setAuctionsLoading(true);
    try {
      const allRes = await api.get('/auctions');
      const bids = allRes.data.filter(auction =>
        auction.highest_bidder?.toLowerCase() === loggedUser?.wallet_address?.toLowerCase()
      );
      setMyBids(bids);
    } catch (error) {
      console.error('Error cargando mis pujas', error);
    } finally {
      setAuctionsLoading(false);
    }
  }, [loggedUser?.wallet_address]);

  const fetchInitialData = useCallback(async () => {
    try {
      const resUser = await api.get('/users/me');
      setLoggedUser(resUser.data);
      const isDealerUser = resUser.data?.roles?.includes('DEALER');
      if (isDealerUser) {
        await Promise.all([fetchMyCollection(), fetchAuctions()]);
      } else {
        await fetchMyCollection();
        if (resUser.data?.wallet_address) {
          const allRes = await api.get('/auctions');
          const bids = allRes.data.filter(a =>
            a.highest_bidder?.toLowerCase() === resUser.data.wallet_address.toLowerCase()
          );
          setMyBids(bids);
        }
      }
    } catch (error) {
      console.error('Error cargando datos iniciales', error);
    }
  }, [fetchMyCollection, fetchAuctions]);

  useEffect(() => {
    fetchInitialData();
    let ws = null;
    if (loggedUser?.id) {
      getToken().then(token => {
        ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'update_auction' || event.data === 'update_marketplace') {
              fetchMyCollection();
              if (isDealer) fetchAuctions();
            } else if (event.data === 'update_users' || event.data === 'update_marketplace') {
              fetchMyCollection();
            }
          } catch {
            if (event.data === 'update_users' || event.data === 'update_marketplace') fetchMyCollection();
          }
        };
      });
    }
    return () => { if (ws) ws?.close(); };
  }, [fetchInitialData, loggedUser?.id]);

  // Refrescar subastas al volver de AuctionScreen (foco recuperado)
  // No se dispara al cambiar de tab porque los datos ya vienen de fetchInitialData

  useFocusEffect(useCallback(() => {
    fetchMyCollection();
    if (isDealer && activeTab === 'subastas') fetchAuctions();
    if (!isDealer && activeTab === 'subastas') fetchMyBids();
  }, [isDealer, activeTab, fetchAuctions, fetchMyBids, fetchMyCollection]));

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchInitialData();
      if (isDealer && activeTab === 'subastas') await fetchAuctions();
      if (!isDealer && activeTab === 'subastas') await fetchMyBids();
    } catch (error) {
      console.error('Error al refrescar:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  const handleWalletChange = async (updatedUser) => {
    setLoggedUser(updatedUser);
    await fetchMyCollection();
  };

  // Importar / ocultar reloj
  const importNFT = async () => {
    if (!tokenIdInput.trim()) {
      showAlert('Atención', 'Debes introducir un ID válido.', 'warning');
      return;
    }
    try {
      setImporting(true);
      await api.post(`/nfts/import/${tokenIdInput}`);
      await fetchMyCollection();
      setImportModalVisible(false);
      setTokenIdInput('');
    } catch (error) {
      const msg = error.response?.data?.detail || 'No se pudo importar el NFT.';
      showAlert('No autorizado', msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  const removeNFT = (tokenId) => {
    const executeRemove = async () => {
      try {
        await api.delete(`/nfts/import/${tokenId}`);
        await fetchMyCollection();
      } catch {
        showAlert('Error', 'No se pudo ocultar el reloj.', 'error');
      }
    };
    showConfirm(
      'Ocultar Reloj',
      '¿Seguro que quieres ocultarlo de tu galería? Seguirá siendo tuyo en la blockchain.',
      executeRemove,
      'Ocultar'
    );
  };

  //  Crear subasta 
  const handleCreateAuction = async () => {
    if (!selectedWatch) { showAlert('Error', 'Selecciona un reloj.', 'error'); return; }
    const price = parseFloat(minPrice);
    const dur   = parseInt(duration, 10);
    if (isNaN(price) || price <= 0) { showAlert('Error', 'Precio mínimo inválido.', 'error'); return; }
    if (isNaN(dur)   || dur   <= 0) { showAlert('Error', 'Duración inválida.', 'error');       return; }
    if (isMobileWithoutWallet()) { showAlert('Billetera no detectada', 'Prueba desde el ordenador con MetaMask instalado, o instala la app en Android.', 'warning'); return; }
    if (!ethProvider) { showAlert('Error', 'Necesitas una wallet conectada.', 'error'); return; }

    try {
      setTxLoading(true);
      setCreateModal(false);

      const signer    = await getConnectedSigner();
      const nft       = new ethers.Contract(NFT_ADDRESS, WatchNFT_ABI.abi, signer);
      const auctionCt = new ethers.Contract(AUCTION_ADDRESS, WatchAuction_ABI.abi, signer);
      const priceWei  = ethers.parseUnits(String(price), 6);

      const approveTxP = nft.approve(AUCTION_ADDRESS, selectedWatch.id, GAS_OVERRIDES);
      openMetaMask();
      const approveTx = await approveTxP;
      await waitForTx(approveTx);

      const createTxP = auctionCt.createAuction(selectedWatch.id, priceWei, dur, GAS_OVERRIDES);
      openMetaMask();
      const createTx = await createTxP;
      await waitForTx(createTx);

      await api.post(`/auctions/${selectedWatch.id}/create`, {
        min_price_usdc: price,
        duration_seconds: dur,
      });

      showAlert('¡Subasta creada!', `Subasta para ${selectedWatch.brand} ${selectedWatch.model} activa.`, 'success');
      setMinPrice(''); setDuration('3600'); setSelWatch(null);
      fetchAuctions();
      fetchMyCollection();
    } catch (error) {
      const msg = decodeAuctionError(error) ?? error.response?.data?.detail ?? 'No se pudo crear la subasta.';
      showAlert('Error al crear subasta', msg, 'error');
    } finally {
      setTxLoading(false);
    }
  };

  //  Mis pujas activas (filtradas del feed público)
  const myActiveBids = allAuctions.filter(
    a => a.highest_bidder?.toLowerCase() === loggedUser?.wallet_address?.toLowerCase()
  );

  const inputStyle = {
    backgroundColor: colors.surface, color: colors.text,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, width: '100%', marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      <GlobalHeader
        loggedUser={loggedUser}
        title="Mi Perfil"
        navigation={navigation}
        onWalletChange={handleWalletChange}
        showHamburger
      />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Banner de perfil — ancho completo ── */}
        <View style={{ paddingHorizontal: hPad, paddingTop: 16 }}>
          <UserInfo
            noMargin
            loggedUser={loggedUser}
            showAlert={showAlert}
            onSettings={() => navigation.navigate('Configuracion')}
          />
        </View>

        {/* ── Tabs dealer (pills horizontales) ── */}
        {isDealer && (
          <View style={{
            flexDirection: 'row', marginHorizontal: hPad, marginTop: 12, marginBottom: 4,
            backgroundColor: colors.surface,
            borderRadius: 12, borderWidth: 1, borderColor: colors.border,
            padding: 4, alignSelf: 'flex-start',
          }}>
            {[
              { key: 'coleccion', label: 'Colección', icon: 'grid-outline' },
              { key: 'subastas',  label: 'Subastas',  icon: 'hammer-outline' },
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, gap: 5,
                  backgroundColor: activeTab === tab.key ? colors.primary : 'transparent',
                }}
              >
                <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#fff' : colors.textSecondary} />
                <Text style={{ color: activeTab === tab.key ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Tab: Colección ── */}
        {(!isDealer || activeTab === 'coleccion') && (
          <WatchSections
            myNfts={myNfts}
            walletAddress={loggedUser.wallet_address}
            userRoles={loggedUser.roles}
            onOpenImportModal={() => setImportModalVisible(true)}
            removeNFT={removeNFT}
            navigation={navigation}
            onRefresh={handleManualRefresh}
            refreshing={refreshing}
            myBids={myBids}
          />
        )}

        {/* ── Tab: Subastas (solo dealers) ── */}
        {isDealer && activeTab === 'subastas' && (
          <View style={{ paddingHorizontal: hPad, paddingBottom: 40, paddingTop: 16 }}>
            {auctionsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                {/* Mis subastas */}
                <View style={{
                  backgroundColor: colors.backgroundAlt,
                  borderRadius: 16, borderWidth: 1, borderColor: colors.border,
                  overflow: 'hidden', marginBottom: 16,
                }}>
                  <View style={{ height: 2, backgroundColor: '#f59e0b' }} />
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderBottomWidth: myAuctions.length > 0 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: 8,
                      backgroundColor: '#f59e0b18', borderWidth: 1, borderColor: '#f59e0b40',
                      alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    }}>
                      <Ionicons name="hammer-outline" size={15} color="#f59e0b" />
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
                      Mis subastas
                    </Text>
                    {myAuctions.length > 0 && (
                      <View style={{
                        backgroundColor: '#f59e0b20', borderRadius: 20,
                        paddingHorizontal: 9, paddingVertical: 3, marginRight: 10,
                        borderWidth: 1, borderColor: '#f59e0b40',
                      }}>
                        <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>
                          {myAuctions.length} activa{myAuctions.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => setCreateModal(true)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: '#f59e0b15', borderRadius: 9,
                        paddingHorizontal: 10, paddingVertical: 6,
                        borderWidth: 1, borderColor: '#f59e0b35',
                      }}
                    >
                      <Ionicons name="add" size={14} color="#f59e0b" />
                      <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 12 }}>Nueva</Text>
                    </TouchableOpacity>
                  </View>

                  {myAuctions.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                      <Ionicons name="hourglass-outline" size={34} color={colors.border} style={{ marginBottom: 8 }} />
                      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
                        No tienes subastas activas
                      </Text>
                      <TouchableOpacity
                        onPress={() => setCreateModal(true)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: '#f59e0b15', borderRadius: 10,
                          paddingHorizontal: 16, paddingVertical: 9,
                          borderWidth: 1, borderColor: '#f59e0b35',
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={15} color="#f59e0b" />
                        <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 13 }}>Crear primera subasta</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ padding: 12 }}>
                      {myAuctions.map(a => (
                        <DealerAuctionCard key={a.token_id} auction={a} navigation={navigation} colors={colors} />
                      ))}
                    </View>
                  )}
                </View>

                {/* Mis pujas */}
                <View style={{
                  backgroundColor: colors.backgroundAlt,
                  borderRadius: 16, borderWidth: 1, borderColor: colors.border,
                  overflow: 'hidden',
                }}>
                  <View style={{ height: 2, backgroundColor: colors.primary }} />
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderBottomWidth: myActiveBids.length > 0 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: 8,
                      backgroundColor: `${colors.primary}18`, borderWidth: 1, borderColor: `${colors.primary}40`,
                      alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    }}>
                      <Ionicons name="trending-up-outline" size={15} color={colors.primary} />
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
                      Mis pujas
                    </Text>
                    {myActiveBids.length > 0 && (
                      <View style={{
                        backgroundColor: `${colors.primary}20`, borderRadius: 20,
                        paddingHorizontal: 9, paddingVertical: 3,
                        borderWidth: 1, borderColor: `${colors.primary}40`,
                      }}>
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
                          {myActiveBids.length} activa{myActiveBids.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                  </View>

                  {myActiveBids.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
                      <Ionicons name="trending-up-outline" size={34} color={colors.border} style={{ marginBottom: 8 }} />
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        No tienes pujas activas
                      </Text>
                    </View>
                  ) : (
                    <View style={{ padding: 12 }}>
                      {myActiveBids.map(a => (
                        <ActiveBidCard key={a.token_id} auction={a} navigation={navigation} colors={colors} />
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        )}

      </ScrollView>

      {/* Overlay de transacción */}
      <Modal visible={txLoading} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
          justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 20,
            padding: 32, alignItems: 'center', gap: 16,
            borderWidth: 1, borderColor: colors.border, minWidth: 260,
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Esperando firma…</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13 }}>
              Confirma la transacción en tu wallet para continuar.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal crear subasta */}
      <Modal visible={createModal} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{
              backgroundColor: colors.backgroundAlt, borderRadius: 28, padding: 28,
              width: '100%', maxWidth: 480, alignSelf: 'center', alignItems: 'center',
              borderWidth: 1, borderColor: colors.border,
              ...(Platform.OS === 'web' && { boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }),
            }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: `${colors.primary}15`,
                borderWidth: 1.5, borderColor: `${colors.primary}30`,
                justifyContent: 'center', alignItems: 'center', marginBottom: 16,
              }}>
                <Ionicons name="hammer-outline" size={30} color={colors.primary} />
              </View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginBottom: 20 }}>
                Nueva Subasta
              </Text>

              <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'flex-start', marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                SELECCIONA UN RELOJ
              </Text>
              {availableWatches.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
                  No tienes relojes disponibles sin anuncio activo.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, width: '100%' }}>
                  {availableWatches.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      onPress={() => setSelWatch(w)}
                      style={{
                        marginRight: 10, padding: 8, borderRadius: 12, borderWidth: 2,
                        borderColor: selectedWatch?.id === w.id ? colors.primary : colors.border,
                        backgroundColor: selectedWatch?.id === w.id ? `${colors.primary}20` : colors.surface,
                        alignItems: 'center', width: 100,
                      }}
                    >
                      <Image
                        source={{ uri: w.image || 'https://via.placeholder.com/60' }}
                        style={{ width: 60, height: 60, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: colors.text, fontSize: 11, marginTop: 4 }} numberOfLines={1}>{w.brand}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 10 }} numberOfLines={1}>{w.model}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'flex-start', marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                PRECIO MÍNIMO (USDC)
              </Text>
              <TextInput
                value={minPrice}
                onChangeText={setMinPrice}
                keyboardType="decimal-pad"
                placeholder="Ej: 5000"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />

              <Text style={{ color: colors.textSecondary, fontSize: 12, alignSelf: 'flex-start', marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
                DURACIÓN
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                {[
                  { label: '2 min',    value: '120'    },
                  { label: '5 min',    value: '300'    },
                  { label: '1 hora',   value: '3600'   },
                  { label: '12 horas', value: '43200'  },
                  { label: '1 día',    value: '86400'  },
                  { label: '3 días',   value: '259200' },
                  { label: '7 días',   value: '604800' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setDuration(opt.value)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: duration === opt.value ? colors.primary : colors.surface,
                      borderWidth: 1, borderColor: duration === opt.value ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: duration === opt.value ? '#FFF' : colors.textSecondary, fontSize: 13 }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity
                  onPress={() => { setCreateModal(false); setSelWatch(null); setMinPrice(''); }}
                  style={{
                    flex: 1, paddingVertical: 13, borderRadius: 24, alignItems: 'center',
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateAuction}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 24, alignItems: 'center', backgroundColor: colors.primary }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Crear</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal importar reloj  */}
      <Modal visible={importModalVisible} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 24, padding: 28,
            width: '88%', maxWidth: 380, borderWidth: 1, borderColor: colors.border,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: colors.text }}>
              Importar Reloj
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.surface, color: colors.text, borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20,
                borderWidth: 1, borderColor: colors.border,
                ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
              }}
              placeholder="ID del token"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={tokenIdInput}
              onChangeText={setTokenIdInput}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setImportModalVisible(false)}
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

      {/* Modales de alerta y confirmación */}
      <AlertModal {...alertProps} />
      <AlertModal
        visible={confirmAlert.visible}
        type="warning"
        title={confirmAlert.title}
        message={confirmAlert.message}
        confirmLabel={confirmBtnText}
        onConfirm={() => { setConfirmAlert(s => ({ ...s, visible: false })); confirmCallback?.(); }}
        cancelLabel="Cancelar"
        onCancel={() => setConfirmAlert(s => ({ ...s, visible: false }))}
      />
    </View>
  );
}
