import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import { useFocusEffect } from '@react-navigation/native';
import api, { getToken, WS_URL } from '../api/api';
import { resolveImageUri } from '../utils/ipfs';
import { useTheme } from '../context/ThemeContext';
import { roleColors } from '../themes/styles';
import GlobalHeader from '../components/GlobalHeader';
import Marketplace_ABI from '../contracts/WatchMarketplace.json';

const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';

const STATE_INFO = {
  1: { label: 'En venta',   color: '#8b5cf6', icon: 'pricetag-outline'       },
  2: { label: 'Reservado',  color: '#f59e0b', icon: 'lock-closed-outline'     },
  3: { label: 'Enviado',    color: '#38bdf8', icon: 'cube-outline'            },
  4: { label: 'Verificado', color: '#10b981', icon: 'shield-checkmark-outline' },
  5: { label: 'Completado', color: '#10b981', icon: 'checkmark-circle-outline' },
  6: { label: 'Rechazado',  color: '#ef4444', icon: 'close-circle-outline'   },
};

const ROLE_ICONS = {
  FABRICANTE: 'construct', DEALER: 'storefront',
  RELOJERO: 'build', ADMIN: 'shield-checkmark', PARTICULAR: 'person',
};

export default function SaleScreen({ route, navigation }) {
  const { listingId, tokenId } = route.params || {};
  const { colors } = useTheme();

  const [loggedUser, setLoggedUser] = useState(null);
  const [sale, setSale]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [metaMaskVisible, setMetaMaskVisible] = useState(false);
  const [successVisible, setSuccessVisible]   = useState(false);
  const [successMsg, setSuccessMsg]           = useState('');
  const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'error' });

  const showAlert = (title, message, type = 'error') =>
    setAlert({ visible: true, title, message, type });

  const fetchSale = useCallback(async () => {
    try {
      setLoading(true);
      const [saleRes, userRes] = await Promise.all([
        api.get(listingId ? `/marketplace/sale/listing/${listingId}` : `/marketplace/sale/${tokenId}`),
        api.get('/users/me'),
      ]);
      setSale(saleRes.data);
      setLoggedUser(userRes.data);
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo cargar la venta.', 'error');
    } finally {
      setLoading(false);
    }
  }, [listingId, tokenId]);

  useFocusEffect(useCallback(() => { fetchSale(); }, [fetchSale]));

  // WebSocket: recarga automática cuando el relojero verifica (update_users al comprador/vendedor)
  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    let retryTimeout;
    let dead = false;

    const connect = () => {
      getToken().then(token => {
        ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
        ws.onmessage = (event) => {
          if (event.data === 'update_users' || event.data === 'update_marketplace') fetchSale();
        };
        ws.onclose = () => {
          if (!dead) retryTimeout = setTimeout(connect, 3000);
        };
      });
    };

    connect();
    return () => {
      dead = true;
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [loggedUser?.id, fetchSale]);

  const handleConfirmShipment = async () => {
    try {
      setActionLoading(true);
      const res = await api.post(`/marketplace/ship/${sale.token_id}`);
      if (res.data?.blockchain_warning) {
        showAlert('Envío registrado', 'Envío confirmado en la base de datos. Nota: la transacción blockchain no pudo ejecutarse, pero el flujo continúa.', 'warning');
      } else {
        showSuccess('Envío confirmado', 'Se ha notificado al comprador. Un relojero certificará el reloj.');
      }
      fetchSale();
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo confirmar el envío.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (Platform.OS !== 'web' || !window.ethereum) {
      showAlert('MetaMask requerido', 'Necesitas MetaMask conectado para confirmar la entrega.', 'warning');
      return;
    }
    try {
      setActionLoading(true);
      setMetaMaskVisible(true);
      const provider    = new ethers.BrowserProvider(window.ethereum);
      const signer      = await provider.getSigner();
      const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);

      let blockchainWarning = null;
      try {
        const tx = await marketplace.confirmDelivery(sale.token_id);
        await tx.wait();
      } catch (blockchainErr) {
        if (blockchainErr?.code === 'ACTION_REJECTED') throw blockchainErr;
        blockchainWarning = true;
        console.warn('[CONFIRM DELIVERY] blockchain no-fatal:', blockchainErr?.message);
      }

      setMetaMaskVisible(false);
      await api.post(`/marketplace/confirm-delivery/${sale.token_id}`);
      showSuccess(
        '¡Entrega confirmada!',
        blockchainWarning
          ? 'Entrega registrada en la base de datos. La transacción blockchain no pudo ejecutarse.'
          : 'El reloj ya es tuyo y el pago se ha liberado al vendedor.'
      );
    } catch (e) {
      setMetaMaskVisible(false);
      if (e.code === 'ACTION_REJECTED') {
        showAlert('Cancelado', 'Rechazaste la operación en MetaMask.', 'warning');
      } else {
        showAlert('Error', e.response?.data?.detail || e.message || 'No se pudo confirmar la entrega.', 'error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestReverification = async () => {
    try {
      setActionLoading(true);
      await api.post(`/marketplace/request-reverification/${sale.token_id}`);
      showSuccess('Re-verificación solicitada', 'Se ha asignado un relojero para certificar tu reloj. Recibirás una notificación cuando concluya.');
      fetchSale();
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo solicitar la re-verificación.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const showSuccess = (title, message) => {
    setSuccessMsg({ title, message });
    setSuccessVisible(true);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
        <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Venta no encontrada</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stateInfo = STATE_INFO[sale.listing_state] || STATE_INFO[1];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      <GlobalHeader
        loggedUser={loggedUser}
        title="Detalle de venta"
        navigation={navigation}
      />

      {/* Badge de estado */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: colors.backgroundAlt,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Token #{sale.token_id}</Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: stateInfo.color + '18',
          borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
          borderWidth: 1, borderColor: stateInfo.color + '40',
        }}>
          <Ionicons name={stateInfo.icon} size={13} color={stateInfo.color} />
          <Text style={{ color: stateInfo.color, fontSize: 12, fontWeight: '700' }}>{stateInfo.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Botón volver */}
        <TouchableOpacity
          onPress={() => navigation?.canGoBack() ? navigation.goBack() : navigation?.navigate('Marketplace')}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 6,
            backgroundColor: colors.surface,
            borderRadius: 20, borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Ionicons name="arrow-back" size={15} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Volver</Text>
        </TouchableOpacity>

        {/* Tarjeta del reloj */}
        <View style={{
          backgroundColor: colors.backgroundAlt, borderRadius: 16,
          borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
        }}>
          {sale.image ? (
            <Image
              source={{ uri: resolveImageUri(sale.image) }}
              style={{ width: '100%', height: 200 }}
              resizeMode="contain"
            />
          ) : (
            <View style={{
              width: '100%', height: 160,
              backgroundColor: colors.surface,
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons name="watch-outline" size={52} color={colors.border} />
            </View>
          )}
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>
              {sale.brand} {sale.model}
            </Text>
            {sale.manufacturing_year && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                Año {sale.manufacturing_year}
              </Text>
            )}
          </View>
        </View>

        {/* Precio */}
        <View style={{
          backgroundColor: colors.backgroundAlt, borderRadius: 16,
          borderWidth: 1, borderColor: colors.border,
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: colors.primary + '18',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Precio de venta</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
              {sale.price_usdc.toLocaleString()} <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>USDC</Text>
            </Text>
          </View>
          {!sale.is_p2p && (
            <View style={{
              marginLeft: 'auto', backgroundColor: '#10b98118',
              borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
              borderWidth: 1, borderColor: '#10b98130',
            }}>
              <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>Sin peritaje</Text>
            </View>
          )}
        </View>

        {/* Partes de la transacción */}
        <View style={{
          backgroundColor: colors.backgroundAlt, borderRadius: 16,
          borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14,
        }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Partes
          </Text>
          <PartyRow label="Vendedor" user={sale.seller} wallet={sale.seller_wallet} isSelf={sale.is_seller} colors={colors} navigation={navigation} />
          {sale.buyer_wallet && (
            <PartyRow label="Comprador" user={sale.buyer} wallet={sale.buyer_wallet} isSelf={sale.is_buyer} colors={colors} navigation={navigation} />
          )}
          {sale.assigned_watchmaker && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: roleColors.RELOJERO + '18',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="build-outline" size={17} color={roleColors.RELOJERO} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Relojero asignado</Text>
                <TouchableOpacity
                  onPress={() => Clipboard.setStringAsync(sale.assigned_watchmaker)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}
                >
                  <Text style={{
                    color: roleColors.RELOJERO,
                    fontSize: 12,
                    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                    fontWeight: '600',
                  }}>
                    {sale.assigned_watchmaker}
                  </Text>
                  <Ionicons name="copy-outline" size={13} color={roleColors.RELOJERO} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/*  Línea de tiempo de estado */}
        <StateTimeline state={sale.listing_state} is_p2p={sale.is_p2p} colors={colors} />

        {/* Acción principal */}
        {sale.is_seller && sale.listing_state === 2 && sale.is_p2p && (
          <ActionButton
            icon="cube-outline"
            label="Confirmar envío"
            description="Indica que has enviado el paquete físicamente. Se asignará un relojero."
            color="#f59e0b"
            loading={actionLoading}
            onPress={handleConfirmShipment}
            colors={colors}
          />
        )}

        {sale.is_buyer && ((!sale.is_p2p && sale.listing_state === 3) || (sale.is_p2p && sale.listing_state === 4)) && (
          <ActionButton
            icon="checkmark-circle-outline"
            label="Confirmar recepción"
            description="Confirma que has recibido el reloj. Se liberará el pago al vendedor."
            color="#10b981"
            loading={actionLoading}
            onPress={handleConfirmDelivery}
            colors={colors}
          />
        )}

        {sale.is_buyer && sale.is_p2p && sale.listing_state === 3 && (
          <View style={{
            backgroundColor: '#38bdf815', borderRadius: 16,
            borderWidth: 1, borderColor: '#38bdf840', padding: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#38bdf8" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#38bdf8', fontWeight: '700', fontSize: 14 }}>Esperando peritaje</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                Un relojero está verificando la autenticidad del reloj. Podrás confirmar la recepción cuando concluya.
              </Text>
            </View>
          </View>
        )}

        {/* Bloque de rechazo (estado 6)*/}
        {sale.listing_state === 6 && (
          <View style={{
            backgroundColor: '#ef444410', borderRadius: 16,
            borderWidth: 1, borderColor: '#ef444430', padding: 16, gap: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: '#ef444420',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 15 }}>Peritaje fallido</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  El relojero no ha certificado la autenticidad del reloj.
                </Text>
              </View>
            </View>

            {sale.watchmaker_comment && (
              <View style={{
                backgroundColor: colors.surface, borderRadius: 10,
                borderWidth: 1, borderColor: colors.border, padding: 12,
              }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>
                  OPINIÓN DEL RELOJERO
                </Text>
                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, fontStyle: 'italic' }}>
                  "{sale.watchmaker_comment}"
                </Text>
              </View>
            )}

            {sale.is_buyer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  Tu dinero ha sido reembolsado íntegramente a tu wallet.
                </Text>
              </View>
            )}

            {sale.is_seller && sale.seller_deposit_usdc > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="wallet-outline" size={16} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  Has perdido la fianza de {sale.seller_deposit_usdc.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Acción: solicitar re-verificación (vendedor, estado 6) */}
        {sale.is_seller && sale.listing_state === 6 && (
          <ActionButton
            icon="refresh-outline"
            label="Solicitar nueva certificación"
            description="Se asignará un relojero para que verifique el reloj de nuevo. El proceso es gratuito."
            color="#8b5cf6"
            loading={actionLoading}
            onPress={handleRequestReverification}
            colors={colors}
          />
        )}

      </ScrollView>

      {/* Overlay MetaMask */}
      <Modal visible={metaMaskVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Esperando MetaMask…</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Confirma la transacción en tu wallet</Text>
        </View>
      </Modal>

      {/* Modal éxito */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 24,
            padding: 28, width: '100%', maxWidth: 340,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: 10,
          }}>
            <Ionicons name="checkmark-circle" size={56} color="#10b981" />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>
              {successMsg?.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              {successMsg?.message}
            </Text>
            <TouchableOpacity
              onPress={() => { setSuccessVisible(false); navigation.navigate('Perfil'); }}
              style={{
                marginTop: 6, backgroundColor: colors.primary, borderRadius: 24,
                paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ver mi colección</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/*  Modal alerta */}
      <Modal visible={alert.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 24,
            padding: 28, width: '100%', maxWidth: 340,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: 10,
          }}>
            <Ionicons
              name={alert.type === 'error' ? 'close-circle' : alert.type === 'warning' ? 'warning' : 'information-circle'}
              size={52}
              color={alert.type === 'error' ? '#ef4444' : alert.type === 'warning' ? '#f59e0b' : colors.primary}
            />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, textAlign: 'center' }}>{alert.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{alert.message}</Text>
            <TouchableOpacity
              onPress={() => setAlert(a => ({ ...a, visible: false }))}
              style={{
                marginTop: 6, backgroundColor: colors.primary, borderRadius: 24,
                paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center',
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

// Componente fila de participante
function PartyRow({ label, user, wallet, isSelf, colors, navigation }) {
  const primaryRole = user?.roles?.[0];
  const rc = roleColors[primaryRole] || roleColors.PARTICULAR;
  const iconName = ROLE_ICONS[primaryRole] || 'person';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: rc + '18',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Ionicons name={iconName} size={17} color={rc} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}{isSelf ? ' (tú)' : ''}</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
          {user?.username || '—'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {primaryRole && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: rc + '15', borderRadius: 6,
              paddingHorizontal: 5, paddingVertical: 2,
            }}>
              <Text style={{ color: rc, fontSize: 10, fontWeight: '700' }}>{primaryRole}</Text>
            </View>
          )}
          {user?.id && !isSelf && (
            <TouchableOpacity
              onPress={() => navigation?.navigate('PublicProfile', { userId: user.id })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: rc + '15', borderRadius: 6,
                paddingHorizontal: 7, paddingVertical: 2,
              }}
            >
              <Ionicons name="person-outline" size={11} color={rc} />
              <Text style={{ color: rc, fontSize: 10, fontWeight: '700' }}>Ver perfil</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// Línea de tiempo del estado
function StateTimeline({ state, is_p2p, colors }) {
  const rejected = state === 6;

  const baseP2P = [
    { s: 1,   label: 'Publicado'  },
    { s: 2,   label: 'Reservado'  },
    { s: 3,   label: 'Enviado'    },
    { s: 3.5, label: 'Peritaje', isPeritage: true },
  ];

  const steps = is_p2p
    ? rejected
      ? baseP2P  // solo hasta peritaje cuando es rechazo
      : [
          ...baseP2P,
          { s: 4, label: 'Verificado' },
          { s: 5, label: 'Completado' },
        ]
    : [
        { s: 1, label: 'Publicado'  },
        { s: 2, label: 'Reservado'  },
        { s: 3, label: 'Enviado'    },
        { s: 5, label: 'Completado' },
      ];

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt, borderRadius: 16,
      borderWidth: 1, borderColor: rejected ? '#ef444430' : colors.border, padding: 16,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 }}>
        Estado del proceso
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        {steps.map((step, i) => {
          const isLastAndRejected = rejected && i === steps.length - 1;
          const done       = !isLastAndRejected && (rejected ? step.s < 3.5 : state >= step.s);
          const inProgress = step.isPeritage && state === 3;
          const isFailed   = isLastAndRejected; // peritaje fue el último paso y falló
          const dotColor   = isFailed ? '#ef4444' : done ? colors.primary : inProgress ? '#38bdf8' : colors.border;

          return (
            <React.Fragment key={step.s}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: isFailed ? '#ef444420' : done ? colors.primary + '20' : inProgress ? '#38bdf820' : colors.surface,
                  borderWidth: (isFailed || inProgress) ? 2 : 1,
                  borderColor: dotColor,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  {isFailed
                    ? <Ionicons name="close" size={13} color="#ef4444" />
                    : done
                      ? <Ionicons name="checkmark" size={13} color={colors.primary} />
                      : inProgress
                        ? <Ionicons name="build-outline" size={11} color="#38bdf8" />
                        : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border }} />
                  }
                </View>
                <Text style={{
                  color: isFailed ? '#ef4444' : done ? colors.text : inProgress ? '#38bdf8' : colors.textMuted,
                  fontSize: 9,
                  fontWeight: (isFailed || done || inProgress) ? '700' : '400',
                  textAlign: 'center',
                  maxWidth: 56,
                }}>
                  {step.label}
                </Text>
              </View>
              {i < steps.length - 1 && (
                <View style={{
                  flex: 1, height: 1, marginBottom: 14,
                  backgroundColor: (rejected && i === steps.length - 2) ? '#ef444450' : state > step.s ? colors.primary : colors.border,
                }} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// Botón de acción
function ActionButton({ icon, label, description, color, loading, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        backgroundColor: color + '15',
        borderRadius: 16, borderWidth: 1, borderColor: color + '40',
        padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14,
      }}
    >
      <View style={{
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: color + '20',
        justifyContent: 'center', alignItems: 'center',
      }}>
        {loading
          ? <ActivityIndicator color={color} size="small" />
          : <Ionicons name={icon} size={22} color={color} />
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: color, fontWeight: '700', fontSize: 15 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color + '80'} />
    </TouchableOpacity>
  );
}
