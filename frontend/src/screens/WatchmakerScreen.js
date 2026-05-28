import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Modal, Image, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { useEthProvider } from '../wallet/useEthProvider';
import api, { getToken, WS_URL } from '../api/api';
import { waitForTx, openMetaMask, GAS_OVERRIDES } from '../utils/txUtils';
import { isMobileWithoutWallet } from '../wallet/useEthProvider';
import GlobalHeader from '../components/GlobalHeader';
import WatchCardForWatchmaker from '../components/WatchCardForWatchmaker';
import UserInfo from '../components/UserInfo';
import AlertModal, { useAlert } from '../components/AlertModal';
import { userStyles, colors, roleColors, globalStyles } from '../themes/styles';

const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';
const MARKETPLACE_ABI = [
  "function verifyAuthenticity(uint256 tokenId, bool isValid) external"
];


export default function WatchmakerScreen({ navigation }) {
  const { ethProvider, getConnectedSigner } = useEthProvider();
  const [loading, setLoading]           = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loggedUser, setLoggedUser]     = useState({ roles: [] });
  const [assignedWatches, setAssignedWatches] = useState([]);

  // Modal de peritaje
  const [periModal, setPeriModal]           = useState(false);
  const [selectedWatch, setSelectedWatch]   = useState(null);
  const [periComment, setPeriComment]       = useState('');

  // Confirmación antes de firmar
  const [confirmModal, setConfirmModal]     = useState(false);
  const [isVerifySuccess, setIsVerifySuccess] = useState(true);

  // Alertas de resultado
  const { alertProps, showAlert } = useAlert();

  // fetch 
  const fetchWatches = useCallback(async () => {
    try {
      const res = await api.get('/nfts/assigned-watchmaker');
      setAssignedWatches(res.data);
    } catch (e) {
      console.error('[WATCHMAKER] Error cargando peritajes:', e?.response?.status, e?.response?.data, e?.message);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const resUser = await api.get('/users/me');
      setLoggedUser(resUser.data);
      await fetchWatches();
    } catch (e) {
      console.error("Error al cargar datos:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchWatches]);

  // Carga inicial 
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Re-fetch cada vez que la pantalla entra en foco (volver de Notificaciones, etc.)
  useFocusEffect(
    useCallback(() => {
      fetchWatches();
    }, [fetchWatches])
  );

  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    let retryTimeout;
    let dead = false;

    const connect = () => {
      getToken().then(token => {
        ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
        ws.onmessage = (event) => {
          if (event.data === 'update_users' || event.data === 'update_marketplace') fetchWatches();
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
  }, [loggedUser?.id, fetchWatches]);

  // handlers
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

  const handleWalletChange = async (updatedUser) => {
    setLoggedUser(updatedUser);
    // Si se conecta wallet nueva, recargar lista; si se desconecta, solo actualizar
    // el usuario para que las tarjetas queden bloqueadas (el backend devolvería [] sin wallet)
    if (updatedUser.wallet_address) await fetchWatches();
  };

  const openPeriModal = (watch) => {
    setSelectedWatch(watch);
    setPeriComment('');
    setPeriModal(true);
  };

  const promptConfirm = (success) => {
    setIsVerifySuccess(success);
    setConfirmModal(true);
  };

  const CONTRACT_ERRORS = {
    'c9bc72d3': 'La wallet conectada no es el relojero asignado a este peritaje.',
    '82b42900': 'No estás autorizado para realizar esta acción.',
    '193413f6': 'El peritaje de esta venta ya está pendiente de resolución.',
    '9ce8b721': 'El pago de esta venta no está retenido en escrow.',
    'df010e4e': 'Esta operación solo aplica a ventas entre particulares (P2P).',
    'baf3f0f7': 'Estado de la venta incorrecto para esta operación.',
    '86dfc9e5': 'El reloj ya ha sido marcado como enviado.',
    'b9fca4ec': 'El reloj aún no ha sido enviado.',
  };

  const decodeContractError = (error) => {
    const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? '';
    if (typeof data === 'string' && data.startsWith('0x')) {
      const selector = data.slice(2, 10).toLowerCase();
      if (CONTRACT_ERRORS[selector]) return CONTRACT_ERRORS[selector];
    }
    if (error?.code === 'ACTION_REJECTED') return 'Has cancelado la transacción en tu wallet.';
    return null;
  };

  const executeVerification = async () => {
    const isReverification = !selectedWatch.buyer_wallet;
    // Re-cert aprobada y venta P2P (ambas ok/rechazo) requieren MetaMask
    const needsMetaMask = isReverification ? isVerifySuccess : true;

    if (needsMetaMask && isMobileWithoutWallet()) {
      return showAlert("Billetera no detectada", "Prueba desde el ordenador con MetaMask instalado, o instala la app en Android.", "error");
    }
    if (needsMetaMask && (!loggedUser?.wallet_address || typeof ethProvider === 'undefined')) {
      return showAlert("Error", "Wallet no detectada o no conectada.", "error");
    }
    setConfirmModal(false);
    setPeriModal(false);

    try {
      setIsProcessing(true);

      if (isReverification && isVerifySuccess) {
        // Re-certificación aprobada: restaurar estado en WatchNFT (requiere firma obligatoria)
        const WATCHNFT_ABI = ["function restoreAuthenticity(uint256 tokenId, string repairDescription) external"];
        const WATCHNFT_ADDRESS = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F';
        const signer   = await getConnectedSigner();
        const watchNFT = new ethers.Contract(WATCHNFT_ADDRESS, WATCHNFT_ABI, signer);
        const description = periComment.trim() || "Autenticidad restaurada tras re-certificación.";
        const tx = await watchNFT.restoreAuthenticity(selectedWatch.token_id, description);
        await waitForTx(tx);

      } else if (!isReverification) {
        // Venta P2P: la firma en MetaMask debe confirmar antes de actualizar el backend.
        // Si falla (wallet incorrecta, rechazo, error de contrato), se lanza el error y
        // el backend NO se actualiza.
        const signer      = await getConnectedSigner();
        const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
        const verifyTxP = marketplace.verifyAuthenticity(selectedWatch.token_id, isVerifySuccess, GAS_OVERRIDES);
        openMetaMask();
        const tx = await verifyTxP;
        await waitForTx(tx);
      }
      // Re-certificación rechazada: sin firma, solo backend

      const commentParam = periComment.trim() ? `&comment=${encodeURIComponent(periComment.trim())}` : '';
      await api.post(`/marketplace/verify/${selectedWatch.token_id}?success=${isVerifySuccess}${commentParam}`);

      const resultMsg = isReverification
        ? `El reloj ha sido ${isVerifySuccess ? 'certificado como auténtico ✓' : 'rechazado de nuevo ✗'}.`
        : `El reloj ha sido marcado como ${isVerifySuccess ? 'Original ✓' : 'Falsificación ✗'}.`;

      showAlert("Peritaje Registrado", resultMsg, "success");
      await fetchWatches();

    } catch (error) {
      console.error('[VERIFY] error:', error);
      const msg = decodeContractError(error)
        ?? (error?.code === 'ACTION_REJECTED'
          ? "Has cancelado la transacción en tu wallet."
          : error?.response?.data?.detail || "Error desconocido.");
      showAlert("Error en el peritaje", msg, "error");
    } finally {
      setIsProcessing(false);
      setSelectedWatch(null);
    }
  };

  // helpers 
  const truncWallet = (w) => w ? `${w.slice(0, 6)}…${w.slice(-4)}` : '—';

  // render 
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        title="Panel Relojero"
        navigation={navigation}
        loading={loading}
        onWalletChange={handleWalletChange}
        forceDark
      />

      <ScrollView style={[userStyles.container, { paddingHorizontal: 20 }]} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* CABECERA */}
        <View style={{ marginTop: 20, marginBottom: 20 }}>
          <Text style={userStyles.welcomeText}>Panel de Trabajo</Text>
          <Text style={[userStyles.userBadge, { color: roleColors.RELOJERO }]}>Relojero Autorizado</Text>
        </View>

        <UserInfo
          noMargin
          loggedUser={loggedUser}
          onSettings={() => navigation.navigate('Configuracion')}
        />

        {/* SECCIÓN PERITAJES */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 8 }}>
          <Ionicons name="shield-checkmark" size={18} color={roleColors.RELOJERO} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
            Peritajes Pendientes
          </Text>
          {assignedWatches.length > 0 && (
            <View style={{
              backgroundColor: roleColors.RELOJERO,
              borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
            }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                {assignedWatches.length}
              </Text>
            </View>
          )}
        </View>

        {/* Banner de wallet desconectada */}
        {!loggedUser?.wallet_address && assignedWatches.length > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
            borderRadius: 12, padding: 12, marginBottom: 16,
          }}>
            <Ionicons name="wallet-outline" size={18} color="#f59e0b" />
            <Text style={{ color: '#f59e0b', fontSize: 13, flex: 1, lineHeight: 18 }}>
              Conecta tu wallet en el perfil para poder interactuar con los peritajes asignados.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={roleColors.RELOJERO} style={{ marginTop: 40 }} />
        ) : assignedWatches.length > 0 ? (
          assignedWatches.map(w => (
            <WatchCardForWatchmaker
              key={w.token_id}
              watch={w}
              onPeritar={openPeriModal}
              walletConnected={!!loggedUser?.wallet_address}
            />
          ))
        ) : (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="shield-checkmark-outline" size={44} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 15 }}>
              No tienes relojes pendientes de peritaje
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL DE PERITAJE DETALLADO */}
      <Modal visible={periModal} transparent animationType="slide">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)', justifyContent: 'center', alignItems: 'center' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, maxHeight: '90%',
            borderWidth: 1, borderColor: colors.border,
            ...(Platform.OS === 'web' && {
              borderRadius: 24, width: '100%', maxWidth: 480,
            }),
          }}>
            {/* Handle / cerrar */}
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              {Platform.OS !== 'web' && (
                <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: 12 }} />
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Peritar Reloj</Text>
              <TouchableOpacity onPress={() => setPeriModal(false)}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedWatch && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Imagen + datos básicos */}
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                  <Image
                    source={{ uri: selectedWatch.image || 'https://via.placeholder.com/150' }}
                    style={{ width: 110, height: 110, borderRadius: 14, backgroundColor: colors.surface }}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>{selectedWatch.brand}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>{selectedWatch.model}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Año {selectedWatch.manufacturing_year}</Text>
                    <View style={{
                      marginTop: 8, backgroundColor: `${roleColors.RELOJERO}15`,
                      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                      borderWidth: 1, borderColor: `${roleColors.RELOJERO}30`,
                      alignSelf: 'flex-start',
                    }}>
                      <Text style={{ color: roleColors.RELOJERO, fontSize: 10, fontWeight: '900' }}>ESPERANDO PERITAJE</Text>
                    </View>
                  </View>
                </View>

                {/* Ficha técnica */}
                <View style={{
                  backgroundColor: colors.surface, borderRadius: 14,
                  padding: 16, marginBottom: 16,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 12 }}>FICHA DEL RELOJ</Text>
                  <Row label="Nº Serie" value={selectedWatch.serial_number} mono />
                  <Row label="Token ID" value={`#${selectedWatch.token_id}`} accent />
                  <Row label="Precio venta" value={selectedWatch.price ? `${(Number(selectedWatch.price) / 1_000_000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : '—'} accent />
                </View>

                {/* Partes involucradas */}
                <View style={{
                  backgroundColor: colors.surface, borderRadius: 14,
                  padding: 16, marginBottom: 24,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 12 }}>PARTES</Text>
                  <Row
                    label="Vendedor"
                    value={selectedWatch.seller_username || truncWallet(selectedWatch.seller_wallet)}
                  />
                  <Row
                    label="Comprador"
                    value={selectedWatch.buyer_username || truncWallet(selectedWatch.buyer_wallet)}
                    last
                  />
                </View>

                {/* Comentario del peritaje */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>
                    OBSERVACIONES (opcional)
                  </Text>
                  <TextInput
                    value={periComment}
                    onChangeText={setPeriComment}
                    placeholder="Ej: Movimiento original, bisel con desgaste leve…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1, borderColor: colors.border,
                      borderRadius: 12, padding: 12,
                      color: colors.text, fontSize: 13, lineHeight: 20,
                      minHeight: 72,
                      ...(Platform.OS === 'web' && { outlineStyle: 'none', resize: 'none' }),
                    }}
                  />
                </View>

                {/* Aviso sobre consecuencias */}
                <View style={{
                  backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12,
                  padding: 14, marginBottom: 24,
                  borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
                  flexDirection: 'row', gap: 10,
                }}>
                  <Ionicons name="information-circle" size={18} color="#fbbf24" style={{ marginTop: 1 }} />
                  <Text style={{ color: '#fbbf24', fontSize: 12, flex: 1, lineHeight: 18 }}>
                    Tu decisión quedará grabada permanentemente en la blockchain y determinará si la venta se completa o se cancela.
                  </Text>
                </View>

                {/* BOTONES DE ACCIÓN */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => promptConfirm(false)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 16,
                      backgroundColor: 'rgba(244,63,94,0.1)',
                      borderWidth: 1.5, borderColor: '#f43f5e',
                      alignItems: 'center', gap: 4,
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color="#f43f5e" />
                    <Text style={{ color: '#f43f5e', fontWeight: '800', fontSize: 13 }}>FALSIFICACIÓN</Text>
                    <Text style={{ color: '#f43f5e', fontSize: 10, opacity: 0.7 }}>Cancela la venta</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => promptConfirm(true)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 16,
                      backgroundColor: 'rgba(34,197,94,0.1)',
                      borderWidth: 1.5, borderColor: '#22c55e',
                      alignItems: 'center', gap: 4,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                    <Text style={{ color: '#22c55e', fontWeight: '800', fontSize: 13 }}>ORIGINAL</Text>
                    <Text style={{ color: '#22c55e', fontSize: 10, opacity: 0.7 }}>Aprueba la venta</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* CONFIRMACIÓN ANTES DE FIRMAR */}
      <AlertModal
        visible={confirmModal}
        type={isVerifySuccess ? 'info' : 'error'}
        title={isVerifySuccess ? 'Confirmar autenticidad' : 'Marcar como falsificación'}
        message={
          selectedWatch?.buyer_wallet
            ? isVerifySuccess
              ? `Estás a punto de certificar en la blockchain que el ${selectedWatch?.brand} ${selectedWatch?.model} es una pieza ORIGINAL.\n\nEl comprador podrá confirmar la entrega y en ese momento se liberará el pago al vendedor.\n\nRequiere firma en tu wallet.`
              : `Estás a punto de marcar el ${selectedWatch?.brand} ${selectedWatch?.model} como FALSIFICACIÓN.\n\nEsto cancelará la venta, devolverá el dinero al comprador y retendrá la fianza del vendedor.\n\nRequiere firma en tu wallet.`
            : isVerifySuccess
              ? `Vas a certificar el ${selectedWatch?.brand} ${selectedWatch?.model} como auténtico.\n\nEl reloj quedará rehabilitado y el propietario podrá venderlo o transferirlo.`
              : `Vas a rechazar la certificación del ${selectedWatch?.brand} ${selectedWatch?.model}.\n\nEl reloj continuará marcado como alterado.`
        }
        confirmLabel={selectedWatch?.buyer_wallet ? "Firmar" : isVerifySuccess ? "Confirmar" : "Confirmar"}
        onConfirm={executeVerification}
        cancelLabel="Cancelar"
        onCancel={() => setConfirmModal(false)}
      />

      {/* RESULTADO DEL PERITAJE */}
      <AlertModal {...alertProps} />

      {/* OVERLAY PROCESANDO / ESPERANDO METAMASK */}
      <Modal visible={isProcessing} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }) }}>
          <View style={{ backgroundColor: '#18181b', borderRadius: 20, padding: 32,
            alignItems: 'center', gap: 16, borderWidth: 1, borderColor: '#3f3f46',
            minWidth: 260, maxWidth: 320 }}>
            <ActivityIndicator size="large" color={roleColors.RELOJERO} />
            <Text style={{ color: '#f0f0f8', fontWeight: '700', fontSize: 16, textAlign: 'center' }}>
              {(!selectedWatch?.buyer_wallet && !isVerifySuccess) ? 'Procesando…' : 'Esperando firma…'}
            </Text>
            {(selectedWatch?.buyer_wallet || isVerifySuccess) && (
              <Text style={{ color: '#a09dc5', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                Confirma la transacción en tu wallet para continuar.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Fila de ficha técnica
function Row({ label, value, mono, accent, last }) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{
        color: accent ? colors.primaryLight : colors.text,
        fontSize: 12,
        fontFamily: mono ? (Platform.OS === 'ios' ? 'Courier' : 'monospace') : undefined,
        fontWeight: accent ? '700' : '400',
      }}>
        {value}
      </Text>
    </View>
  );
}
