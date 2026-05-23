import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Platform, useWindowDimensions, Animated, Modal, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import api, { getToken, WS_URL } from '../api/api';
import { roleColors, darkColors } from '../themes/styles';
import { useTheme } from '../context/ThemeContext';
import MenuDropdown from './MenuDropDown';
import AlertModal, { useAlert } from './AlertModal';

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
  // forceDark: dashboards profesionales (Relojero, Fabricante) siempre en oscuro
  const colors    = forceDark ? darkColors : theme.colors;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [localUser, setLocalUser]               = useState(loggedUser);
  const [internalCount, setInternalCount]       = useState(0);
  const [moreMenuVisible, setMoreMenuVisible]   = useState(false);
  const [disconnectVisible, setDisconnectVisible] = useState(false);
  const [isProcessingWallet, setIsProcessingWallet] = useState(false);
  const [walletCopied, setWalletCopied]         = useState(false);
  const { alertProps, showAlert, hideAlert }    = useAlert();

  // Banner de notificación emergente
  const [showBanner, setShowBanner] = useState(false);
  const [lastNotif, setLastNotif]   = useState(null);
  const translateY        = useRef(new Animated.Value(-100)).current;
  const lastShownNotifId  = useRef(null);

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
        if (checkNew && res.data.length > 0) {
          const newest = res.data[0];
          if (newest.id !== lastShownNotifId.current) {
            lastShownNotifId.current = newest.id;
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
  const handleConnect = async () => {
    if (Platform.OS !== 'web' || !window.ethereum) {
      showAlert('MetaMask requerido', 'Usa un navegador con MetaMask instalado.', 'warning');
      return;
    }
    try {
      setIsProcessingWallet(true);
      const accounts  = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address   = accounts[0];
      const { data: { nonce } } = await api.post('/auth/challenge', { address });
      const provider  = new ethers.BrowserProvider(window.ethereum);
      const signer    = await provider.getSigner();
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
    {
      icon: 'information-circle-outline', label: 'Información', color: colors.textSecondary,
      onPress: () => { setMoreMenuVisible(false); navigation?.navigate('Info'); },
    },
    {
      icon: 'settings-outline', label: 'Configuración', color: colors.textSecondary,
      onPress: () => { setMoreMenuVisible(false); navigation?.navigate('Configuracion'); },
    },
    { divider: true },
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

      {/* Cabecera principal  */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 54 : 20,
        paddingBottom: 14,
        backgroundColor: colors.backgroundAlt,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        {/* Logo AXIA o botón volver */}
        <View style={{ flex: 1, marginRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            <>
              <Image
                source={require('../../assets/axia-icons/axia-mark-purple-light.svg')}
                style={{ width: 130, height: 40 }}
                resizeMode="contain"
              />
              {Platform.OS === 'web' ? (
                <Image
                  source={require('../../assets/axia-icons/axia-wordmark-purple.svg')}
                  style={{ width: 120, height: 40 }}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 2 }}>
                  AXIA
                </Text>
              )}
            </>
          )}
        </View>

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
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                borderRadius: 20, borderWidth: 1, borderColor: '#10b98140',
                backgroundColor: '#10b98115', overflow: 'hidden',
              }}>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(localUser.wallet_address);
                    setWalletCopied(true);
                    setTimeout(() => setWalletCopied(false), 2000);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingRight: 8, paddingVertical: 7 }}
                >
                  <Ionicons name={walletCopied ? 'checkmark' : 'wallet-outline'} size={13} color="#10b981" />
                  <Text numberOfLines={1} style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>
                    {localUser.wallet_address.slice(0, 6)}…{localUser.wallet_address.slice(-4)}
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 1, height: 18, backgroundColor: '#10b98140' }} />
                <TouchableOpacity onPress={() => setDisconnectVisible(true)} style={{ paddingHorizontal: 9, paddingVertical: 7 }}>
                  <Ionicons name="log-out-outline" size={13} color="#10b98199" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleConnect}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  Conectar wallet
                </Text>
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

          {/* Menú hamburguesa — solo en móvil y cuando la pantalla lo indica */}
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
