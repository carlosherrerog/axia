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
import WatchHistoryTab from '../components/WatchHistoryTab';
import WatchDetailsTab from '../components/WatchDetailsTab';

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
            tokenId={tokenId}
            navigation={navigation}
            colors={colors}
          />
        )}
        {/* ── PESTAÑA HISTORIAL ── */}
        {activeTab === 'history' && (
          <WatchHistoryTab
            watchData={watchData}
            appUsers={appUsers}
            navigation={navigation}
            nftAddress={NFT_ADDRESS}
            auctionAddress={AUCTION_ADDRESS}
            tokenId={tokenId}
            isAltered={isAltered}
            colors={colors}
          />
        )}


      </ScrollView>
    </View>
  );
}
