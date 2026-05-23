// src/screens/PublicWatchScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers'; 
import api, { WS_URL } from '../api/api.js';
import { colors, watchScreenStyles, alertColors, globalStyles, alertStyles, WATCH_STATES, roleColors } from '../themes/styles.js';
import { resolveImageUri } from '../utils/ipfs';
import GlobalHeader from '../components/GlobalHeader';

const NFT_ADDRESS = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS;
const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS;
const AUCTION_ADDRESS = process.env.EXPO_PUBLIC_AUCTION_ADDRESS;
const USDC_ADDRESS = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS;
const SIGNATURE_VERIFIER_ADDRESS = process.env.EXPO_PUBLIC_SIGNATURE_VERIFIER_ADDRESS;

// ABIs necesarios
const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)"
];
const MARKETPLACE_ABI = ["function buyWatchEscrow(uint256 tokenId) external"];

export default function PublicWatchScreen({ route, navigation }) {
  const { watchId, initialTab = 'details' } = route.params || {};
  
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
    if (typeof window.ethereum === 'undefined') throw new Error("MetaMask no detectado");
    const provider = new ethers.BrowserProvider(window.ethereum);
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
      showAlert("Error", "No se pudo verificar el saldo en MetaMask.");
    }
  };

  const confirmPurchase = async () => {
    setBuyModalVisible(false);
    try {
      setIsProcessingPurchase(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      const priceWei = ethers.parseUnits((Number(listingData.price) / 1000000).toString(), 6);

      // 1. Approve — el comprador solo paga el precio listado
      const approveTx = await usdcContract.approve(MARKETPLACE_ADDRESS, priceWei);
      await approveTx.wait();

      // 2. Buy
      const buyTx = await marketplace.buyWatchEscrow(watchId);
      await buyTx.wait();

      // 3. Backend
      await api.post(`/marketplace/buy/${watchId}`);

      showAlert("¡Éxito!", "Compra realizada con éxito.", "success");
      setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] }), 2000);

    } catch (error) {
      console.error("Error en la compra:", error);
      if (error?.code === 'ACTION_REJECTED') {
        showAlert("Cancelado", "Has rechazado la transacción en MetaMask.");
      } else if (error?.response?.data?.detail) {
        showAlert("Error", error.response.data.detail);
      } else if (error?.message) {
        showAlert("Error", error.message);
      } else {
        showAlert("Error", "La transacción falló o fue rechazada.");
      }
    } finally {
      setIsProcessingPurchase(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        title="Ficha Técnica"
        navigation={navigation}
        onWalletChange={setLoggedUser}
        onWalletDisconnect={() => navigation.navigate('Marketplace')}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ padding: 20 }}>
          
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

            {Platform.OS === 'web' ? (
              <div
                onMouseMove={handleImgMouseMove}
                onMouseEnter={() => setIsHoveringImg(true)}
                onMouseLeave={handleImgMouseLeave}
                style={{
                  height: 420, backgroundColor: colors.surface,
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
              <View style={{ height: 420, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
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
            <View style={watchScreenStyles.contentCard}>

              {isListed && !isEscrowed && loggedUser && loggedUser.id !== watchData.owner_id && (() => {
                const hasWallet = !!loggedUser?.wallet_address;
                const priceNum = listingData?.price ? Number(listingData.price) / 1_000_000 : 0;
                const depositAmt = priceNum * 0.02; // solo para info del vendedor (no lo paga el comprador)
                return (
                  <View style={{ marginBottom: 25 }}>
                    {/* Cabecera */}
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

                    {/* Precio destacado */}
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

                    {/* Desglose para el comprador */}
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

                    {/* Aviso si no hay wallet */}
                    {!hasWallet && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <Ionicons name="wallet-outline" size={16} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>Conecta tu wallet para poder comprar u ofertar</Text>
                      </View>
                    )}

                    {/* Botones */}
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
                );
              })()}

              {(!isEscrowed || isAltered) && (
                <>
                  <Text style={[watchScreenStyles.detailLabel, { marginBottom: 10 }]}>Propietario Actual</Text>
                  {(() => {
                    const roleKey = sellerRoles.includes('FABRICANTE') ? 'FABRICANTE'
                      : sellerRoles.includes('DEALER') ? 'DEALER'
                      : sellerRoles.includes('RELOJERO') ? 'RELOJERO'
                      : null;
                    const roleColor = roleKey ? roleColors[roleKey] : colors.primary;
                    const roleLabel = roleKey ? { FABRICANTE: 'Fabricante', DEALER: 'Dealer', RELOJERO: 'Relojero' }[roleKey] : null;
                    const roleIcon  = roleKey ? { FABRICANTE: 'construct', DEALER: 'storefront', RELOJERO: 'build' }[roleKey] : 'person';
                    return (
                      <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 16, borderWidth: 1, borderColor: colors.border,
                        padding: 16, marginBottom: 15, overflow: 'hidden',
                      }}>
                        {/* Línea de acento superior */}
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: roleColor + '80', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                          {/* Avatar */}
                          <View style={{
                            width: 52, height: 52, borderRadius: 26,
                            backgroundColor: roleColor + '18',
                            borderWidth: 1.5, borderColor: roleColor + '50',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Ionicons name={roleIcon} size={24} color={roleColor} />
                          </View>

                          {/* Info */}
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                                {ownerData.username || 'Usuario'}
                              </Text>
                              {roleLabel && (
                                <View style={{
                                  backgroundColor: roleColor + '20', borderWidth: 1,
                                  borderColor: roleColor + '60', borderRadius: 6,
                                  paddingHorizontal: 7, paddingVertical: 2,
                                }}>
                                  <Text style={{ color: roleColor, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                                    {roleLabel.toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              onPress={() => Clipboard.setStringAsync(ownerData.wallet_address)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
                            >
                              <View style={{ backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, letterSpacing: 0.3 }}>
                                  {ownerData.wallet_address
                                    ? `${ownerData.wallet_address.slice(0, 10)}…${ownerData.wallet_address.slice(-8)}`
                                    : '—'}
                                </Text>
                              </View>
                              <Ionicons name="copy-outline" size={12} color={colors.textMuted} />
                            </TouchableOpacity>
                          </View>

                          {/* Botón ver perfil */}
                          {!isManufacturer && (
                            <TouchableOpacity
                              onPress={() => navigation.navigate('PublicProfile', { userId: watchData.owner_id })}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 4,
                                backgroundColor: colors.background, borderWidth: 1,
                                borderColor: colors.border, borderRadius: 8,
                                paddingHorizontal: 10, paddingVertical: 6,
                              }}
                            >
                              <Ionicons name="person-outline" size={13} color={colors.textMuted} />
                              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '500' }}>Perfil</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })()}
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5, marginBottom: 15 }} />
                </>
              )}

              <Text style={watchScreenStyles.sectionTitle}>
                {watchData?.brand ? `${watchData.brand} ${watchData.model}` : watchData?.model || 'Modelo'}
              </Text>

              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Marca:</Text>
                <Text style={watchScreenStyles.detailValue}>{watchData?.brand || 'N/A'}</Text>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Modelo:</Text>
                <Text style={watchScreenStyles.detailValue}>{watchData?.model || 'N/A'}</Text>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Número de Serie:</Text>
                <Text style={watchScreenStyles.detailValue}>{watchData?.serialNumber || 'N/A'}</Text>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Año de Fabricación:</Text>
                <Text style={watchScreenStyles.detailValue}>{watchData?.manufacturingYear || 'N/A'}</Text>
              </View>
              {watchData.mint_date && (
                <View style={watchScreenStyles.detailRow}>
                  <Text style={watchScreenStyles.detailLabel}>Última Verificación:</Text>
                  <Text style={[watchScreenStyles.detailValue, { color: colors.primaryLight, fontWeight: '600' }]}>
                    {new Date(watchData.mint_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              )}

              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Estado Blockchain:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={currentStateInfo.icon} size={14} color={currentStateInfo.color} />
                  <Text style={[watchScreenStyles.detailValue, { fontWeight: 'bold', color: currentStateInfo.color }]}>
                    {currentStateId === 0 ? 'En propiedad' : currentStateInfo.label}
                  </Text>
                </View>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Estado Marketplace:</Text>
                <Text style={[watchScreenStyles.detailValue, { fontWeight: 'bold', color: isAltered ? colors.textMuted : isEscrowed ? '#f59e0b' : isListed ? colors.primaryLight : watchData?.is_public ? '#10b981' : colors.textSecondary }]}>
                  {isAltered ? '—' : isEscrowed ? 'Reservado' : isListed ? 'En Venta' : watchData?.is_public ? 'Público' : 'Privado'}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

              <View style={[watchScreenStyles.detailRow, { alignItems: 'flex-start' }]}>
                <Text style={watchScreenStyles.detailLabel}>Dirección del contrato:</Text>
                <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Text style={{ color: colors.primaryLight, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, textAlign: 'right' }}>
                    {NFT_ADDRESS || '0x...'}
                  </Text>
                  <Ionicons name="copy-outline" size={14} color={colors.primaryLight} />
                </TouchableOpacity>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>ID del Token:</Text>
                <Text style={watchScreenStyles.detailValue}>{watchId}</Text>
              </View>
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Estándar de token:</Text>
                <Text style={watchScreenStyles.detailValue}>ERC721</Text>
              </View>
            </View>
          )}

          {/* PESTAÑA HISTORIAL */}
          {activeTab === 'history' && (
            <View style={watchScreenStyles.contentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="time" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Historial On-Chain</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Registro inmutable de transferencias, verificaciones y cambios</Text>
                </View>
              </View>

              {(() => {
                const findUserByWallet = (wallet) =>
                  wallet ? appUsers.find(u => u.wallet_address?.toLowerCase() === wallet.toLowerCase()) : null;

                const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
                // transferred_at viene de la BD sin indicador de zona → añadir 'Z' para tratarlo como UTC
                const parseUTCDate = s => s ? new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z') : null;
                const fmtDateTime = s => { const d = parseUTCDate(s); return d ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
                const transfers = (watchData?.history || []).map(e => {
                  const isMint = !e.previous_owner_wallet || e.previous_owner_wallet.toLowerCase() === ZERO_ADDR;
                  const d = parseUTCDate(e.transferred_at);
                  const isAuction = !isMint && e.via_contract_wallet &&
                    AUCTION_ADDRESS &&
                    e.via_contract_wallet.toLowerCase() === AUCTION_ADDRESS.toLowerCase();
                  return {
                    _type: 'transfer',
                    _ts: d ? d.getTime() / 1000 : 0,
                    icon: isMint ? 'flash-outline' : isAuction ? 'hammer-outline' : 'swap-horizontal',
                    color: isMint ? '#a855f7' : isAuction ? '#f59e0b' : colors.primary,
                    title: isMint ? 'Minteo inicial' : isAuction ? 'Vendido en subasta' : 'Transferencia de propiedad',
                    price: e.price_usdc != null
                      ? `${Number(e.price_usdc).toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC`
                      : null,
                    isMint,
                    isAuction,
                    fromWallet: isMint ? (watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker || null) : (e.previous_owner_wallet || null),
                    viaWallet: e.via_contract_wallet || null,
                    toWallet: e.new_owner_wallet || null,
                    fromUser: isMint ? findUserByWallet(watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker) : findUserByWallet(e.previous_owner_wallet),
                    toUser: findUserByWallet(e.new_owner_wallet),
                    date: fmtDateTime(e.transferred_at),
                  };
                });
                const revisions = (watchData?.revisions || []).map(r => ({
                  _type: 'revision', _ts: r.date || 0,
                  icon: 'construct-outline', color: '#f59e0b',
                  title: 'Revisión técnica',
                  lines: [r.description],
                  watchmakerWallet: r.watchmaker,
                  watchmakerUser: findUserByWallet(r.watchmaker),
                  date: r.date ? new Date(r.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                }));
                const mfgWallet = watchData?.manufacturer_wallet?.toLowerCase();
                const rawVerifs = (watchData?.verifications || []);
                const latestVerifDate = rawVerifs.length > 0
                  ? Math.max(...rawVerifs.map(v => v.date || 0))
                  : -1;
                const verifications = rawVerifs.map(v => {
                  const isManufacturerCert = mfgWallet && v.watchmaker?.toLowerCase() === mfgWallet;
                  const isRejectionByComment = typeof v.comment === 'string' && v.comment.startsWith('Peritaje rechazado');
                  const isRejection = !isManufacturerCert && (isRejectionByComment || (isAltered && v.date === latestVerifDate));
                  const isP2PSale = !isRejection && !isManufacturerCert &&
                    typeof v.comment === 'string' && v.comment.startsWith('Peritaje superado en venta P2P');
                  return {
                    _type: 'verification', _ts: v.date || 0,
                    icon: isRejection ? 'close-circle-outline'
                        : isManufacturerCert ? 'ribbon-outline'
                        : isP2PSale ? 'shield-half-outline'
                        : 'shield-checkmark-outline',
                    color: isRejection ? '#ef4444'
                         : isManufacturerCert ? '#a855f7'
                         : isP2PSale ? '#38bdf8'
                         : '#10b981',
                    title: isRejection ? 'Peritaje fallido — Alteración detectada'
                         : isManufacturerCert ? 'Certificado de fabricación'
                         : isP2PSale ? 'Peritaje de venta P2P'
                         : 'Peritaje de autenticidad',
                    lines: [v.comment],
                    isRejection,
                    watchmakerWallet: v.watchmaker,
                    watchmakerUser: findUserByWallet(v.watchmaker),
                    date: v.date ? new Date(v.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                  };
                });

                const all = [...transfers, ...revisions, ...verifications]
                  .sort((a, b) => b._ts - a._ts);

                if (all.length === 0) return (
                  <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="cube-outline" size={26} color={colors.textMuted} />
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sin historial disponible</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
                      Las transferencias y cambios de estado aparecerán aquí una vez registradas en blockchain.
                    </Text>
                  </View>
                );

                return all.map((event, index) => (
                  <View key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ alignItems: 'center', width: 28 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: event.color + '25', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={event.icon} size={13} color={event.color} />
                      </View>
                      {index < all.length - 1 && (
                        <View style={{ width: 1.5, flex: 1, minHeight: 20, backgroundColor: event.isRejection ? '#ef444430' : colors.border, marginTop: 4 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 16 }}>
                      <Text style={{ color: event.color, fontWeight: '700', fontSize: 13 }}>{event.title}</Text>

                      {/* Wallets De / Vía / A con copia y perfil */}
                      {event._type === 'transfer' && (() => {
                        const rows = [
                          { label: event.isMint ? 'Por' : 'De', wallet: event.fromWallet, user: event.fromUser, isEscrow: false },
                          event.viaWallet ? { label: 'Vía', wallet: event.viaWallet, user: null, isEscrow: true, isAuction: event.isAuction } : null,
                          { label: 'A',   wallet: event.toWallet,   user: event.toUser,   isEscrow: false },
                        ].filter(Boolean);
                        return rows.map(({ label, wallet, user, isEscrow, isAuction }) => wallet ? (
                          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 11, minWidth: 20 }}>{label}:</Text>
                            <TouchableOpacity onPress={() => Clipboard.setStringAsync(wallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Text style={{ color: isEscrow ? '#f59e0b' : colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                {wallet.slice(0, 8)}…{wallet.slice(-6)}
                              </Text>
                              <Ionicons name="copy-outline" size={11} color={isEscrow ? '#f59e0b' : colors.primaryLight} />
                            </TouchableOpacity>
                            {isEscrow && (
                              <View style={{ backgroundColor: '#f59e0b22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 }}>
                                <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>{isAuction ? 'Subasta' : 'Escrow'}</Text>
                              </View>
                            )}
                            {user && !isEscrow && (
                              <TouchableOpacity
                                onPress={() => navigation.navigate('PublicProfile', { userId: user.id })}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}
                              >
                                <Ionicons name="person-outline" size={10} color={colors.primaryLight} />
                                <Text style={{ color: colors.primaryLight, fontSize: 10, fontWeight: '600' }}>{user.username}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : null);
                      })()}

                      {/* Precio de venta */}
                      {event.price && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons name="cash-outline" size={11} color="#10b981" />
                          <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>{event.price}</Text>
                        </View>
                      )}

                      {/* Texto libre (revisiones/verificaciones) */}
                      {event._type !== 'transfer' && event.lines?.map((l, i) => l ? (
                        event.isRejection ? (
                          <View key={i} style={{
                            backgroundColor: '#ef444415', borderRadius: 8, borderWidth: 1,
                            borderColor: '#ef444430', padding: 8, marginTop: 5,
                          }}>
                            <Text style={{ color: '#ef4444', fontSize: 12, fontStyle: 'italic' }}>"{l}"</Text>
                          </View>
                        ) : (
                          <Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{l}</Text>
                        )
                      ) : null)}

                      {/* Wallet del relojero */}
                      {event.watchmakerWallet && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <TouchableOpacity onPress={() => Clipboard.setStringAsync(event.watchmakerWallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                              {event.watchmakerWallet.slice(0, 8)}…{event.watchmakerWallet.slice(-6)}
                            </Text>
                            <Ionicons name="copy-outline" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                          {event.watchmakerUser && !isManufacturer && (
                            <TouchableOpacity
                              onPress={() => navigation.navigate('PublicProfile', { userId: event.watchmakerUser.id })}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}
                            >
                              <Ionicons name="person-outline" size={11} color={colors.primaryLight} />
                              <Text style={{ color: colors.primaryLight, fontSize: 11, fontWeight: '600' }}>{event.watchmakerUser.username}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.date}</Text>
                    </View>
                  </View>
                ));
              })()}

              <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Contrato NFT</Text>
                  <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, textAlign: 'right' }}>
                      {NFT_ADDRESS || '—'}
                    </Text>
                    <Ionicons name="copy-outline" size={12} color={colors.primaryLight} />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Token ID</Text>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>#{watchId}</Text>
                </View>
              </View>
            </View>
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
              Esperando MetaMask
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