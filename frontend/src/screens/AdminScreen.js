import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Modal, RefreshControl, Pressable, Image, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import api, { WS_URL } from '../api/api.js';
import { roleColors, alertColors } from '../themes/styles.js';
import { useTheme } from '../context/ThemeContext';
import UserInfo from '../components/UserInfo';

const ROLE_META = {
  RELOJERO:   { icon: 'build',      label: 'Relojeros',   color: roleColors.RELOJERO  },
  DEALER:     { icon: 'storefront', label: 'Dealers',     color: roleColors.DEALER    },
  FABRICANTE: { icon: 'business',   label: 'Fabricantes', color: roleColors.FABRICANTE },
};

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, colors, wide }) {
  return (
    <View style={{
      flex: wide ? 0 : 1,
      width: wide ? '100%' : undefined,
      minWidth: 80,
      backgroundColor: colors.backgroundAlt,
      borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: `${color}28`,
      ...(Platform.OS === 'web' && { boxShadow: `0 2px 12px ${color}10` }),
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: `${color}16`,
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
      }}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={{ color, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Marketplace Status Card ─────────────────────────────────────────────────
function MarketplaceStatusCard({ paused, loading, onToggle, colors }) {
  const active = !paused;
  const color  = active ? '#10b981' : '#f43f5e';

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1.5,
      borderColor: `${color}30`,
      padding: 16, marginBottom: 16,
      ...(Platform.OS === 'web' && { boxShadow: `0 4px 20px ${color}10` }),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: `${color}15`,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name={active ? 'storefront' : 'pause-circle'} size={22} color={color} />
          </View>
          <View>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              Estado del Marketplace
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
              <Text style={{ color, fontSize: 12, fontWeight: '600' }}>
                {active ? 'Operativo · Aceptando transacciones' : 'Pausado · Transacciones bloqueadas'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={onToggle}
          disabled={loading}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            paddingHorizontal: 16, paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: active ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
            borderWidth: 1,
            borderColor: active ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)',
          }}
        >
          {loading
            ? <ActivityIndicator size="small" color={active ? '#f43f5e' : '#10b981'} />
            : <>
                <Ionicons
                  name={active ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={16}
                  color={active ? '#f43f5e' : '#10b981'}
                />
                <Text style={{
                  color: active ? '#f43f5e' : '#10b981',
                  fontWeight: '700', fontSize: 13,
                }}>
                  {active ? 'Pausar' : 'Reanudar'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({ user: u, roleColor, onApprove, onReject, colors }) {
  const [expanded, setExpanded] = useState(false);
  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1.5,
      borderColor: `${roleColor}30`,
      marginBottom: 12, overflow: 'hidden',
      ...(Platform.OS === 'web' && { boxShadow: `0 4px 20px ${roleColor}10` }),
    }}>
      <View style={{ height: 3, backgroundColor: roleColor }} />
      <View style={{ padding: 14 }}>
        {/* Cabecera */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: `${roleColor}18`, borderWidth: 2, borderColor: `${roleColor}35`,
            justifyContent: 'center', alignItems: 'center', marginRight: 12,
          }}>
            <Text style={{ color: roleColor, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                {u.full_name || u.username}
              </Text>
              <View style={{
                backgroundColor: `${roleColor}15`, borderRadius: 6,
                paddingHorizontal: 7, paddingVertical: 2,
                borderWidth: 1, borderColor: `${roleColor}30`,
              }}>
                <Text style={{ color: roleColor, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
                  {u.requested_role}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              @{u.username} · {u.email}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''}
          </Text>
        </View>

        {/* Wallet */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.surface, borderRadius: 10,
          padding: 10, marginBottom: 12,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Ionicons name={u.wallet_address ? 'wallet' : 'wallet-outline'} size={14}
            color={u.wallet_address ? '#10b981' : colors.textMuted} />
          <Text style={{
            color: u.wallet_address ? colors.text : colors.textMuted,
            fontSize: 11, flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }} numberOfLines={1}>
            {u.wallet_address || 'Wallet no vinculada'}
          </Text>
          {u.wallet_address && (
            <View style={{ backgroundColor: '#10b98118', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '700' }}>VERIFICADA</Text>
            </View>
          )}
        </View>

        {/* Carta */}
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={{
            backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1,
            borderColor: expanded ? `${roleColor}40` : colors.border,
            overflow: 'hidden', marginBottom: 12,
          }}
        >
          <View style={{
            flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
            borderBottomWidth: expanded ? 1 : 0, borderBottomColor: colors.border,
          }}>
            <View style={{
              width: 32, height: 32, borderRadius: 8,
              backgroundColor: `${roleColor}12`,
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="document-text" size={15} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Carta de presentación</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {u.request_message ? `${u.request_message.length} caracteres` : 'Sin mensaje adjunto'}
              </Text>
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textSecondary} />
          </View>
          {expanded && (
            <View style={{ padding: 14 }}>
              {u.request_message ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 2, backgroundColor: `${roleColor}50`, borderRadius: 1, marginTop: 3, alignSelf: 'stretch' }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22, flex: 1, fontStyle: 'italic' }}>
                    "{u.request_message}"
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <Ionicons name="document-outline" size={26} color={colors.border} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>Sin mensaje adjunto</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* Acciones */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onReject}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 10, borderRadius: 12, gap: 6,
              backgroundColor: 'rgba(244,63,94,0.08)',
              borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)',
            }}
          >
            <Ionicons name="close-circle-outline" size={15} color="#f43f5e" />
            <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 13 }}>Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApprove}
            style={{
              flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 10, borderRadius: 12, gap: 6,
              backgroundColor: roleColor,
              ...(Platform.OS === 'web' && { boxShadow: `0 4px 12px ${roleColor}40` }),
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Aprobar acceso</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Active User Card ─────────────────────────────────────────────────────────
function ActiveUserCard({ u, roleColor, roleType, onRevoke, colors }) {
  const [copied, setCopied] = useState(false);
  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const handleCopy = async () => {
    if (!u.wallet_address) return;
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(u.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: u.wallet_address ? 10 : 0 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: `${roleColor}15`, borderWidth: 1.5, borderColor: `${roleColor}28`,
          justifyContent: 'center', alignItems: 'center', marginRight: 12,
        }}>
          <Text style={{ color: roleColor, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{u.full_name || u.username}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>@{u.username} · {u.email}</Text>
        </View>
        <TouchableOpacity
          onPress={onRevoke}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 7,
            backgroundColor: 'rgba(244,63,94,0.07)',
            borderRadius: 10, borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)',
          }}
        >
          <Ionicons name="remove-circle-outline" size={14} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 12 }}>Revocar</Text>
        </TouchableOpacity>
      </View>
      {u.wallet_address && (
        <TouchableOpacity
          onPress={handleCopy}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: `${roleColor}08`, borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 7,
            borderWidth: 1, borderColor: `${roleColor}25`,
          }}
        >
          <Ionicons name={copied ? 'checkmark-circle' : 'wallet'} size={13} color={roleColor} />
          <Text style={{
            flex: 1, fontSize: 11, color: colors.text,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }} numberOfLines={1}>
            {u.wallet_address}
          </Text>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12}
            color={copied ? '#10b981' : colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function AdminScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const { user } = route.params;

  const [loggedUser, setLoggedUser]         = useState(user);
  const [users, setUsers]                   = useState([]);
  const [loadingUsers, setLoadingUsers]     = useState(true);
  const [loadingWallet, setLoadingWallet]   = useState(false);
  const [loadingPause, setLoadingPause]     = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [activeSection, setActiveSection]   = useState('pending');
  const [marketPaused, setMarketPaused]     = useState(null);
  const [logisticsStatus, setLogisticsStatus] = useState(null);
  const [copiedLogistics, setCopiedLogistics] = useState(false);
  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title, message, type = 'error') =>
    setCustomAlert({ visible: true, title, message, type });
  const hideAlert = () => setCustomAlert(a => ({ ...a, visible: false }));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (initial = false) => {
    try {
      if (initial) setLoadingUsers(true);
      const [resMe, resUsers, resLogistics, resMarket] = await Promise.all([
        api.get('/users/me'),
        api.get('/admin/users'),
        api.get('/admin/logistics-status').catch(() => ({ data: null })),
        api.get('/admin/marketplace-status').catch(() => ({ data: null })),
      ]);
      setLoggedUser(resMe.data);
      setUsers(resUsers.data);
      setLogisticsStatus(resLogistics.data);
      if (resMarket.data) setMarketPaused(resMarket.data.paused);
    } catch (e) {
      console.error('Admin fetch error:', e);
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchAll(true);

    const ws = new WebSocket(`${WS_URL}/ws/admin`);
    ws.onmessage = (event) => {
      try {
        const msg = typeof event.data === 'string' ? event.data : '';
        if (
          msg === 'update_users' ||
          msg === 'new_user_registered' ||
          msg.startsWith('new_role_request') ||
          msg.includes('marketplace_paused') ||
          msg.includes('marketplace_resumed')
        ) {
          fetchAll(false);
        }
      } catch {}
    };
    ws.onerror = (e) => console.log('WS Admin error:', e?.message);
    return () => ws.close();
  }, [fetchAll]));

  // ── Acciones ───────────────────────────────────────────────────────────────
  const handleRoleAction = async (userId, action, role = null) => {
    try {
      if (action === 'revoke') {
        await api.post(`/admin/revoke-role/${userId}?role=${role}`);
        showAlert('Rol revocado', `El permiso de ${role} ha sido eliminado.`, 'success');
      } else {
        await api.post(`/admin/approve-role/${userId}?action=${action}`);
        showAlert(
          action === 'approve' ? '¡Aprobado!' : 'Rechazado',
          action === 'approve' ? 'El usuario ya tiene acceso a su panel profesional.' : 'La solicitud ha sido rechazada.',
          action === 'approve' ? 'success' : 'info',
        );
      }
      fetchAll(false);
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo procesar la acción.', 'error');
    }
  };

  const handleToggleMarket = async () => {
    setLoadingPause(true);
    try {
      const endpoint = marketPaused ? '/admin/marketplace-resume' : '/admin/marketplace-pause';
      const { data } = await api.post(endpoint);
      setMarketPaused(data.paused);
      showAlert(
        data.paused ? 'Marketplace pausado' : 'Marketplace reanudado',
        data.paused
          ? 'Las transacciones han sido bloqueadas temporalmente.'
          : 'El marketplace vuelve a estar operativo.',
        data.paused ? 'warning' : 'success',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo cambiar el estado.', 'error');
    } finally {
      setLoadingPause(false);
    }
  };

  const handleConnectWallet = async () => {
    if (Platform.OS !== 'web' || !window.ethereum)
      return showAlert('Atención', 'Usa un navegador con MetaMask.', 'warning');
    try {
      setLoadingWallet(true);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      const { data: { nonce } } = await api.post('/auth/challenge', { address });
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const signature = await signer.signMessage(nonce);
      const { data } = await api.post('/auth/verify', { address, signature, nonce });
      setLoggedUser(data);
      showAlert('Wallet vinculada', 'Tu cuenta Web3 está conectada.', 'success');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'Error de conexión.', 'error');
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') localStorage.clear();
      else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('refreshToken');
        await SecureStore.deleteItemAsync('userData');
      }
    } catch {}
    navigation.replace('Login');
  };

  // ── Derivados ──────────────────────────────────────────────────────────────
  const allPending   = users.filter(u => u.requested_role && !u.is_admin);
  const particulares = users.filter(u => !u.is_admin && !u.roles?.some(r => ['DEALER', 'RELOJERO', 'FABRICANTE'].includes(r)));
  const stats = {
    total:       users.filter(u => !u.is_admin).length,
    pending:     allPending.length,
    relojeros:   users.filter(u => u.roles?.includes('RELOJERO')).length,
    dealers:     users.filter(u => u.roles?.includes('DEALER')).length,
    fabricantes: users.filter(u => u.roles?.includes('FABRICANTE')).length,
  };

  const SECTIONS = [
    { id: 'pending',    label: 'Solicitudes', icon: 'time-outline',       badge: stats.pending },
    { id: 'RELOJERO',   label: 'Relojeros',   icon: 'build-outline',      badge: stats.relojeros   || null },
    { id: 'DEALER',     label: 'Dealers',     icon: 'storefront-outline', badge: stats.dealers     || null },
    { id: 'FABRICANTE', label: 'Fabricantes', icon: 'business-outline',   badge: stats.fabricantes || null },
    { id: 'users',      label: 'Particulares', icon: 'people-outline',    badge: particulares.length || null },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  const bg     = colors.background;
  const cardBg = colors.backgroundAlt;

  const leftPanel = (
    <View style={{ gap: 0 }}>
      {/* Perfil */}
      <View style={{ marginBottom: 16 }}>
        <UserInfo loggedUser={loggedUser} showAlert={showAlert} />
        {!loggedUser?.wallet_address && (
          <View style={{
            backgroundColor: cardBg, borderRadius: 16,
            borderWidth: 1, borderColor: colors.border,
            padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14,
          }}>
            <View style={{
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: 'rgba(246,133,27,0.12)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="wallet-outline" size={20} color="#F6851B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Wallet no vinculada</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Conecta MetaMask para operaciones blockchain</Text>
            </View>
            <TouchableOpacity
              onPress={handleConnectWallet} disabled={loadingWallet}
              style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#F6851B', borderRadius: 12 }}
            >
              {loadingWallet
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Conectar</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Marketplace status */}
      {marketPaused !== null && (
        <MarketplaceStatusCard
          paused={marketPaused}
          loading={loadingPause}
          onToggle={handleToggleMarket}
          colors={colors}
        />
      )}

      {/* Sistema Logístico */}
      {logisticsStatus && (
        <View style={{
          backgroundColor: cardBg, borderRadius: 16, borderWidth: 1,
          borderColor: logisticsStatus.balance_eth === 0
            ? 'rgba(244,63,94,0.35)' : 'rgba(99,102,241,0.2)',
          padding: 14, marginBottom: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 9,
              backgroundColor: 'rgba(99,102,241,0.12)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="send-outline" size={16} color="#6366f1" />
            </View>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 }}>Sistema Logístico</Text>
            {logisticsStatus.balance_eth != null && (
              <Text style={{
                fontWeight: '800', fontSize: 14,
                color: logisticsStatus.balance_eth === 0 ? '#f43f5e'
                  : logisticsStatus.balance_eth < 0.01 ? '#f59e0b' : '#10b981',
              }}>
                {logisticsStatus.balance_eth.toFixed(4)} POL
              </Text>
            )}
          </View>
          <TouchableOpacity
            disabled={!logisticsStatus.address}
            onPress={async () => {
              if (!logisticsStatus.address) return;
              try {
                await Clipboard.setStringAsync(logisticsStatus.address);
                setCopiedLogistics(true);
                setTimeout(() => setCopiedLogistics(false), 2000);
              } catch {}
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.background, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Text numberOfLines={1} style={{
              flex: 1, color: colors.textSecondary, fontSize: 10,
              fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
            }}>
              {logisticsStatus.address || 'No configurada'}
            </Text>
            {logisticsStatus.address && (
              <Ionicons
                name={copiedLogistics ? 'checkmark' : 'copy-outline'}
                size={13}
                color={copiedLogistics ? '#10b981' : colors.textMuted}
              />
            )}
          </TouchableOpacity>
          {logisticsStatus.balance_eth === 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(244,63,94,0.08)', borderRadius: 8,
              padding: 8, marginTop: 10,
              borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)',
            }}>
              <Ionicons name="warning-outline" size={14} color="#f43f5e" />
              <Text style={{ color: '#f43f5e', fontSize: 12, fontWeight: '600' }}>
                Sin fondos — las transacciones blockchain pueden fallar
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Stats */}
      {!loadingUsers && (
        <View style={{ gap: 10, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard icon="people"     value={stats.total}   label="Usuarios"   color={colors.primary}       colors={colors} />
            <StatCard icon="time"       value={stats.pending} label="Pendientes" color="#f59e0b"              colors={colors} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard icon="build"      value={stats.relojeros}   label="Relojeros"   color={roleColors.RELOJERO}   colors={colors} />
            <StatCard icon="storefront" value={stats.dealers}     label="Dealers"     color={roleColors.DEALER}     colors={colors} />
            <StatCard icon="business"   value={stats.fabricantes} label="Fabricantes" color={roleColors.FABRICANTE} colors={colors} />
          </View>
        </View>
      )}
    </View>
  );

  const rightPanel = (
    <View style={{ flex: 1 }}>
      {/* Tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {SECTIONS.map(sec => {
          const isFocused = activeSection === sec.id;
          const secColor = sec.id === 'pending' ? '#f59e0b'
            : sec.id === 'users' ? colors.primary
            : ROLE_META[sec.id]?.color || colors.primary;
          return (
            <Pressable
              key={sec.id}
              onPress={() => setActiveSection(sec.id)}
              style={[
                {
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 14, paddingVertical: 9,
                  borderRadius: 12, borderWidth: 1.5,
                  borderColor: isFocused ? secColor : colors.border,
                  backgroundColor: isFocused ? `${secColor}12` : cardBg,
                },
                Platform.OS === 'web' && { cursor: 'pointer' },
              ]}
            >
              <Ionicons name={sec.icon} size={14} color={isFocused ? secColor : colors.textSecondary} />
              <Text style={{
                color: isFocused ? secColor : colors.textSecondary,
                fontWeight: isFocused ? '700' : '500', fontSize: 13,
              }}>
                {sec.label}
              </Text>
              {sec.badge > 0 && (
                <View style={{
                  backgroundColor: sec.id === 'pending' ? '#f59e0b' : (ROLE_META[sec.id]?.color || colors.primary),
                  borderRadius: 9, minWidth: 18, height: 18,
                  justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{sec.badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Contenido */}
      {loadingUsers ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Cargando datos...</Text>
        </View>
      ) : (
        <>
          {/* Solicitudes */}
          {activeSection === 'pending' && (
            <>
              {allPending.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" title="Todo al día"
                  subtitle="No hay solicitudes de rol pendientes de revisión."
                  color="#10b981" colors={colors} />
              ) : (
                <>
                  <SectionHeader
                    title={`${allPending.length} solicitud${allPending.length !== 1 ? 'es' : ''} pendiente${allPending.length !== 1 ? 's' : ''}`}
                    subtitle="Revisa y aprueba o rechaza el acceso profesional."
                    color="#f59e0b" colors={colors}
                  />
                  {allPending.map(u => {
                    const meta = ROLE_META[u.requested_role] || { color: colors.primary };
                    return (
                      <RequestCard key={u.id} user={u} roleColor={meta.color} colors={colors}
                        onApprove={() => handleRoleAction(u.id, 'approve')}
                        onReject={() => handleRoleAction(u.id, 'reject')}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* Por rol */}
          {['RELOJERO', 'DEALER', 'FABRICANTE'].includes(activeSection) && (() => {
            const meta   = ROLE_META[activeSection];
            const active = users.filter(u => u.roles?.includes(activeSection));
            return (
              <>
                <SectionHeader
                  title={`${active.length} ${meta.label.toLowerCase()} activo${active.length !== 1 ? 's' : ''}`}
                  subtitle={`Gestiona los permisos del rol ${activeSection}.`}
                  color={meta.color} colors={colors}
                />
                {active.length === 0 ? (
                  <EmptyState icon={`${meta.icon}-outline`} title={`Sin ${meta.label.toLowerCase()} aún`}
                    subtitle="Cuando apruebes solicitudes aparecerán aquí."
                    color={meta.color} colors={colors} />
                ) : (
                  active.map(u => (
                    <ActiveUserCard key={u.id} u={u} roleColor={meta.color} roleType={activeSection}
                      colors={colors} onRevoke={() => handleRoleAction(u.id, 'revoke', activeSection)} />
                  ))
                )}
              </>
            );
          })()}

          {/* Particulares */}
          {activeSection === 'users' && (
            <>
              <SectionHeader
                title={`${particulares.length} particular${particulares.length !== 1 ? 'es' : ''}`}
                subtitle="Usuarios registrados sin rol profesional."
                color={colors.primary} colors={colors}
              />
              {particulares.length === 0 ? (
                <EmptyState icon="people-outline" title="Sin particulares"
                  subtitle="No hay usuarios particulares registrados."
                  color={colors.primary} colors={colors} />
              ) : (
                particulares.map(u => {
                  const initials = (u.full_name || u.username || '?')
                    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                  return (
                    <View key={u.id} style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: cardBg, borderRadius: 14,
                      borderWidth: 1, borderColor: colors.border,
                      padding: 12, marginBottom: 10, gap: 12,
                    }}>
                      <View style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: `${colors.primary}12`,
                        borderWidth: 1.5, borderColor: `${colors.primary}28`,
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                          {u.full_name || u.username}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          @{u.username} · {u.email}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : ''}
                      </Text>
                    </View>
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* HEADER */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 56 : 20,
        paddingBottom: 16,
        backgroundColor: cardBg,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        ...(Platform.OS === 'web' && { boxShadow: '0 1px 0 rgba(255,255,255,0.05)' }),
      }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            {Platform.OS === 'web' ? (
              <Image source={require('../../assets/axia-icons/axia-wordmark-purple.svg')}
                style={{ width: 48, height: 16 }} resizeMode="contain" />
            ) : (
              <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900', letterSpacing: 3 }}>AXIA</Text>
            )}
            <View style={{
              backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 3,
              borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)',
            }}>
              <Text style={{ color: '#a855f7', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }}>
                PANEL DE CONTROL
              </Text>
            </View>
            {marketPaused && (
              <View style={{
                backgroundColor: 'rgba(244,63,94,0.12)', borderRadius: 6,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)',
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#f43f5e' }} />
                <Text style={{ color: '#f43f5e', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>
                  MARKETPLACE PAUSADO
                </Text>
              </View>
            )}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {loggedUser?.full_name || loggedUser?.username}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9,
            backgroundColor: 'rgba(244,63,94,0.08)',
            borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)',
          }}
        >
          <Ionicons name="log-out-outline" size={15} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 13 }}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* BODY */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(false); }}
            tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          // Layout escritorio: dos columnas
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start',
            maxWidth: 1100, alignSelf: 'center', width: '100%',
            padding: 24, gap: 24,
          }}>
            <View style={{ width: 340 }}>{leftPanel}</View>
            <View style={{ flex: 1 }}>{rightPanel}</View>
          </View>
        ) : (
          // Layout móvil: columna única
          <View style={{ maxWidth: 860, alignSelf: 'center', width: '100%', padding: 16 }}>
            {leftPanel}
            <View style={{ marginTop: 8 }}>{rightPanel}</View>
          </View>
        )}
      </ScrollView>

      {/* MODAL ALERTAS */}
      <Modal visible={customAlert.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: cardBg, borderRadius: 22,
            padding: 28, width: '85%', maxWidth: 360,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
            ...(Platform.OS === 'web' && { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }),
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: `${alertColors[customAlert.type] || alertColors.info}12`,
              justifyContent: 'center', alignItems: 'center', marginBottom: 16,
            }}>
              <Ionicons
                name={
                  customAlert.type === 'success' ? 'checkmark-circle' :
                  customAlert.type === 'warning' ? 'warning' :
                  customAlert.type === 'info'    ? 'information-circle' : 'alert-circle'
                }
                size={36}
                color={alertColors[customAlert.type] || alertColors.info}
              />
            </View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
              {customAlert.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              {customAlert.message}
            </Text>
            <TouchableOpacity
              onPress={hideAlert}
              style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, color, colors }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <View style={{ width: 3, height: 16, backgroundColor: color, borderRadius: 2 }} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, paddingLeft: 11 }}>{subtitle}</Text>
    </View>
  );
}

function EmptyState({ icon, title, subtitle, color, colors }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <View style={{
        width: 68, height: 68, borderRadius: 34,
        backgroundColor: `${color}10`, borderWidth: 1.5, borderColor: `${color}22`,
        justifyContent: 'center', alignItems: 'center', marginBottom: 14,
      }}>
        <Ionicons name={icon} size={30} color={`${color}70`} />
      </View>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 5 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 260 }}>{subtitle}</Text>
    </View>
  );
}
