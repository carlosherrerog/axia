import React, { useState } from 'react';
import { View, Text, Image, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, alertColors, roleColors } from '../themes/styles';
import { resolveImageUri } from '../utils/ipfs';

export default function PublicWatchCard({ nft, navigation, cardWidth }) {
  const [isHovered, setIsHovered] = useState(false);

  const handlePressCard = () => {
    const watchId = nft.token_id || nft.id;
    navigation.navigate('PublicWatch', { watchId: watchId, initialTab: 'details' });
  };

  const isStolen   = nft.security_state === 1;
  const isLost     = nft.security_state === 2;
  const isAltered  = nft.security_state === 4;
  const isEscrowed = nft.marketplace_state >= 2;

  const lostColor    = '#6b7280';
  const escrowColor  = '#f59e0b';
  const alteredColor = '#f97316';

  const cardBorder = isStolen  ? alertColors.error
                   : isLost    ? lostColor
                   : isAltered ? alteredColor
                   : isEscrowed ? escrowColor
                   : nft.is_listed ? colors.primary
                   : colors.border;

  const displayPrice = nft.price ? Number(nft.price) : 0;

  const isMfg   = nft.is_manufacturer;
  const isDlr   = nft.is_dealer;
  const roleKey = isMfg ? 'FABRICANTE' : isDlr ? 'DEALER' : 'PARTICULAR';
  const roleIcon = isMfg ? 'construct' : isDlr ? 'storefront' : 'person';
  const roleColor = roleColors[roleKey];

  // Badge de estado sobre la imagen
  const statusLabel = isStolen ? { text: 'ROBADO',    color: alertColors.error, icon: 'warning' }
                    : isLost   ? { text: 'PERDIDO',   color: lostColor,         icon: 'help-circle' }
                    : isAltered ? { text: 'ALTERADO', color: alteredColor,      icon: 'alert-circle' }
                    : isEscrowed ? { text: 'RESERVADO', color: escrowColor,     icon: 'lock-closed' }
                    : nft.is_listed ? { text: 'EN VENTA', color: colors.primary, icon: 'pricetag' }
                    : null;

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
        ...(Platform.OS === 'web' && {
          transition: 'all 0.18s ease',
          cursor: 'pointer',
          boxShadow: isHovered ? `0 4px 20px ${colors.primary}55` : '0 1px 6px rgba(0,0,0,0.25)',
        }),
      }}
    >
      {/* Imagen cuadrada */}
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.surface, position: 'relative' }}>
        <Image
          source={{ uri: resolveImageUri(nft.image) || 'https://via.placeholder.com/150' }}
          style={{ width: '100%', height: '100%', opacity: (isEscrowed && !isAltered) ? 0.5 : 1 }}
          resizeMode="contain"
        />

        {/* Badge estado */}
        {statusLabel && (
          <View style={{
            position: 'absolute', top: 8, left: 8,
            backgroundColor: statusLabel.color,
            paddingHorizontal: 7, paddingVertical: 3,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 3,
          }}>
            <Ionicons name={statusLabel.icon} size={10} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 }}>
              {statusLabel.text}
            </Text>
          </View>
        )}

        {/* Rol del vendedor — esquina inferior derecha */}
        <View style={{
          position: 'absolute', bottom: 7, right: 7,
          backgroundColor: roleColor + '33',
          borderRadius: 20, padding: 4,
          borderWidth: 1, borderColor: roleColor + '66',
        }}>
          <Ionicons name={roleIcon} size={12} color={roleColor} />
        </View>
      </View>

      {/* Info */}
      <View style={{ padding: 9 }}>
        {nft.is_listed && (
          <Text style={{ color: isEscrowed ? escrowColor : '#10b981', fontSize: 14, fontWeight: '800', marginBottom: 2 }}>
            {displayPrice.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDC
          </Text>
        )}
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {nft.brand} {nft.model}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {nft.seller_name || 'Vendedor'}
        </Text>
      </View>
    </Pressable>
  );
}
