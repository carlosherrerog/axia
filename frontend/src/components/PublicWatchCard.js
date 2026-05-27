// src/components/PublicWatchCard.js
import React, { useState } from 'react';
import { View, Text, Image, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { watchCardStyles, colors, alertColors, roleColors } from '../themes/styles';
import { resolveImageUri } from '../utils/ipfs';

export default function PublicWatchCard({ nft, navigation, cardWidth }) {
  const [isHovered, setIsHovered] = useState(false);

  const handleHoverIn  = () => setIsHovered(true);
  const handleHoverOut = () => setIsHovered(false);

  const handlePressCard = () => {
    const watchId = nft.token_id || nft.id;
    navigation.navigate('PublicWatch', { watchId: watchId, initialTab: 'details' });
  };

  // Detectar estados
  const isStolen  = nft.security_state === 1;
  const isLost    = nft.security_state === 2;
  const isAltered = nft.security_state === 4;
  const isEscrowed = nft.marketplace_state >= 2; // Cubre 2 (Reservado), 3 (Enviado) y 4 (Verificado)

  // Estilos dinámicos
  const lostColor    = '#6b7280';
  const escrowColor  = '#f59e0b';
  const alteredColor = '#f97316';

  const cardBg = isStolen  ? `${alertColors.error}0D`
               : isLost    ? `${lostColor}0D`
               : isAltered ? `${alteredColor}12`
               : isEscrowed ? `${escrowColor}15`
               : nft.is_listed ? '#1a1040'
               : colors.backgroundAlt;

  const cardBorder = isStolen  ? alertColors.error
                   : isLost    ? lostColor
                   : isAltered ? alteredColor
                   : isEscrowed ? escrowColor
                   : nft.is_listed ? colors.primary
                   : colors.border;

  const shadowColorDinamic = isStolen  ? alertColors.error
                           : isLost    ? lostColor
                           : isAltered ? alteredColor
                           : isEscrowed ? escrowColor
                           : colors.primary;

  // El backend ya devuelve el precio en formato USDC, no dividimos de nuevo
  const displayPrice = nft.price ? Number(nft.price) : 0;

  return (
    <Pressable
      onHoverIn={Platform.OS === 'web' ? handleHoverIn : null}
      onHoverOut={Platform.OS === 'web' ? handleHoverOut : null}
      onPress={handlePressCard}
      style={[
        watchCardStyles.card, 
        {
          backgroundColor: cardBg,
          borderWidth: 1.5,
          borderColor: cardBorder,
          shadowColor: shadowColorDinamic,
          shadowOpacity: isHovered ? 0.6 : 0.3,
          shadowRadius: isHovered ? 16 : 8,
          elevation: isHovered ? 10 : 4,
          opacity: (isEscrowed && !isAltered) ? 0.85 : 1,
          transform: [{ scale: isHovered ? 1.04 : 1 }],
          height: cardWidth ? Math.round(cardWidth * 1.3) : 250,
          display: 'flex',
          flexDirection: 'column',
          ...(Platform.OS === 'web' && { transition: 'all 0.2s ease-in-out', cursor: 'pointer' }),
        },
      ]}
    >
      {/* Fila vendedor */}
      {(() => {
        const isMfg     = nft.is_manufacturer;
        const isDlr     = nft.is_dealer;
        const roleKey   = isMfg ? 'FABRICANTE' : isDlr ? 'DEALER' : 'PARTICULAR';
        const tickColor = roleColors[roleKey];
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              width: 24, height: 24, borderRadius: 12,
              backgroundColor: tickColor + '22',
              alignItems: 'center', justifyContent: 'center',
              marginRight: 7,
            }}>
              <Ionicons
                name={isMfg ? 'construct' : isDlr ? 'storefront' : 'person'}
                size={12} color={tickColor}
              />
            </View>
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {nft.seller_name || 'Privado'}
            </Text>
            <Ionicons name="checkmark-circle" size={16} color={tickColor} style={{ marginLeft: 4 }} />
          </View>
        );
      })()}

      {/* Foto del reloj */}
      <View style={{ position: 'relative' }}>

        {/* ETIQUETA DINÁMICA — prioridad: robado > perdido > alterado > reservado > en venta */}
        {(isStolen || isLost) && (
          <View style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            backgroundColor: isStolen ? alertColors.error : lostColor,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center',
            shadowColor: isStolen ? alertColors.error : lostColor, shadowOpacity: 0.6, shadowRadius: 6,
          }}>
            <Ionicons name={isStolen ? "warning" : "help-circle"} size={11} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>{isStolen ? 'ROBADO' : 'PERDIDO'}</Text>
          </View>
        )}

        {isAltered && !isStolen && !isLost && (
          <View style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            backgroundColor: alteredColor,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center',
            shadowColor: alteredColor, shadowOpacity: 0.6, shadowRadius: 6,
          }}>
            <Ionicons name="alert-circle" size={11} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>ALTERADO</Text>
          </View>
        )}

        {isEscrowed && !isAltered && !isStolen && !isLost && (
          <View style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            backgroundColor: escrowColor,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center',
            shadowColor: escrowColor, shadowOpacity: 0.6, shadowRadius: 6,
          }}>
            <Ionicons name="lock-closed" size={11} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>RESERVADO</Text>
          </View>
        )}

        {nft.is_listed && !isStolen && !isLost && !isAltered && !isEscrowed && (
          <View style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            backgroundColor: colors.primary,
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center',
            shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 6,
          }}>
            <Ionicons name="pricetag" size={11} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>EN VENTA</Text>
          </View>
        )}

        <Image
          source={{ uri: resolveImageUri(nft.image) || 'https://via.placeholder.com/150' }}
          style={[watchCardStyles.image, (isEscrowed && !isAltered) && { opacity: 0.4 }, cardWidth && { height: Math.round(cardWidth * 0.68) }]}
          resizeMode="contain"
        />
      </View>

      {/* Marca, modelo e ID — debajo de la foto */}
      <View style={{ paddingHorizontal: 2, flex: 1, justifyContent: 'space-between', paddingBottom: 5 }}>
        <View>
          <Text style={[watchCardStyles.brandText, { color: colors.text }]} numberOfLines={1}>
            {nft.brand}
          </Text>
          <Text
            style={[watchCardStyles.modelText, { color: isAltered ? alteredColor : isEscrowed ? escrowColor : colors.textSecondary }]}
            numberOfLines={2}
          >
            {nft.model} {isAltered && '(Alterado)'}{!isAltered && isEscrowed && '(En peritaje)'}
          </Text>

          <View style={{
            alignSelf: 'flex-start',
            marginTop: 5,
            backgroundColor: '#10b98118',
            borderWidth: 1, borderColor: '#10b98150',
            borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
          }}>
            <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>
              #{nft.token_id || nft.id}
            </Text>
          </View>
        </View>

        {nft.is_listed ? (
          <Text style={{ fontSize: 15, fontWeight: 'bold', color: isEscrowed ? colors.textSecondary : alertColors.success, marginTop: 6, letterSpacing: 0.3 }}>
            {displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
          </Text>
        ) : (
          <View style={{ height: 18, marginTop: 6 }} />
        )}
      </View>
    </Pressable>
  );
}