import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Modal, RefreshControl, Pressable, Image,
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

// Paleta de roles 
const ROLE_META = {
  RELOJERO:   { icon: 'build',       label: 'Relojeros',    color: roleColors.RELOJERO  },
  DEALER:     { icon: 'storefront',  label: 'Dealers',      color: roleColors.DEALER    },
  FABRICANTE: { icon: 'business',    label: 'Fabricantes',  color: roleColors.FABRICANTE },
};

// Tarjeta de estadística 
function StatCard({ icon, value, label, color, colors }) {
  return (
    <View style={{
      flex: 1, minWidth: 90,
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: `${color}30`,
      alignItems: 'center',
      ...(Platform.OS === 'web' && { boxShadow: `0 2px 12px ${color}15` }),
    }}>
      <View style={{
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: `${color}18`,
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
      }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ color, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// Tarjeta de solicitud profesional 
function RequestCard({ user: u, roleColor, roleMeta, onApprove, onReject, colors }) {
  const [expanded, setExpanded] = useState(false);

  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 18, borderWidth: 1.5,
      borderColor: `${roleColor}35`,
      marginBottom: 14, overflow: 'hidden',
      ...(Platform.OS === 'web' && { boxShadow: `0 4px 20px ${roleColor}12` }),
    }}>
      {/* Banda de color superior */}
      <View style={{ height: 3, backgroundColor: roleColor }} />

      <View style={{ padding: 16 }}>
        {/* Cabecera usuario */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          {/* Avatar */}
          <View style={{
            width: 46, height: 46, borderRadius: 23,
            backgroundColor: `${roleColor}20`,
            borderWidth: 2, borderColor: `${roleColor}40`,
            justifyContent: 'center', alignItems: 'center', marginRight: 12,
          }}>
            <Text style={{ color: roleColor, fontWeight: '800', fontSize: 16 }}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                {u.full_name || u.username}
              </Text>
              <View style={{
                backgroundColor: `${roleColor}18`, borderRadius: 6,
                paddingHorizontal: 7, paddingVertical: 2,
                borderWidth: 1, borderColor: `${roleColor}35`,
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
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 10, padding: 10, marginBottom: 12,
          borderWidth: 1, borderColor: colors.border,
          gap: 8,
        }}>
          <Ionicons
            name={u.wallet_address ? 'wallet' : 'wallet-outline'}
            size={15}
            color={u.wallet_address ? '#10b981' : colors.textMuted}
          />
          <Text style={{
            color: u.wallet_address ? colors.text : colors.textMuted,
            fontSize: 11, flex: 1,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }} numberOfLines={1} selectable>
            {u.wallet_address || 'Wallet no vinculada'}
          </Text>
          {u.wallet_address && (
            <View style={{ backgroundColor: '#10b98120', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '700' }}>VERIFICADA</Text>
            </View>
          )}
        </View>

        {/* Documento de solicitud */}
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12, borderWidth: 1,
            borderColor: expanded ? `${roleColor}40` : colors.border,
            overflow: 'hidden', marginBottom: 14,
          }}
        >
          {/* Cabecera del documento */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            padding: 12, gap: 10,
            borderBottomWidth: expanded ? 1 : 0,
            borderBottomColor: colors.border,
          }}>
            <View style={{
              width: 34, height: 34, borderRadius: 9,
              backgroundColor: `${roleColor}15`,
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="document-text" size={16} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                Carta de presentación
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {u.request_message
                  ? `${u.request_message.length} caracteres · Adjunto por el solicitante`
                  : 'Sin mensaje adjunto'}
              </Text>
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textSecondary}
            />
          </View>

          {/* Contenido expandido */}
          {expanded && (
            <View style={{ padding: 14 }}>
              {u.request_message ? (
                <>
                  {/* Línea decorativa tipo documento */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 2, backgroundColor: `${roleColor}50`, borderRadius: 1, marginTop: 3, alignSelf: 'stretch' }} />
                    <Text style={{
                      color: colors.textSecondary, fontSize: 14,
                      lineHeight: 22, flex: 1, fontStyle: 'italic',
                    }}>
                      "{u.request_message}"
                    </Text>
                  </View>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
                  }}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      Documento recibido · En proceso de revisión
                    </Text>
                  </View>
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Ionicons name="document-outline" size={28} color={colors.border} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
                    El solicitante no adjuntó mensaje
                  </Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* Botones de acción */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onReject}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 11, borderRadius: 12, gap: 6,
              backgroundColor: 'rgba(244,63,94,0.08)',
              borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)',
            }}
          >
            <Ionicons name="close-circle-outline" size={16} color="#f43f5e" />
            <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 14 }}>Rechazar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onApprove}
            style={{
              flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 11, borderRadius: 12, gap: 6,
              backgroundColor: roleColor,
              ...(Platform.OS === 'web' && { boxShadow: `0 4px 12px ${roleColor}40` }),
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Aprobar acceso</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Tarjeta de usuario activo 
function ActiveUserCard({ u, roleColor, roleType, onRevoke, colors }) {
  const [copied, setCopied] = useState(false);
  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const handleCopyWallet = async () => {
    if (!u.wallet_address) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(u.wallet_address);
      }
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
      {/* Fila superior: avatar + nombre + revocar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: u.wallet_address ? 10 : 0 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: `${roleColor}18`,
          borderWidth: 1.5, borderColor: `${roleColor}30`,
          justifyContent: 'center', alignItems: 'center', marginRight: 12,
        }}>
          <Text style={{ color: roleColor, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
            {u.full_name || u.username}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            @{u.username} · {u.email}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRevoke}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 7,
            backgroundColor: 'rgba(244,63,94,0.08)',
            borderRadius: 10, borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)',
          }}
        >
          <Ionicons name="remove-circle-outline" size={14} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 12 }}>Revocar</Text>
        </TouchableOpacity>
      </View>

      {/* Fila de wallet */}
      <TouchableOpacity
        onPress={handleCopyWallet}
        disabled={!u.wallet_address}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: u.wallet_address ? `${roleColor}0d` : colors.surface,
          borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
          borderWidth: 1,
          borderColor: u.wallet_address ? `${roleColor}30` : colors.border,
        }}
      >
        <Ionicons
          name={u.wallet_address ? (copied ? 'checkmark-circle' : 'wallet') : 'wallet-outline'}
          size={13}
          color={u.wallet_address ? roleColor : colors.textMuted}
        />
        <Text style={{
          flex: 1, fontSize: 11,
          color: u.wallet_address ? colors.text : colors.textMuted,
          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        }} numberOfLines={1}>
          {u.wallet_address || 'Sin wallet vinculada'}
        </Text>
        {u.wallet_address && (
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={12}
            color={copied ? '#10b981' : colors.textMuted}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

// Pantalla principal 
export default function AdminScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { user } = route.params;

  const [loggedUser, setLoggedUser]     = useState(user);
  const [users, setUsers]               = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeSection, setActiveSection] = useState('pending');

  const [logisticsStatus, setLogisticsStatus] = useState(null);
  const [copiedLogistics, setCopiedLogistics] = useState(false);

  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
  const showAlert = (title, message, type = 'error') =>
    setCustomAlert({ visible: true, title, message, type });
  const hideAlert = () => setCustomAlert(a => ({ ...a, visible: false }));

  // Fetch
  const fetchUsers = useCallback(async (initial = false) => {
    try {
      if (initial) setLoadingUsers(true);
      const [resMe, resUsers, resLogistics] = await Promise.all([
        api.get('/users/me'),
        api.get('/admin/users'),
        api.get('/admin/logistics-status').catch(() => ({ data: null })),
      ]);
      setLoggedUser(resMe.data);
      setUsers(resUsers.data);
      setLogisticsStatus(resLogistics.data);
    } catch (e) {
      console.error('Admin fetch error:', e);
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchUsers(true);

    const ws = new WebSocket(`${WS_URL}/ws/admin`);
    ws.onmessage = (event) => {
      const msg = event.data;
      if (msg === 'update_users' || msg === 'new_user_registered' || msg.startsWith('new_role_request')) {
        fetchUsers(false);
      }
    };
    ws.onerror = (e) => console.log('WS Admin error:', e.message);
    return () => ws.close();
  }, [fetchUsers]));

  // Acciones de rol 
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
          action === 'approve' ? 'success' : 'info'
        );
      }
      fetchUsers(false);
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo procesar la acción.', 'error');
    }
  };

  const handleConnectWallet = async () => {
    if (Platform.OS !== 'web' || !window.ethereum) {
      return showAlert('Atención', 'Usa un navegador con MetaMask.', 'warning');
    }
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

  // Derivados
  const allPending   = users.filter(u => u.requested_role && !u.is_admin);
  const newUsers     = users.filter(u => !u.is_admin && !(u.roles?.length > 0) && !u.requested_role);
  const particulares = users.filter(u => !u.is_admin && !u.roles?.some(r => ['DEALER', 'RELOJERO', 'FABRICANTE'].includes(r)));
  const stats = {
    total:      users.filter(u => !u.is_admin).length,
    pending:    allPending.length,
    relojeros:  users.filter(u => u.roles?.includes('RELOJERO')).length,
    dealers:    users.filter(u => u.roles?.includes('DEALER')).length,
    fabricantes:users.filter(u => u.roles?.includes('FABRICANTE')).length,
  };

  const SECTIONS = [
    { id: 'pending',    label: 'Solicitudes', icon: 'time-outline',      badge: stats.pending },
    { id: 'RELOJERO',   label: 'Relojeros',   icon: 'build-outline',     badge: users.filter(u => u.roles?.includes('RELOJERO')).length   || null },
    { id: 'DEALER',     label: 'Dealers',     icon: 'storefront-outline', badge: users.filter(u => u.roles?.includes('DEALER')).length     || null },
    { id: 'FABRICANTE', label: 'Fabricantes', icon: 'business-outline',  badge: users.filter(u => u.roles?.includes('FABRICANTE')).length  || null },
    { id: 'users',      label: 'Particulares', icon: 'people-outline',    badge: particulares.length || null },
  ];

  const bg     = colors.background;
  const cardBg = colors.backgroundAlt;

  // Render
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
      }}>
        {/* Logo + título */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Image
              source={require('../../assets/axia-icons/axia-icon-rounded-purple.svg')}
              style={{ width: 22, height: 22 }}
              resizeMode="contain"
            />
            {Platform.OS === 'web' ? (
              <Image
                source={require('../../assets/axia-icons/axia-wordmark-purple.svg')}
                style={{ width: 48, height: 16 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900', letterSpacing: 3 }}>
                AXIA
              </Text>
            )}
            <View style={{
              backgroundColor: `${alertColors.error}15`, borderRadius: 6,
              paddingHorizontal: 7, paddingVertical: 2,
              borderWidth: 1, borderColor: `${alertColors.error}30`,
            }}>
              <Text style={{ color: alertColors.error, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>
                ADMIN
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {loggedUser?.full_name || loggedUser?.username}
          </Text>
        </View>

        {/* Controles */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 9,
              backgroundColor: 'rgba(244,63,94,0.1)',
              borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)',
            }}
          >
            <Ionicons name="log-out-outline" size={16} color="#f43f5e" />
            <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 13 }}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchUsers(false); }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ maxWidth: 860, alignSelf: 'center', width: '100%', paddingHorizontal: 16 }}>

          {/* PERFIL + WALLET */}
          <View style={{ marginTop: 16, marginBottom: 16 }}>
            <UserInfo loggedUser={loggedUser} showAlert={showAlert} />
            {!loggedUser?.wallet_address && (
              <View style={{
                backgroundColor: cardBg, borderRadius: 16,
                borderWidth: 1, borderColor: colors.border, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
              }}>
                <View style={{
                  width: 46, height: 46, borderRadius: 13,
                  backgroundColor: 'rgba(246,133,27,0.15)',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Ionicons name="wallet-outline" size={22} color="#F6851B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                    Wallet no vinculada
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Conecta MetaMask para operaciones blockchain
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleConnectWallet}
                  disabled={loadingWallet}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 9,
                    backgroundColor: '#F6851B', borderRadius: 12,
                  }}
                >
                  {loadingWallet
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Conectar</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/*  WALLET LOGÍSTICA */}
          {logisticsStatus && (
            <View style={{
              backgroundColor: cardBg, borderRadius: 16,
              borderWidth: 1,
              borderColor: logisticsStatus.balance_eth === 0
                ? 'rgba(244,63,94,0.4)'
                : logisticsStatus.balance_eth != null && logisticsStatus.balance_eth < 0.01
                  ? 'rgba(245,158,11,0.4)'
                  : 'rgba(99,102,241,0.25)',
              padding: 14,
              marginBottom: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: logisticsStatus.balance_eth === 0
                  ? 'rgba(244,63,94,0.15)'
                  : 'rgba(99,102,241,0.15)',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons
                  name="send-outline"
                  size={20}
                  color={logisticsStatus.balance_eth === 0 ? '#f43f5e' : '#6366f1'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>
                  Sistema Logístico
                </Text>
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
                    backgroundColor: colors.background,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: colors.textSecondary,
                      fontSize: 10,
                      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                      letterSpacing: 0.3,
                    }}
                  >
                    {logisticsStatus.address || 'No configurada'}
                  </Text>
                  {logisticsStatus.address && (
                    <Ionicons
                      name={copiedLogistics ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copiedLogistics ? '#10b981' : colors.textMuted}
                    />
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {logisticsStatus.balance_eth != null ? (
                  <Text style={{
                    fontWeight: '800', fontSize: 15,
                    color: logisticsStatus.balance_eth === 0
                      ? '#f43f5e'
                      : logisticsStatus.balance_eth < 0.01
                        ? '#f59e0b'
                        : '#10b981',
                  }}>
                    {logisticsStatus.balance_eth.toFixed(4)} POL
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Sin datos</Text>
                )}
                {logisticsStatus.balance_eth === 0 && (
                  <View style={{
                    backgroundColor: 'rgba(244,63,94,0.12)', borderRadius: 6,
                    paddingHorizontal: 6, paddingVertical: 2,
                    borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)',
                  }}>
                    <Text style={{ color: '#f43f5e', fontSize: 10, fontWeight: '700' }}>
                      ⚠ SIN FONDOS
                    </Text>
                  </View>
                )}
                {logisticsStatus.balance_eth != null && logisticsStatus.balance_eth > 0 && logisticsStatus.balance_eth < 0.01 && (
                  <View style={{
                    backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 6,
                    paddingHorizontal: 6, paddingVertical: 2,
                    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                  }}>
                    <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '700' }}>
                      SALDO BAJO
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ESTADÍSTICAS */}
          {!loadingUsers && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatCard icon="people"          value={stats.total}      label="Usuarios"    color={colors.primary}            colors={colors} />
              <StatCard icon="time"            value={stats.pending}    label="Pendientes"  color="#f59e0b"                   colors={colors} />
              <StatCard icon="build"           value={stats.relojeros}  label="Relojeros"   color={roleColors.RELOJERO}        colors={colors} />
              <StatCard icon="storefront"      value={stats.dealers}    label="Dealers"     color={roleColors.DEALER}          colors={colors} />
              <StatCard icon="business"        value={stats.fabricantes}label="Fabricantes" color={roleColors.FABRICANTE}      colors={colors} />
            </View>
          )}

          {/* TABS DE SECCIÓN */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
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
                      paddingHorizontal: 16, paddingVertical: 10,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: isFocused ? secColor : colors.border,
                      backgroundColor: isFocused ? `${secColor}15` : cardBg,
                    },
                    Platform.OS === 'web' && { cursor: 'pointer' },
                  ]}
                >
                  <Ionicons name={sec.icon} size={15} color={isFocused ? secColor : colors.textSecondary} />
                  <Text style={{
                    color: isFocused ? secColor : colors.textSecondary,
                    fontWeight: isFocused ? '700' : '500', fontSize: 14,
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

          {/*  CONTENIDO  */}
          {loadingUsers ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Cargando datos...</Text>
            </View>
          ) : (

            <>
              {/* SOLICITUDES PENDIENTES */}
              {activeSection === 'pending' && (
                <>
                  {allPending.length === 0 ? (
                    <EmptyState
                      icon="checkmark-circle-outline"
                      title="Todo al día"
                      subtitle="No hay solicitudes de rol pendientes de revisión."
                      color="#10b981"
                      colors={colors}
                    />
                  ) : (
                    <>
                      <SectionHeader
                        title={`${allPending.length} solicitud${allPending.length !== 1 ? 'es' : ''} pendiente${allPending.length !== 1 ? 's' : ''}`}
                        subtitle="Revisa cada solicitud y aprueba o rechaza el acceso profesional."
                        color="#f59e0b"
                        colors={colors}
                      />
                      {allPending.map(u => {
                        const meta = ROLE_META[u.requested_role] || { color: colors.primary };
                        return (
                          <RequestCard
                            key={u.id}
                            user={u}
                            roleColor={meta.color}
                            colors={colors}
                            onApprove={() => handleRoleAction(u.id, 'approve')}
                            onReject={() => handleRoleAction(u.id, 'reject')}
                          />
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {/* SECCIÓN POR ROL */}
              {['RELOJERO', 'DEALER', 'FABRICANTE'].includes(activeSection) && (() => {
                const meta = ROLE_META[activeSection];
                const active = users.filter(u => u.roles?.includes(activeSection));
                return (
                  <>
                    <SectionHeader
                      title={`${active.length} ${meta.label.toLowerCase()} activo${active.length !== 1 ? 's' : ''}`}
                      subtitle={`Gestiona los permisos del rol ${activeSection}.`}
                      color={meta.color}
                      colors={colors}
                    />
                    {active.length === 0 ? (
                      <EmptyState
                        icon={`${meta.icon}-outline`}
                        title={`Sin ${meta.label.toLowerCase()} aún`}
                        subtitle="Cuando apruebes solicitudes aparecerán aquí."
                        color={meta.color}
                        colors={colors}
                      />
                    ) : (
                      active.map(u => (
                        <ActiveUserCard
                          key={u.id}
                          u={u}
                          roleColor={meta.color}
                          roleType={activeSection}
                          colors={colors}
                          onRevoke={() => handleRoleAction(u.id, 'revoke', activeSection)}
                        />
                      ))
                    )}
                  </>
                );
              })()}

              {/* NUEVOS USUARIOS */}
              {activeSection === 'users' && (
                <>
                  <SectionHeader
                    title={`${particulares.length} particular${particulares.length !== 1 ? 'es' : ''}`}
                    subtitle="Usuarios registrados sin rol profesional."
                    color={colors.primary}
                    colors={colors}
                  />
                  {particulares.length === 0 ? (
                    <EmptyState
                      icon="people-outline"
                      title="Sin particulares"
                      subtitle="No hay usuarios particulares registrados."
                      color={colors.primary}
                      colors={colors}
                    />
                  ) : (
                    particulares.map(u => {
                      const initials = (u.full_name || u.username || '?')
                        .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                      return (
                        <View key={u.id} style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: cardBg,
                          borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                          padding: 12, marginBottom: 10, gap: 12,
                        }}>
                          <View style={{
                            width: 40, height: 40, borderRadius: 20,
                            backgroundColor: `${colors.primary}15`,
                            borderWidth: 1.5, borderColor: `${colors.primary}30`,
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
              backgroundColor: `${alertColors[customAlert.type] || alertColors.info}15`,
              justifyContent: 'center', alignItems: 'center', marginBottom: 16,
            }}>
              <Ionicons
                name={
                  customAlert.type === 'success' ? 'checkmark-circle' :
                  customAlert.type === 'warning' ? 'warning' :
                  customAlert.type === 'info' ? 'information-circle' : 'alert-circle'
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
              style={{
                backgroundColor: colors.primary, borderRadius: 14,
                paddingVertical: 13, width: '100%', alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

//  Helpers de UI
function SectionHeader({ title, subtitle, color, colors }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <View style={{ width: 3, height: 18, backgroundColor: color, borderRadius: 2 }} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, paddingLeft: 11 }}>{subtitle}</Text>
    </View>
  );
}

function EmptyState({ icon, title, subtitle, color, colors }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: `${color}12`,
        borderWidth: 1.5, borderColor: `${color}25`,
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
      }}>
        <Ionicons name={icon} size={32} color={`${color}80`} />
      </View>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', maxWidth: 260 }}>{subtitle}</Text>
    </View>
  );
}
