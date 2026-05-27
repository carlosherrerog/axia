// src/screens/PublicWatchScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers'; 
import api, { WS_URL } from '../api/api.js';
import { useEthProvider } from '../wallet/useEthProvider';
import { colors, watchScreenStyles, alertColors, globalStyles, alertStyles, WATCH_STATES, roleColors } from '../themes/styles.js';
import { resolveImageUri } from '../utils/ipfs';
import GlobalHeader from '../components/GlobalHeader';
import WatchHistoryTab from '../components/WatchHistoryTab';
import WatchDetailsTab from '../components/WatchDetailsTab';
import { useScrollAware, HEADER_HEIGHT } from '../hooks/useScrollAware';

const NFT_ADDRESS                = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS          || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F';
const MARKETPLACE_ADDRESS        = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS         || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';
const AUCTION_ADDRESS            = process.env.EXPO_PUBLIC_AUCTION_ADDRESS             || '0x701EAa91aeB8588694B116C004D1EaAC7f55F2F2';
const USDC_ADDRESS               = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS       || '0x967187957d31d0912aE57cad1B51F764339AaEe6';
const SIGNATURE_VERIFIER_ADDRESS = process.env.EXPO_PUBLIC_SIGNATURE_VERIFIER_ADDRESS  || '0x57057749e6aF1b21070FA2A4e5D4359AA2711735';
const POLYGONSCAN_BASE           = 'https://amoy.polygonscan.com';

// ABIs necesarios
const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)"
];
const MARKETPLACE_ABI = ["function buyWatchEscrow(uint256 tokenId) external"];

export default function PublicWatchScreen({ route, navigation }) {
  const { watchId, initialTab = 'details' } = route.params || {};
  const { width } = useWindowDimensions();
  const { ethProvider } = useEthProvider();
  const { onScroll, headerTranslate } = useScrollAware();

  // ESTADOS
  const [activeTab, setActiveTab] = useState(initialTab);
  const [watchData, setWatchData] = useState(null);
  const [listingData, setListingData] = useState(null);
  const [loggedUser, setLoggedUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ESTADOS HISTORIAL
  const [appUsers, setAppUsers] = useState([]);

  // ESTADOS IMAGEN (tilt web)
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHoveringImg, setIsHoveringImg] = useState(false);

  // ESTADOS DE UI Y COMPRA
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [customAlert, setCustomAlert] = useState({
    visible: false, title: '', message: '', type: 'error'
  });

  // HELPERS DE ALERTA
  const showAlert = (title, message, type = 'error') => {
    setCustomAlert({ visible: true, title, message, type });
  };
  const hideAlertLocal = () => setCustomAlert({ ...customAlert, visible: false });

  // HELPER BLOCKCHAIN: CONSULTAR SALDO
  const getBalanceInWei = async () => {
    if (typeof ethProvider === 'undefined') throw new Error("Wallet no detectada");
    const provider = new ethers.BrowserProvider(ethProvider);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    return await usdcContract.balanceOf(loggedUser.wallet_address);
  };

  const fetchLoggedUser = async () => {
    try {
      const res = await api.get('/users/me');
      setLoggedUser(res.data);
    } catch (e) { console.error("Error obteniendo usuario", e); }
  };

  const fetchWatchPublicDetails = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const res = await api.get(`/public/nfts/${watchId}`);
      const resListing = await api.get(`/public/nfts/${watchId}/listing`);

      setWatchData(res.data);
      setListingData(resListing.data);

    } catch (error) {
      console.error("Error obteniendo datos públicos:", error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [watchId]);

  // Cargar usuarios para "Ver perfil" en historial
  useEffect(() => {
    if (activeTab !== 'history') return;
    api.get('/users').then(r => setAppUsers(r.data)).catch(() => {});
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      fetchLoggedUser();
      fetchWatchPublicDetails(false);

      const ws = new WebSocket(`${WS_URL}/ws/admin`);
      ws.onmessage = (event) => {
        if (event.data === "update_marketplace" || event.data === "update_nfts") {
          fetchWatchPublicDetails(true);
        }
      };
      return () => ws.close();
    }, [fetchWatchPublicDetails])
  );

  // --- HANDLERS DE ACCIÓN ---

  const handleBuyClick = async () => {
    if (loggedUser?.id === watchData?.owner_id) {
      return showAlert("Acción no permitida", "No puedes comprar tu propio activo.");
    }

    try {
      setIsProcessingPurchase(true);
      const balance = await getBalanceInWei();

      const priceWei = ethers.parseUnits((Number(listingData.price) / 1000000).toString(), 6);

      if (balance < priceWei) {
        setIsProcessingPurchase(false);
        const neededFormatted = ethers.formatUnits(priceWei, 6);
        const balanceFormatted = ethers.formatUnits(balance, 6);
        return showAlert("Saldo Insuficiente", `Necesitas ${neededFormatted} USDC pero tienes ${balanceFormatted} USDC.`);
      }

      setIsProcessingPurchase(false);
      setBuyModalVisible(true); 
    } catch (error) {
      setIsProcessingPurchase(false);
      showAlert("Error", "No se pudo verificar el saldo.");
    }
  };

  const confirmPurchase = async () => {
    setBuyModalVisible(false);
    setIsProcessingPurchase(true);

    // — BLOCKCHAIN (approve + buy) —
    try {
      const provider = new ethers.BrowserProvider(ethProvider);
      const signer = await provider.getSigner();
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
      const priceWei = ethers.parseUnits((Number(listingData.price) / 1000000).toString(), 6);

      const approveTx = await usdcContract.approve(MARKETPLACE_ADDRESS, priceWei);
      await approveTx.wait();

      const buyTx = await marketplace.buyWatchEscrow(watchId);
      await buyTx.wait();
    } catch (error) {
      if (error?.code === 'ACTION_REJECTED') {
        showAlert("Cancelado", "Has rechazado la transacción en tu wallet.");
      } else if (error?.message) {
        showAlert("Error", error.message);
      } else {
        showAlert("Error", "La transacción blockchain falló.");
      }
      setIsProcessingPurchase(false);
      return;
    }

    // — BACKEND con reintentos —
    let backendOk = false;
    for (let i = 0; i < 3; i++) {
      try {
        await api.post(`/marketplace/buy/${watchId}`);
        backendOk = true;
        break;
      } catch {
        if (i < 2) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
    }

    setIsProcessingPurchase(false);

    if (backendOk) {
      showAlert("¡Éxito!", "Compra realizada con éxito. El vendedor recibirá una notificación.", "success");
      setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] }), 2000);
    } else {
      showAlert("Atención", `La compra se procesó en blockchain pero no pudimos registrarla en la base de datos. Contacta con soporte (token #${watchId}).`, "warning");
    }
  };
  
  if (loading || !watchData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isListed = listingData && (listingData.is_listed === 1 || listingData.is_listed === true);
  const isEscrowed = listingData && listingData.listing_state >= 2;
  const displayPrice = isListed && listingData.price 
    ? (Number(listingData.price) / 1000000).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) 
    : null;

  const ownerData = {
    id: watchData.owner_id,
    username: watchData.seller_name || 'Usuario',
    wallet_address: watchData.owner_wallet || '0x0000000000000000000000000000000000000000'
  };

  const isManufacturer = loggedUser?.roles?.includes('FABRICANTE');
  const sellerRoles = Array.isArray(watchData?.seller_roles) ? watchData.seller_roles : [];
  const sellerIsManufacturer = sellerRoles.includes('FABRICANTE');
  // Vendedor de confianza: fabricante, dealer, o listingData.is_p2p=false (fallback fiable)
  const sellerIsTrusted = sellerIsManufacturer || sellerRoles.includes('DEALER') || listingData?.is_p2p === false;
  const currentStateId = watchData?.security_state || 0;
  const currentStateInfo = WATCH_STATES[currentStateId] || WATCH_STATES[0];
  const isSecurityBlocked = currentStateId === 1 || currentStateId === 2;
  const isAltered = currentStateId === 4;

  const handleImgMouseMove = Platform.OS === 'web' ? (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientY - rect.top)  / rect.height - 0.5) * -22;
    const y = ((e.clientX - rect.left) / rect.width  - 0.5) *  22;
    setTilt({ x, y });
  } : null;

  const handleImgMouseLeave = Platform.OS === 'web' ? () => {
    setTilt({ x: 0, y: 0 });
    setIsHoveringImg(false);
  } : null;

  const hasWallet = !!loggedUser?.wallet_address;
  const priceNum  = listingData?.price ? Number(listingData.price) / 1_000_000 : 0;
  const buySection = (isListed && !isEscrowed && loggedUser && loggedUser.id !== watchData?.owner_id) ? (
    <View style={{ marginBottom: 25 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cart-outline" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Opciones de compra</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
            {sellerIsTrusted ? 'Vendedor verificado · Sin peritaje' : 'Venta entre particulares · Con peritaje'}
          </Text>
        </View>
        {sellerIsTrusted ? (
          <View style={{ backgroundColor: '#10b98118', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#10b98140' }}>
            <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>
              {sellerIsManufacturer ? 'FABRICANTE' : 'DEALER'}
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#f59e0b18', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#f59e0b40' }}>
            <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>PARTICULAR</Text>
          </View>
        )}
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Precio de venta</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 24 }}>
            {displayPrice} <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>USDC</Text>
          </Text>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cash-outline" size={20} color={colors.primary} />
        </View>
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 10 }}>Resumen de la compra</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Total a pagar</Text>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
            {priceNum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC
          </Text>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons
            name={listingData?.is_p2p ? 'shield-checkmark-outline' : 'checkmark-circle-outline'}
            size={13}
            color={listingData?.is_p2p ? colors.textMuted : '#10b981'}
          />
          <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>
            {listingData?.is_p2p
              ? 'Un relojero certificado verificará el reloj antes de que lo recibas'
              : 'Envío directo · Sin peritaje · Sin cargos adicionales para el comprador'}
          </Text>
        </View>
      </View>
      {!hasWallet && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="wallet-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>Conecta tu wallet para poder comprar u ofertar</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: hasWallet ? colors.primary : colors.surface, borderRadius: 14,
            paddingVertical: 14,
            borderWidth: hasWallet ? 0 : 1, borderColor: colors.border,
            opacity: hasWallet ? 1 : 0.5,
          }}
          onPress={hasWallet ? handleBuyClick : undefined}
          disabled={!hasWallet}
        >
          <Ionicons name="cart-outline" size={18} color={hasWallet ? '#fff' : colors.textMuted} />
          <Text style={{ color: hasWallet ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 15 }}>Comprar</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        title="Ficha Técnica"
        navigation={navigation}
        onWalletChange={setLoggedUser}
        onWalletDisconnect={() => navigation.navigate('Marketplace')}
        translateAnim={headerTranslate}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: HEADER_HEIGHT }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={{ paddingVertical: 20, paddingHorizontal: width >= 768 ? 24 : 16, maxWidth: 1000, alignSelf: 'center', width: '100%' }}>
          
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, marginLeft: 8, fontWeight: 'bold' }}>Volver</Text>
          </TouchableOpacity>

          {/* ── IMAGEN Y PESTAÑAS ── */}
          <View style={[
            watchScreenStyles.contentCard,
            { padding: 0, overflow: 'hidden', marginBottom: 20 },
            isSecurityBlocked && {
              borderColor: currentStateInfo.color,
              borderWidth: 2,
              shadowColor: currentStateInfo.color,
              shadowOpacity: 0.35,
              shadowRadius: 16,
            },
          ]}>
            {isSecurityBlocked && (
              <View style={{
                backgroundColor: currentStateInfo.color + '22',
                borderBottomWidth: 1, borderBottomColor: currentStateInfo.color + '60',
                paddingVertical: 10, paddingHorizontal: 16,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Ionicons name={currentStateInfo.icon} size={16} color={currentStateInfo.color} />
                <Text style={{ color: currentStateInfo.color, fontWeight: '700', fontSize: 13, letterSpacing: 0.4 }}>
                  {currentStateInfo.label.toUpperCase()}
                </Text>
                <Text style={{ color: currentStateInfo.color + 'cc', fontSize: 12, flex: 1 }}>
                  — {currentStateInfo.desc}
                </Text>
              </View>
            )}

            {/* ── NOMBRE DEL MODELO ── */}
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                {watchData?.brand || ''}
              </Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 24 }}>
                {watchData?.model || 'Modelo'}
              </Text>
            </View>

            {Platform.OS === 'web' ? (
              <div
                onMouseMove={handleImgMouseMove}
                onMouseEnter={() => setIsHoveringImg(true)}
                onMouseLeave={handleImgMouseLeave}
                style={{
                  height: 260, backgroundColor: colors.surface,
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  perspective: '900px', position: 'relative',
                }}
              >
                <img
                  src={resolveImageUri(watchData?.image) || 'https://via.placeholder.com/400?text=Sin+Imagen'}
                  style={{
                    width: '55%', height: '100%', objectFit: 'contain',
                    transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHoveringImg ? 1.04 : 1})`,
                    transition: 'transform 0.12s ease-out',
                    willChange: 'transform',
                    filter: isSecurityBlocked
                      ? `drop-shadow(0 0 24px ${currentStateInfo.color}88)`
                      : isHoveringImg ? 'drop-shadow(0 20px 40px rgba(139,92,246,0.35))' : 'none',
                    opacity: isSecurityBlocked ? 0.75 : isEscrowed ? 0.7 : 1,
                  }}
                  alt="watch"
                />
                {isAltered && (
                  <div style={{ position: 'absolute', top: 15, left: 15, backgroundColor: '#f97316', paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6, borderRadius: 20 }}>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, fontFamily: 'inherit' }}>ALTERADO</span>
                  </div>
                )}
                {isListed && !isAltered && (
                  <div style={{ position: 'absolute', top: 15, left: 15, backgroundColor: isEscrowed ? '#f59e0b' : colors.primary, paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6, borderRadius: 20 }}>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, fontFamily: 'inherit' }}>
                      {isEscrowed ? 'RESERVADO' : `EN VENTA · ${displayPrice} USDC`}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <View style={{ height: 260, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                <Image
                  source={{ uri: resolveImageUri(watchData.image) || 'https://via.placeholder.com/400?text=Sin+Imagen' }}
                  style={{ width: '55%', height: '100%', opacity: isSecurityBlocked ? 0.75 : isEscrowed ? 0.7 : 1 }}
                  resizeMode="contain"
                />
                {isAltered && (
                  <View style={{ position: 'absolute', top: 15, left: 15, backgroundColor: '#f97316', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>ALTERADO</Text>
                  </View>
                )}
                {isListed && !isAltered && (
                  <View style={{ position: 'absolute', top: 15, left: 15, backgroundColor: isEscrowed ? '#f59e0b' : colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                      {isEscrowed ? 'RESERVADO' : `EN VENTA · ${displayPrice} USDC`}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={watchScreenStyles.tabRow}>
              {[
                { key: 'details', label: 'Información', icon: 'information-circle-outline' },
                { key: 'history', label: 'Historial',   icon: 'time-outline' },
              ].map(({ key: tab, label, icon }) => {
                const isActive = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      watchScreenStyles.tabButton,
                      {
                        borderBottomWidth: (isActive && !isSecurityBlocked) ? 2 : 0,
                        borderBottomColor: isActive ? colors.primary : 'transparent',
                        backgroundColor: (isActive && isSecurityBlocked) ? currentStateInfo.color + '18' : 'transparent',
                        flex: 1, alignItems: 'center', gap: 3,
                      }
                    ]}
                  >
                    <Ionicons
                      name={isActive ? icon.replace('-outline', '') : icon}
                      size={14}
                      color={isActive ? (isSecurityBlocked ? currentStateInfo.color : colors.primary) : colors.textMuted}
                    />
                    <Text style={{
                      fontSize: 11, fontWeight: isActive ? '700' : '400',
                      color: isActive ? (isSecurityBlocked ? currentStateInfo.color : colors.primary) : colors.textSecondary,
                      letterSpacing: 0.3,
                    }}>
                      {label.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PESTAÑA INFORMACIÓN */}
          {activeTab === 'details' && (
            <WatchDetailsTab
              watchData={watchData}
              ownerData={ownerData}
              sellerRoles={sellerRoles}
              currentStateId={currentStateId}
              currentStateInfo={currentStateInfo}
              isAltered={isAltered}
              isEscrowed={isEscrowed}
              isListed={isListed}
              nftAddress={NFT_ADDRESS}
              tokenId={watchId}
              navigation={navigation}
              isManufacturer={isManufacturer}
              colors={colors}
              buySection={buySection}
            />
          )}

          {/* PESTAÑA HISTORIAL */}
          {activeTab === 'history' && (
            <WatchHistoryTab
              watchData={watchData}
              appUsers={appUsers}
              navigation={navigation}
              nftAddress={NFT_ADDRESS}
              auctionAddress={AUCTION_ADDRESS}
              tokenId={watchId}
              isAltered={isAltered}
              isManufacturer={isManufacturer}
              colors={colors}
            />
          )}

        </View>
      </ScrollView>

      {/* MODAL: CONFIRMACIÓN DE COMPRA */}
      <Modal visible={buyModalVisible} transparent animationType="fade">
        <View style={alertStyles.overlay}>
          <View style={alertStyles.alertBox}>
            <Ionicons name="cart-outline" size={50} color={colors.primary} />
            <Text style={alertStyles.title}>¿Confirmar Compra?</Text>
            <Text style={alertStyles.message}>
              {listingData?.is_p2p
                ? `¿Confirmas la compra por ${displayPrice} USDC? Un relojero certificará la autenticidad del reloj antes de que lo recibas.`
                : `¿Confirmas la compra por ${displayPrice} USDC? El vendedor enviará el reloj directamente sin necesidad de peritaje.`}
            </Text>
            <View style={alertStyles.buttonRow}>
              <TouchableOpacity style={alertStyles.cancelButton} onPress={() => setBuyModalVisible(false)}><Text style={alertStyles.cancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={alertStyles.confirmButton} onPress={confirmPurchase}><Text style={alertStyles.confirmText}>Comprar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ALERTA PERSONALIZADA */}
      <Modal visible={customAlert.visible} transparent animationType="fade">
        <View style={alertStyles.overlay}>
          <View style={alertStyles.alertBox}>
            <Ionicons 
                name={customAlert.type === 'success' ? "checkmark-circle" : "warning"} 
                size={50} 
                color={customAlert.type === 'success' ? alertColors.success : alertColors.error} 
            />
            <Text style={alertStyles.title}>{customAlert.title}</Text>
            <Text style={alertStyles.message}>{customAlert.message}</Text>
            <TouchableOpacity onPress={hideAlertLocal} style={[globalStyles.primaryButton, { width: '100%', marginTop: 20 }]}>
              <Text style={globalStyles.buttonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isProcessingPurchase} transparent animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.78)',
          justifyContent: 'center',
          alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 20,
            padding: 32,
            alignItems: 'center',
            gap: 16,
            borderWidth: 1,
            borderColor: colors.border,
            minWidth: 260,
            maxWidth: 320,
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, textAlign: 'center' }}>
              Esperando firma…
            </Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
              Confirma la transacción en tu wallet para continuar.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}