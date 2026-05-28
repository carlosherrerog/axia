// src/components/WatchCard.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Pressable, Platform, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { watchCardStyles, colors, alertColors } from '../themes/styles';
import { useEthProvider } from '../wallet/useEthProvider';
import api from '../api/api.js';
import { resolveImageUri } from '../utils/ipfs';
import { ethers } from 'ethers';
import Marketplace_ABI from '../contracts/WatchMarketplace.json';

const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';

export default function WatchCard({ nft, removeNFT, navigation, isAdminView = false, onRefresh, isManufacturer = false, walletConnected = true }) {
  const { ethProvider, getConnectedSigner } = useEthProvider();
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isShipping, setIsShipping] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [metaMaskLoading, setMetaMaskLoading] = useState(false);
  const [shipConfirmVisible, setShipConfirmVisible] = useState(false);
  const [shipResultVisible, setShipResultVisible] = useState(false);
  const [shipResultMsg, setShipResultMsg] = useState({ title: '', message: '', isError: false });
  const [deliveryConfirmVisible, setDeliveryConfirmVisible] = useState(false);

  const handlePressCard = () => {
    if (!walletConnected) return;
    if (isEscrowed && !nft.is_reverification) {
      navigation.navigate('SaleScreen', {
        listingId: nft.listing_id || undefined,
        tokenId: nft.id,
      });
      return;
    }
    navigation.navigate('WatchScreen', { watchId: nft.id, initialTab: 'details' });
  };

  const toggleMenu = () => setShowMenu(!showMenu);

  // Estados
  const isStolen  = nft.security_state === 1;
  const isLost    = nft.security_state === 2;
  const isAltered = nft.security_state === 4;
  const isEscrowed = nft.marketplace_state >= 2 && nft.marketplace_state < 5;

  const isWaitingShipment = nft.marketplace_state === 2;
  const isBuyerView = nft.is_buyer === true;
  const canConfirmDelivery = isBuyerView && (
    nft.marketplace_state === 4 ||
    (nft.marketplace_state === 3 && nft.is_p2p === false)
  );

  const lostColor    = '#6b7280';
  const escrowColor  = '#f59e0b';
  const alteredColor = '#f97316';

  const cardBorder = isStolen   ? alertColors.error
                   : isLost     ? lostColor
                   : isAltered  ? alteredColor
                   : isEscrowed ? escrowColor
                   : nft.is_listed ? colors.primary
                   : colors.border;

  const canShowMenu = !isAdminView && (
    (isWaitingShipment && !isBuyerView) ||
    (!nft.is_listed && !isEscrowed) ||
    canConfirmDelivery
  );

  // Badge de estado (único, igual que PublicWatchCard)
  const statusLabel = isStolen   ? { text: 'ROBADO',    color: alertColors.error, icon: 'warning' }
                    : isLost     ? { text: 'PERDIDO',   color: lostColor,         icon: 'help-circle' }
                    : isAltered  ? { text: 'ALTERADO',  color: alteredColor,      icon: 'alert-circle' }
                    : isEscrowed ? { text: 'RESERVADO', color: escrowColor,       icon: 'lock-closed' }
                    : nft.is_listed ? { text: 'EN VENTA', color: colors.primary,  icon: 'pricetag' }
                    : null;

  // Etiqueta de estado escrow detallado (banner inferior imagen)
  const escrowIcon = nft.is_reverification ? 'refresh-circle-outline'
    : canConfirmDelivery ? 'cube-outline'
    : !isBuyerView && !nft.is_p2p ? 'cube-outline'
    : nft.marketplace_state === 3 && nft.is_p2p ? 'search-outline'
    : 'time-outline';

  const escrowLabel = nft.is_reverification ? 'Pendiente de restauración'
    : canConfirmDelivery ? 'Confirmar recibo'
    : !isBuyerView && !nft.is_p2p && nft.marketplace_state >= 3 ? 'Esperando confirmación del cliente'
    : nft.marketplace_state === 2 ? 'Esperando envío'
    : nft.marketplace_state === 3 && nft.is_p2p ? 'En peritaje'
    : 'Esperando confirmación';

  const displayPrice = nft.price ? Number(nft.price) / 1_000_000 : 0;
  const tokenId = nft.id || nft.token_id;

  // Acciones
  const doConfirmShipment = async () => {
    setShipConfirmVisible(false);
    try {
      setIsShipping(true);
      const res = await api.post(`/marketplace/ship/${nft.token_id || nft.id}`);
      if (res.data?.blockchain_warning) {
        setShipResultMsg({ title: 'Envío registrado', message: 'Envío confirmado en la base de datos. La transacción blockchain no pudo ejecutarse, pero el flujo continúa.', isError: false });
      } else {
        setShipResultMsg({ title: '¡Envío confirmado!', message: 'Se ha notificado al comprador. Un relojero certificará el reloj.', isError: false });
      }
      setShipResultVisible(true);
      if (onRefresh) onRefresh();
    } catch (error) {
      setShipResultMsg({ title: 'Error', message: error.response?.data?.detail || 'No se pudo registrar el envío.', isError: true });
      setShipResultVisible(true);
    } finally {
      setIsShipping(false);
    }
  };

  const handleConfirmDelivery = () => {
    setShowMenu(false);
    setDeliveryConfirmVisible(true);
  };

  const doConfirmDelivery = async () => {
    if (Platform.OS !== 'web' || !ethProvider) {
      setDeliveryConfirmVisible(false);
      setShipResultMsg({ title: 'Error', message: 'Necesitas una wallet conectada para confirmar la entrega.', isError: true });
      setShipResultVisible(true);
      return;
    }
    try {
      setDeliveryConfirmVisible(false);
      setIsConfirming(true);
      setMetaMaskLoading(true);
      const signer      = await getConnectedSigner();
      const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);

      let blockchainWarning = null;
      try {
        const tx = await marketplace.confirmDelivery(nft.id || nft.token_id);
        await tx.wait();
      } catch (blockchainErr) {
        if (blockchainErr?.code === 'ACTION_REJECTED') throw blockchainErr;
        blockchainWarning = true;
      }

      setMetaMaskLoading(false);
      await api.post(`/marketplace/confirm-delivery/${nft.id || nft.token_id}`);
      setShipResultMsg({
        title: '¡Entrega confirmada!',
        message: blockchainWarning
          ? 'Entrega registrada. La transacción blockchain no pudo ejecutarse.'
          : 'El reloj ya es tuyo y el pago se ha liberado al vendedor.',
        isError: false,
      });
      setShipResultVisible(true);
      if (onRefresh) onRefresh();
    } catch (error) {
      setMetaMaskLoading(false);
      if (error?.code === 'ACTION_REJECTED') {
        setShipResultMsg({ title: 'Cancelado', message: 'Operación cancelada en tu wallet.', isError: true });
      } else {
        setShipResultMsg({ title: 'Error', message: error.response?.data?.detail || error.message || 'No se pudo confirmar la entrega.', isError: true });
      }
      setShipResultVisible(true);
    } finally {
      setIsConfirming(false);
      setMetaMaskLoading(false);
    }
  };

  return (
    <Pressable
      onHoverIn={Platform.OS === 'web' ? () => setIsHovered(true) : null}
      onHoverOut={Platform.OS === 'web' ? () => setIsHovered(false) : null}
      onPress={handlePressCard}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: isHovered ? colors.primary : cardBorder,
        backgroundColor: colors.backgroundAlt,
        opacity: (isEscrowed && !isAltered) ? 0.85 : 1,
        zIndex: showMenu ? 10 : 1,
        ...(Platform.OS === 'web' && {
          transition: 'all 0.18s ease',
          cursor: walletConnected ? 'pointer' : 'default',
          boxShadow: isHovered ? `0 4px 20px ${colors.primary}55` : '0 1px 6px rgba(0,0,0,0.25)',
        }),
      }}
    >
      {/* Imagen cuadrada */}
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.surface, position: 'relative' }}>
        <Image
          source={{ uri: resolveImageUri(nft.image) || 'https://via.placeholder.com/150' }}
          style={{
            width: '100%', height: '100%',
            opacity: (isEscrowed || !walletConnected) ? 0.4 : isAltered ? 0.55 : 1,
          }}
          resizeMode="contain"
        />

        {/* Overlay tinte naranja para alterado */}
        {isAltered && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: `${alteredColor}18`,
            pointerEvents: 'none',
          }} />
        )}

        {/* Badge de estado (esquina superior izquierda) */}
        {statusLabel && (
          <View style={{
            position: 'absolute', top: 7, left: 7,
            backgroundColor: statusLabel.color,
            paddingHorizontal: 6, paddingVertical: 2,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 3,
          }}>
            <Ionicons name={statusLabel.icon} size={9} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.3, fontFamily: Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined }}>
              {statusLabel.text}
            </Text>
          </View>
        )}

        {/* Botón de 3 puntos (esquina superior derecha) */}
        {canShowMenu && walletConnected && (
          <TouchableOpacity
            style={[watchCardStyles.menuButton, {
              backgroundColor: isWaitingShipment ? escrowColor : 'rgba(24,24,27,0.92)',
            }]}
            onPress={toggleMenu}
            disabled={isShipping}
          >
            {isShipping ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="ellipsis-vertical" size={16} color={isWaitingShipment ? '#FFF' : '#a78bfa'} />
            )}
          </TouchableOpacity>
        )}

        {/* Menú desplegable */}
        {showMenu && canShowMenu && (
          <>
            <Pressable
              style={{
                position: Platform.OS === 'web' ? 'fixed' : 'absolute',
                top: Platform.OS === 'web' ? 0 : -2000,
                bottom: Platform.OS === 'web' ? 0 : -2000,
                left: Platform.OS === 'web' ? 0 : -2000,
                right: Platform.OS === 'web' ? 0 : -2000,
                zIndex: 25,
              }}
              onPress={() => setShowMenu(false)}
            />
            <View style={[watchCardStyles.dropdownMenu, { zIndex: 30 }]}>
              {canConfirmDelivery ? (
                <Pressable
                  style={({ hovered }) => [watchCardStyles.menuItem, { borderBottomWidth: 0 }, hovered && { backgroundColor: 'rgba(16,185,129,0.12)' }]}
                  onPress={handleConfirmDelivery}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#10b981" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#10b981', fontWeight: '500' }}>Confirmar recibo de reloj</Text>
                </Pressable>
              ) : isWaitingShipment ? (
                <Pressable
                  style={({ hovered }) => [watchCardStyles.menuItem, { borderBottomWidth: 0 }, hovered && { backgroundColor: 'rgba(245,158,11,0.12)' }]}
                  onPress={() => { setShowMenu(false); setShipConfirmVisible(true); }}
                >
                  <Ionicons name="airplane-outline" size={16} color="#f59e0b" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#f59e0b', fontWeight: '500' }}>Confirmar Envío</Text>
                </Pressable>
              ) : isAltered ? (
                <Pressable
                  style={({ hovered }) => [watchCardStyles.menuItem, { borderBottomWidth: 0 }, hovered && { backgroundColor: 'rgba(249,115,22,0.12)' }]}
                  onPress={() => { setShowMenu(false); navigation.navigate('WatchScreen', { watchId: nft.id, initialTab: 'security' }); }}
                >
                  <Ionicons name="refresh-circle-outline" size={16} color={alteredColor} style={{ marginRight: 8 }} />
                  <Text style={{ color: alteredColor, fontWeight: '500' }}>Solicitar certificación</Text>
                </Pressable>
              ) : (
                <>
                  {!isStolen && !isLost && (
                    <Pressable
                      style={({ hovered }) => [watchCardStyles.menuItem, hovered && { backgroundColor: 'rgba(16,185,129,0.12)' }]}
                      onPress={() => { setShowMenu(false); navigation.navigate('WatchScreen', { watchId: nft.id, initialTab: 'sell' }); }}
                    >
                      <Ionicons name="pricetag-outline" size={16} color="#10b981" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#10b981', fontWeight: '500' }}>Vender</Text>
                    </Pressable>
                  )}
                  {!isStolen && !isLost && (
                    <Pressable
                      style={({ hovered }) => [watchCardStyles.menuItem, hovered && { backgroundColor: 'rgba(168,85,247,0.12)' }]}
                      onPress={() => { setShowMenu(false); navigation.navigate('WatchScreen', { watchId: nft.id, initialTab: 'transfer' }); }}
                    >
                      <Ionicons name="paper-plane-outline" size={16} color={colors.primaryLight} style={{ marginRight: 8 }} />
                      <Text style={{ color: colors.primaryLight, fontWeight: '500' }}>Transferir</Text>
                    </Pressable>
                  )}
                  {(isStolen || isLost) && (
                    <Pressable
                      style={({ hovered }) => [watchCardStyles.menuItem, hovered && { backgroundColor: 'rgba(16,185,129,0.12)' }]}
                      onPress={() => { setShowMenu(false); navigation.navigate('WatchScreen', { watchId: nft.id, initialTab: 'security' }); }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color="#10b981" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#10b981', fontWeight: '500' }}>Declarar seguro</Text>
                    </Pressable>
                  )}
                  {!isManufacturer && (
                    <Pressable
                      style={({ hovered }) => [watchCardStyles.menuItem, { borderBottomWidth: 0 }, hovered && { backgroundColor: 'rgba(244,63,94,0.12)' }]}
                      onPress={() => { setShowMenu(false); removeNFT(nft.id); }}
                    >
                      <Ionicons name="eye-off-outline" size={16} color="#f43f5e" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#f43f5e', fontWeight: '500' }}>Ocultar</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </>
        )}

        {/* Overlay wallet no conectada */}
        {!walletConnected && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(13,13,26,0.72)',
            justifyContent: 'center', alignItems: 'center',
            paddingHorizontal: 12,
          }}>
            <Ionicons name="wallet-outline" size={24} color="#a78bfa" />
            <Text style={{ color: '#e2d9f3', fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 5, lineHeight: 14 }}>
              Conecta tu wallet para interactuar
            </Text>
          </View>
        )}

        {/* Banner escrow detallado (parte inferior de la imagen) */}
        {isEscrowed && walletConnected && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
            backgroundColor: 'rgba(69,31,0,0.88)',
            borderTopWidth: 1, borderTopColor: '#f59e0b55',
            paddingVertical: 6, paddingHorizontal: 10,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            ...(Platform.OS === 'web' && { backdropFilter: 'blur(10px)' }),
          }}>
            <Ionicons name={escrowIcon} size={11} color="#f59e0b" />
            <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 }}>
              {escrowLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ padding: 8 }}>
        {nft.is_listed && displayPrice > 0 && (
          <Text style={{ color: isEscrowed ? escrowColor : '#10b981', fontSize: 13, fontWeight: '800', marginBottom: 2 }}>
            {displayPrice.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC
          </Text>
        )}
        <Text style={{
          color: isStolen ? alertColors.error : isLost ? lostColor : isAltered ? alteredColor : isEscrowed ? escrowColor : colors.text,
          fontSize: 11, fontWeight: '600', lineHeight: 15,
        }} numberOfLines={2}>
          {nft.model}
        </Text>
        <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
          #{tokenId}
        </Text>
      </View>

      {/* Modal confirmar envío */}
      <Modal visible={shipConfirmVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#18181b', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#2a2542', gap: 10 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#f59e0b20', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="airplane-outline" size={26} color="#f59e0b" />
            </View>
            <Text style={{ color: '#f8f8ff', fontWeight: '800', fontSize: 17, textAlign: 'center' }}>Confirmar envío</Text>
            <Text style={{ color: '#a09dc5', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
              ¿Has entregado el reloj a la empresa de mensajería? Esta acción notificará al relojero y al comprador.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShipConfirmVisible(false)} style={{ flex: 1, backgroundColor: '#2a2542', borderRadius: 20, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#a09dc5', fontWeight: '600', fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doConfirmShipment} style={{ flex: 1, backgroundColor: '#f59e0b', borderRadius: 20, paddingVertical: 12, alignItems: 'center' }}>
                {isShipping ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Sí, lo he enviado</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal resultado envío */}
      <Modal visible={shipResultVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#18181b', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#2a2542', gap: 10 }}>
            <Ionicons name={shipResultMsg.isError ? 'close-circle' : 'checkmark-circle'} size={52} color={shipResultMsg.isError ? '#ef4444' : '#10b981'} />
            <Text style={{ color: '#f8f8ff', fontWeight: '800', fontSize: 17, textAlign: 'center' }}>{shipResultMsg.title}</Text>
            <Text style={{ color: '#a09dc5', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>{shipResultMsg.message}</Text>
            <TouchableOpacity onPress={() => setShipResultVisible(false)} style={{ marginTop: 4, backgroundColor: '#8b5cf6', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 32, width: '100%', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal confirmar entrega */}
      <Modal visible={deliveryConfirmVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#18181b', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#2a2542', gap: 10 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#10b98120', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="checkmark-done-outline" size={26} color="#10b981" />
            </View>
            <Text style={{ color: '#f8f8ff', fontWeight: '800', fontSize: 17, textAlign: 'center' }}>Confirmar recepción</Text>
            <Text style={{ color: '#a09dc5', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
              ¿Has recibido el reloj y estás conforme? Esta acción liberará el pago al vendedor y transferirá la propiedad del NFT a tu wallet.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setDeliveryConfirmVisible(false)} style={{ flex: 1, backgroundColor: '#2a2542', borderRadius: 20, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#a09dc5', fontWeight: '600', fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doConfirmDelivery} style={{ flex: 1, backgroundColor: '#10b981', borderRadius: 20, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Sí, lo he recibido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Overlay firmando con MetaMask */}
      <Modal visible={metaMaskLoading} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }) }}>
          <View style={{ backgroundColor: '#18181b', borderRadius: 20, padding: 32, alignItems: 'center', gap: 16, borderWidth: 1, borderColor: '#2a2542', minWidth: 260, maxWidth: 320 }}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ color: '#f0f0f8', fontWeight: '700', fontSize: 16, textAlign: 'center' }}>Esperando firma…</Text>
            <Text style={{ color: '#a09dc5', textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
              Confirma la transacción en tu wallet para continuar.
            </Text>
          </View>
        </View>
      </Modal>
    </Pressable>
  );
}
