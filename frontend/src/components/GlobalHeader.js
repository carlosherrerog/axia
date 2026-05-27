import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Platform, useWindowDimensions, Animated, Modal, Image, Pressable, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import api, { getToken, WS_URL } from '../api/api';
import { roleColors, darkColors } from '../themes/styles';
import { useTheme } from '../context/ThemeContext';
import { NavTabContext } from '../context/NavTabContext';
import MenuDropdown from './MenuDropDown';
import AlertModal, { useAlert } from './AlertModal';

// Web3Modal hooks — solo en web
let useWeb3Modal = () => ({ open: null });
let useWeb3ModalProvider = () => ({ walletProvider: null });
if (Platform.OS === 'web') {
  try {
    const wc = require('@web3modal/ethers/react');
    useWeb3Modal = wc.useWeb3Modal;
    useWeb3ModalProvider = wc.useWeb3ModalProvider;
  } catch {}
}

export default function GlobalHeader({
  loggedUser,
  loading,
  title,
  navigation,
  unreadCount,
  onWalletChange,
  onWalletDisconnect,
  forceDark = false,
  showBack = false,
  showHamburger = false,
}) {
  const theme = useTheme();
  const colors    = forceDark ? darkColors : theme.colors;
  const { width } = useWindowDimensions();
  const isMobile  = width < 768;

  const { open: w3mOpen }          = useWeb3Modal();
  const { walletProvider: w3mProvider } = useWeb3ModalProvider();

  const { activeTab, onTabPress, tabs } = useContext(NavTabContext);
  const showInlineTabs = !isMobile && tabs?.length > 0 && !showBack;

  const [localUser, setLocalUser]               = useState(loggedUser);
  const [internalCount, setInternalCount]       = useState(() =>
    Platform.OS === 'web' ? parseInt(localStorage.getItem('notifCount') || '0', 10) : 0
  );
  const [moreMenuVisible, setMoreMenuVisible]   = useState(false);
  const [disconnectVisible, setDisconnectVisible] = useState(false);
  const [walletMenuVisible, setWalletMenuVisible] = useState(false);
  const [isProcessingWallet, setIsProcessingWallet] = useState(false);
  const [walletCopied, setWalletCopied]         = useState(false);
  const { alertProps, showAlert, hideAlert }    = useAlert();

  // Banner de notificación emergente
  const [showBanner, setShowBanner] = useState(false);
  const [lastNotif, setLastNotif]   = useState(null);
  const translateY        = useRef(new Animated.Value(-100)).current;
  const lastShownNotifId  = useRef(
    Platform.OS === 'web' ? (parseInt(localStorage.getItem('lastShownNotifId') || '0', 10) || null) : null
  );
  const pulseAnim         = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!localUser?.wallet_address) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [localUser?.wallet_address]);

  useEffect(() => { setLocalUser(loggedUser); }, [loggedUser]);

  const isConnected          = !!localUser?.wallet_address;
  const isGlobalLoading      = loading || isProcessingWallet;
  const displayCount         = unreadCount !== undefined ? unreadCount : internalCount;

  const isProfessionalDashboard = title?.toLowerCase().includes('relojero')
    || title?.toLowerCase().includes('fabricante');

  const accentColor = title?.toLowerCase().includes('relojero') ? roleColors.RELOJERO
    : title?.toLowerCase().includes('fabricante') ? roleColors.FABRICANTE
    : colors.primary;

  // WebSocket + conteo de notificaciones
  useEffect(() => {
    if (!localUser?.id) return;
    let ws;

    const fetchUnread = async (checkNew = false) => {
      try {
        const res = await api.get('/notifications');
        setInternalCount(res.data.length);
        if (Platform.OS === 'web') localStorage.setItem('notifCount', String(res.data.length));
        if (checkNew && res.data.length > 0) {
          const newest = res.data[0];
          if (newest.id !== lastShownNotifId.current) {
            lastShownNotifId.current = newest.id;
            if (Platform.OS === 'web') localStorage.setItem('lastShownNotifId', String(newest.id));
            triggerBanner(newest);
          }
        }
      } catch {}
    };

    fetchUnread(false);
    getToken().then(token => {
      ws = new WebSocket(`${WS_URL}/ws/${localUser.id}?token=${token}`);
      ws.onmessage = (e) => {
        if (e.data === 'update_users') { fetchUnread(true); return; }
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'update_marketplace' || msg.type === 'update_auction') fetchUnread(true);
        } catch {}
      };
    });
    const unsubFocus = navigation?.addListener('focus', () => fetchUnread(true));
    return () => { ws?.close(); unsubFocus?.(); };
  }, [localUser, navigation]);

  const triggerBanner = (notif) => {
    setLastNotif(notif);
    setShowBanner(true);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    setTimeout(() => {
      Animated.timing(translateY, { toValue: -100, duration: 350, useNativeDriver: true })
        .start(() => setShowBanner(false));
    }, 4500);
  };

  // Wallet
  const doVerify = async (eip1193) => {
    try {
      setIsProcessingWallet(true);
      const provider  = new ethers.BrowserProvider(eip1193);
      const signer    = await provider.getSigner();
      const address   = await signer.getAddress();
      const { data: { nonce } } = await api.post('/auth/challenge', { address });
      const signature = await signer.signMessage(nonce);
      const res       = await api.post('/auth/verify', { address, signature, nonce });
      setLocalUser(res.data);
      onWalletChange?.(res.data);
      showAlert('Wallet vinculada', 'Tu cuenta está conectada correctamente.', 'success');
    } catch (e) {
      if (e.code !== 4001) showAlert('Error', 'No se pudo vincular la wallet.', 'error');
    } finally {
      setIsProcessingWallet(false);
    }
  };

  const handleConnect = async () => {
    if (Platform.OS !== 'web') return;
    if (window.ethereum) {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await doVerify(window.ethereum);
    } else if (w3mOpen) {
      // Móvil o sin extensión: abrir modal Web3Modal
      pendingW3mVerify.current = true;
      await w3mOpen();
      // doVerify se llamará desde el useEffect cuando walletProvider esté disponible
    } else {
      showAlert('Wallet requerida', 'Instala MetaMask o usa un navegador compatible.', 'warning');
    }
  };

  // Cuando Web3Modal conecta (móvil), completar verificación backend
  const pendingW3mVerify = useRef(false);
  useEffect(() => {
    if (!w3mProvider || !pendingW3mVerify.current) return;
    pendingW3mVerify.current = false;
    doVerify(w3mProvider);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w3mProvider]);

  const handleDisconnect = async () => {
    try {
      setIsProcessingWallet(true);
      await api.post('/auth/disconnect');
      const updated = { ...localUser, wallet_address: null };
      setLocalUser(updated);
      onWalletChange?.(updated);
      setDisconnectVisible(false);
      onWalletDisconnect?.();
    } catch {
      showAlert('Error', 'No se pudo desvincular la wallet.', 'error');
    } finally {
      setIsProcessingWallet(false);
    }
  };

  const handleLogout = () => {
    setMoreMenuVisible(false);
    if (Platform.OS === 'web') localStorage.clear();
    navigation?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const moreMenuItems = [
    ...(isMobile ? [
      {
        icon: 'information-circle-outline', label: 'Información', color: colors.textSecondary,
        onPress: () => { setMoreMenuVisible(false); navigation?.navigate('Info'); },
      },
      { divider: true },
    ] : []),
    {
      icon: 'log-out-outline', label: 'Cerrar sesión', color: '#f43f5e',
      onPress: handleLogout,
    },
  ];

  // Estilos inline dependientes del tema 
  const iconBtn = {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  };

  return (
    <>
      {/* Banner flotante de notificación*/}
      {showBanner && lastNotif && (() => {
        const isMoney = lastNotif.type === 'SUCCESS' || lastNotif.type === 'SALE';
        const bannerColor = isMoney ? '#10b981' : accentColor;
        const bannerIcon  = isMoney ? 'cash-outline' : 'notifications';
        return (
          <Animated.View style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 54 : Platform.OS === 'web' ? 12 : 36,
            left: 16, right: 16, zIndex: 200,
            transform: [{ translateY }],
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.backgroundAlt,
              borderRadius: 14, padding: 14,
              borderWidth: 1.5, borderColor: `${bannerColor}80`,
              ...(Platform.OS === 'web' && {
                boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
              }),
            }}>
              {/* Icono */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation?.navigate('Notificaciones')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: `${bannerColor}25`,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Ionicons name={bannerIcon} size={18} color={bannerColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                    {lastNotif.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {lastNotif.message}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Botón cerrar */}
              <TouchableOpacity
                onPress={() => setShowBanner(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: colors.surface,
                  justifyContent: 'center', alignItems: 'center',
                  borderWidth: 1, borderColor: colors.border,
                  marginLeft: 4,
                }}
              >
                <Ionicons name="close" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        );
      })()}

      {/* Cabecera principal */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 54 : 20,
        paddingBottom: 14,
        backgroundColor: colors.backgroundAlt,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        {/* Logo AXIA o botón volver */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
          {showBack ? (
            <>
              <TouchableOpacity
                onPress={() => navigation?.canGoBack() ? navigation.goBack() : navigation?.navigate('Notificaciones')}
                style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                <Ionicons name="arrow-back" size={17} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                {title || 'AXIA'}
              </Text>
            </>
          ) : (
            Platform.OS === 'web' ? (
              <Image
                source={require('../../assets/axia-icons/axia-wordmark-purple.svg')}
                style={{ width: 110, height: 36 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 2 }}>
                AXIA
              </Text>
            )
          )}
        </View>

        {/* Tabs inline — solo escritorio */}
        {showInlineTabs ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {tabs.map(({ name, icon }) => {
              const isFocused = activeTab === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => onTabPress(name)}
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: isFocused ? `${colors.primary}15` : 'transparent',
                  }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                >
                  <Ionicons
                    name={isFocused ? icon : `${icon}-outline`}
                    size={15}
                    color={isFocused ? colors.primary : colors.textMuted}
                  />
                  <Text style={{
                    fontSize: 14, fontWeight: isFocused ? '700' : '500',
                    color: isFocused ? colors.text : colors.textMuted,
                  }}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Controles a la derecha */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>

          {/* Invitado: botón de login */}
          {!localUser?.id && (
            <TouchableOpacity
              onPress={() => navigation?.navigate('Login')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: colors.primary + '20',
                borderWidth: 1, borderColor: colors.primary + '50',
              }}
            >
              <Ionicons name="log-in-outline" size={15} color={colors.primaryLight} />
              <Text style={{ color: colors.primaryLight, fontSize: 13, fontWeight: '700' }}>
                Iniciar sesión
              </Text>
            </TouchableOpacity>
          )}

          {/* Wallet — solo si hay usuario logueado */}
          {localUser?.id && (
            isConnected ? (
              <TouchableOpacity
                onPress={() => setWalletMenuVisible(true)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  borderRadius: 20, borderWidth: 1, borderColor: '#10b98140',
                  backgroundColor: '#10b98115',
                  paddingHorizontal: 10, paddingVertical: 7,
                }}
              >
                <Animated.View style={{
                  width: 7, height: 7, borderRadius: 4,
                  backgroundColor: '#10b981',
                  transform: [{ scale: pulseAnim }],
                }} />
                <Text numberOfLines={1} style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>
                  {`${localUser.wallet_address.slice(0, 6)}…${localUser.wallet_address.slice(-4)}`}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleConnect}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: isMobile ? 10 : 12, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                {!isMobile && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    Conectar wallet
                  </Text>
                )}
              </TouchableOpacity>
            )
          )}

          {/* Notificaciones — solo si hay usuario */}
          {localUser?.id && (
            <TouchableOpacity
              onPress={() => navigation?.navigate('Notificaciones')}
              style={[iconBtn, { position: 'relative' }]}
            >
              <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
              {displayCount > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  backgroundColor: '#ef4444',
                  justifyContent: 'center', alignItems: 'center',
                  borderWidth: 1.5, borderColor: colors.backgroundAlt,
                  paddingHorizontal: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    {displayCount > 9 ? '9+' : displayCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Avatar dropdown — solo escritorio, usuario logueado */}
          {!isMobile && localUser?.id && (
            <TouchableOpacity
              onPress={() => setMoreMenuVisible(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: colors.primary + '20',
                borderWidth: 1.5,
                borderColor: moreMenuVisible ? colors.primary + '90' : colors.primary + '40',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
                {(localUser.username?.[0] || '?').toUpperCase()}
              </Text>
            </TouchableOpacity>
          )}

          {/* Hamburguesa — solo móvil */}
          {isMobile && showHamburger && (
            <TouchableOpacity
              onPress={() => setMoreMenuVisible(v => !v)}
              style={iconBtn}
            >
              <Ionicons name="menu" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <MenuDropdown
        visible={moreMenuVisible}
        onClose={() => setMoreMenuVisible(false)}
        position={{ top: Platform.OS === 'web' ? 76 : 70, right: 16 }}
        items={moreMenuItems}
        loggedUser={localUser}
      />

      {/* Modal opciones wallet */}
      <Modal visible={walletMenuVisible} transparent animationType="fade" onRequestClose={() => setWalletMenuVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setWalletMenuVisible(false)}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{
              backgroundColor: colors.backgroundAlt,
              borderRadius: 20, borderWidth: 1, borderColor: colors.border,
              minWidth: 280, overflow: 'hidden',
              ...(Platform.OS === 'web' && { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }),
            }}>
              {/* Cabecera */}
              <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                  Wallet conectada
                </Text>
                <Text style={{ color: colors.text, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 0.5 }} numberOfLines={1}>
                  {localUser?.wallet_address}
                </Text>
              </View>

              {/* Opción: Copiar */}
              <TouchableOpacity
                onPress={async () => {
                  await Clipboard.setStringAsync(localUser.wallet_address);
                  setWalletCopied(true);
                  setTimeout(() => { setWalletCopied(false); setWalletMenuVisible(false); }, 1200);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name={walletCopied ? 'checkmark-circle' : 'copy-outline'} size={18} color={walletCopied ? '#10b981' : colors.textSecondary} />
                <Text style={{ color: walletCopied ? '#10b981' : colors.text, fontSize: 15, fontWeight: '500' }}>
                  {walletCopied ? 'Copiado' : 'Copiar dirección'}
                </Text>
              </TouchableOpacity>

              {/* Opción: Polygonscan */}
              <TouchableOpacity
                onPress={() => { Linking.openURL(`https://amoy.polygonscan.com/address/${localUser.wallet_address}`); setWalletMenuVisible(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={18} color="#8b5cf6" />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Ver en Polygonscan</Text>
              </TouchableOpacity>

              {/* Opción: Desconectar */}
              <TouchableOpacity
                onPress={() => { setWalletMenuVisible(false); setTimeout(() => setDisconnectVisible(true), 200); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 15, fontWeight: '500' }}>Desconectar wallet</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal desconectar wallet */}
      <AlertModal
        visible={disconnectVisible}
        type="warning"
        title="Desvincular wallet"
        message="Desconectarás tu dirección blockchain de esta cuenta. Podrás volver a vincularla cuando quieras."
        confirmLabel="Desvincular"
        onConfirm={handleDisconnect}
        cancelLabel="Cancelar"
        onCancel={() => setDisconnectVisible(false)}
      />

      {/* Modal alerta  */}
      <AlertModal {...alertProps} />

      {/* Spinner de wallet*/}
      {isGlobalLoading && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primaryLight} />
            <Text style={{ color: '#fff', fontSize: 13 }}>Procesando…</Text>
          </View>
        </Modal>
      )}
    </>
  );
}
