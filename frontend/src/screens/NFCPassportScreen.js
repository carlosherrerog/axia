// src/screens/NFCPassportScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';

const AXIA_LOGO = require('../../assets/axia-icons/axia-icon-rounded-purple-1024.png');
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import api from '../api/api.js';
import { colors, watchScreenStyles, WATCH_STATES, roleColors } from '../themes/styles.js';
import { resolveImageUri } from '../utils/ipfs';

const NFT_ADDRESS         = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS    || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F';
const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS  || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';
const AUCTION_ADDRESS     = process.env.EXPO_PUBLIC_AUCTION_ADDRESS      || '0x701EAa91aeB8588694B116C004D1EaAC7f55F2F2';

const POLYGONSCAN_BASE = 'https://amoy.polygonscan.com';

export default function NFCPassportScreen({ route, navigation }) {
  const { tokenId, verified } = route.params || {};
  // verified viene como string "true"/"false" desde el query param ?verified=…
  const sdmVerified = verified === 'true' || verified === true;

  const [activeTab, setActiveTab] = useState('details');
  const [watchData, setWatchData] = useState(null);
  const [listingData, setListingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggedUser, setLoggedUser] = useState(null);
  const [appUsers, setAppUsers] = useState([]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHoveringImg, setIsHoveringImg] = useState(false);
  const gyroBaseline = useRef(null);  // posición neutral calibrada al abrir la pantalla

  // Efecto giroscopio — solo en móvil web (deviceorientation)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleOrientation = (e) => {
      if (e.gamma === null || e.beta === null) return;
      // Primera lectura: calibrar posición neutral
      if (!gyroBaseline.current) {
        gyroBaseline.current = { beta: e.beta, gamma: e.gamma };
        return;
      }
      const dx = (e.beta  - gyroBaseline.current.beta)  * 0.55;
      const dy = (e.gamma - gyroBaseline.current.gamma) * 0.55;
      setTilt({
        x: Math.max(-20, Math.min(20, dx)),
        y: Math.max(-20, Math.min(20, dy)),
      });
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ requiere permiso explícito — pedirlo al cargar la pantalla
      DeviceOrientationEvent.requestPermission()
        .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', handleOrientation); })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [res, resListing] = await Promise.all([
        api.get(`/public/nfts/${tokenId}`),
        api.get(`/public/nfts/${tokenId}/listing`),
      ]);
      setWatchData(res.data);
      setListingData(resListing.data);
    } catch (e) {
      console.error('NFCPassport fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    api.get('/users').then(r => setAppUsers(r.data)).catch(() => {});
  }, [activeTab]);

  useFocusEffect(useCallback(() => {
    fetchData();
    api.get('/users/me').then(r => setLoggedUser(r.data)).catch(() => setLoggedUser(null));
  }, [fetchData]));

  if (loading || !watchData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isListed    = listingData && (listingData.is_listed === 1 || listingData.is_listed === true);
  const isEscrowed  = listingData && listingData.listing_state >= 2;
  const displayPrice = isListed && listingData.price
    ? (Number(listingData.price) / 1_000_000).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : null;

  const sellerRoles      = Array.isArray(watchData?.seller_roles) ? watchData.seller_roles : [];
  const currentStateId   = watchData?.security_state || 0;
  const currentStateInfo = WATCH_STATES[currentStateId] || WATCH_STATES[0];
  const isSecurityBlocked = currentStateId === 1 || currentStateId === 2;
  const isAltered         = currentStateId === 4;

  const ownerData = {
    id:             watchData.owner_id,
    username:       watchData.seller_name || 'Usuario',
    wallet_address: watchData.owner_wallet || '0x0000000000000000000000000000000000000000',
  };

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

  const openPolygonscan = () => {
    const url = `${POLYGONSCAN_BASE}/token/${NFT_ADDRESS}?a=${tokenId}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── CABECERA NFC ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 18,
        paddingTop: Platform.OS === 'ios' ? 56 : Platform.OS === 'android' ? 36 : 18,
        paddingBottom: 14,
        backgroundColor: colors.surface,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Image
          source={AXIA_LOGO}
          style={{ width: 36, height: 36, borderRadius: 18 }}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Pasaporte Digital</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>AXIA · Certificado Blockchain</Text>
        </View>
        {/* Badge SDM — solo se muestra si el backend devolvió ?verified= */}
        {verified !== undefined && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: sdmVerified ? '#16a34a22' : '#f9731622',
            borderWidth: 1,
            borderColor: sdmVerified ? '#16a34a80' : '#f9731680',
            borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
            marginRight: 6,
          }}>
            <Ionicons
              name={sdmVerified ? 'shield-checkmark' : 'warning'}
              size={13}
              color={sdmVerified ? '#22c55e' : '#f97316'}
            />
            <Text style={{
              color: sdmVerified ? '#22c55e' : '#f97316',
              fontSize: 10, fontWeight: '700', letterSpacing: 0.3,
            }}>
              {sdmVerified ? 'NFC AUTÉNTICO' : 'NFC INVÁLIDO'}
            </Text>
          </View>
        )}
        {/* Botón login / ir a AXIA */}
        <TouchableOpacity
          onPress={() => {
            if (loggedUser) {
              const dest = loggedUser.is_admin ? 'Admin'
                : loggedUser.roles?.includes('RELOJERO') ? 'WatchmakerDashboard'
                : loggedUser.roles?.includes('FABRICANTE') ? 'ManufacturerDashboard'
                : 'UserDashboard';
              navigation.navigate(dest);
            } else {
              navigation.navigate('Login');
            }
          }}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: colors.primary + '18',
            borderWidth: 1, borderColor: colors.primary + '50',
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
          }}
        >
          <Ionicons
            name={loggedUser ? 'apps-outline' : 'log-in-outline'}
            size={14}
            color={colors.primaryLight}
          />
          <Text style={{ color: colors.primaryLight, fontSize: 12, fontWeight: '600' }}>
            {loggedUser ? 'Volver a AXIA' : 'Iniciar sesión'}
          </Text>
        </TouchableOpacity>

        {navigation.canGoBack() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

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

        {/* ── PESTAÑA INFORMACIÓN ── */}
        {activeTab === 'details' && (
          <View style={watchScreenStyles.contentCard}>

            {/* Propietario Actual */}
            {(() => {
              const roleKey   = sellerRoles.includes('FABRICANTE') ? 'FABRICANTE'
                              : sellerRoles.includes('DEALER')     ? 'DEALER'
                              : sellerRoles.includes('RELOJERO')   ? 'RELOJERO'
                              : null;
              const roleColor = roleKey ? roleColors[roleKey] : colors.primary;
              const roleLabel = roleKey ? { FABRICANTE: 'Fabricante', DEALER: 'Dealer', RELOJERO: 'Relojero' }[roleKey] : null;
              return (
                <View style={[watchScreenStyles.detailRow, { marginBottom: 6 }]}>
                  <Text style={watchScreenStyles.detailLabel}>Propietario:</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <TouchableOpacity
                      onPress={() => ownerData.id && navigation.navigate('PublicProfile', { userId: ownerData.id })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    >
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{ownerData.username || 'Usuario'}</Text>
                      {roleKey && <Ionicons name="checkmark-circle" size={16} color={roleColor} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => Clipboard.setStringAsync(ownerData.wallet_address)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                        {ownerData.wallet_address ? `${ownerData.wallet_address.slice(0, 10)}…${ownerData.wallet_address.slice(-8)}` : '—'}
                      </Text>
                      <Ionicons name="copy-outline" size={11} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5, marginBottom: 15 }} />

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
                <Text style={watchScreenStyles.detailLabel}>Fecha de Minteo:</Text>
                <Text style={[watchScreenStyles.detailValue, { color: colors.primaryLight, fontWeight: '600' }]}>
                  {new Date(watchData.mint_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            )}

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

            <View style={{ marginBottom: 12 }}>
              <Text style={watchScreenStyles.detailLabel}>Estado Blockchain</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <Ionicons name={currentStateInfo.icon} size={14} color={currentStateInfo.color} />
                <Text style={{ color: currentStateInfo.color, fontSize: 13, fontWeight: '600' }}>
                  {currentStateId === 0 ? 'En propiedad' : currentStateInfo.label}
                </Text>
              </View>
            </View>
            <View style={{ marginBottom: 10 }}>
              <Text style={watchScreenStyles.detailLabel}>Estado Marketplace</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 3, color: isAltered ? colors.textMuted : isEscrowed ? '#f59e0b' : isListed ? colors.primaryLight : watchData?.is_public ? '#10b981' : colors.textSecondary }}>
                {isAltered ? '—' : isEscrowed ? 'Reservado' : isListed ? 'En Venta' : watchData?.is_public ? 'Público' : 'Privado'}
              </Text>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

            <View style={[watchScreenStyles.detailRow, { alignItems: 'flex-start' }]}>
              <Text style={watchScreenStyles.detailLabel}>Dirección del contrato:</Text>
              <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.primaryLight, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                  {NFT_ADDRESS ? `${NFT_ADDRESS.slice(0, 10)}…${NFT_ADDRESS.slice(-8)}` : '0x...'}
                </Text>
                <Ionicons name="copy-outline" size={14} color={colors.primaryLight} />
              </TouchableOpacity>
            </View>
            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>ID del Token:</Text>
              <Text style={watchScreenStyles.detailValue}>{tokenId}</Text>
            </View>
            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Estándar de token:</Text>
              <Text style={watchScreenStyles.detailValue}>ERC721</Text>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

            <TouchableOpacity
              onPress={openPolygonscan}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: colors.surface, borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Ionicons name="open-outline" size={16} color={colors.primaryLight} />
              <Text style={{ color: colors.primaryLight, fontWeight: '600', fontSize: 13 }}>
                Ver en Polygonscan (Amoy)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PESTAÑA HISTORIAL (igual que PublicWatchScreen) ── */}
        {activeTab === 'history' && (
          <View style={watchScreenStyles.contentCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name="time" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Historial On-Chain</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Registro inmutable de transferencias, verificaciones y cambios</Text>
              </View>
            </View>

            {(() => {
              const findUserByWallet = (wallet) =>
                wallet ? appUsers.find(u => u.wallet_address?.toLowerCase() === wallet.toLowerCase()) : null;

              const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
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
                const isManufacturerCert   = mfgWallet && v.watchmaker?.toLowerCase() === mfgWallet;
                const isRejectionByComment = typeof v.comment === 'string' && v.comment.startsWith('Peritaje rechazado');
                const isRejection = !isManufacturerCert && (isRejectionByComment || (isAltered && v.date === latestVerifDate));
                const isP2PSale   = !isRejection && !isManufacturerCert &&
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

                    {/* Wallets De / Vía / A */}
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

                    {/* Texto libre (revisiones / verificaciones) */}
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
                        {event.watchmakerUser && (
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
                <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                    {NFT_ADDRESS ? `${NFT_ADDRESS.slice(0, 10)}…${NFT_ADDRESS.slice(-8)}` : '—'}
                  </Text>
                  <Ionicons name="copy-outline" size={12} color={colors.primaryLight} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Token ID</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>#{tokenId}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { const url = `${POLYGONSCAN_BASE}/token/${NFT_ADDRESS}?a=${tokenId}`; if (Platform.OS === 'web') window.open(url, '_blank'); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ver en Polygonscan</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
