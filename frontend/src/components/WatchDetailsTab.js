import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors as defaultColors, watchScreenStyles, roleColors } from '../themes/styles';

const POLYGONSCAN_BASE = 'https://amoy.polygonscan.com';

export default function WatchDetailsTab({
  watchData,
  ownerData,
  sellerRoles = [],
  currentStateId = 0,
  currentStateInfo,
  isAltered = false,
  isEscrowed = false,
  isListed = false,
  nftAddress,
  tokenId,
  navigation,
  isManufacturer = false,
  colors = defaultColors,
  buySection = null,
}) {
  const roleKey = sellerRoles.includes('FABRICANTE') ? 'FABRICANTE'
    : sellerRoles.includes('DEALER') ? 'DEALER'
    : sellerRoles.includes('RELOJERO') ? 'RELOJERO'
    : null;
  const roleColor = roleKey ? roleColors[roleKey] : colors.primary;

  return (
    <View style={watchScreenStyles.contentCard}>

      {buySection}

      {(!isEscrowed || isAltered) && (
        <>
          <View style={[watchScreenStyles.detailRow, { marginBottom: 6 }]}>
            <Text style={watchScreenStyles.detailLabel}>Propietario:</Text>
            <View style={{ flex: 1, gap: 3 }}>
              <TouchableOpacity
                onPress={() => !isManufacturer && ownerData?.id && navigation.navigate('PublicProfile', { userId: ownerData.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{ownerData?.username || 'Usuario'}</Text>
                {roleKey && <Ionicons name="checkmark-circle" size={16} color={roleColor} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Clipboard.setStringAsync(ownerData?.wallet_address)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                  {ownerData?.wallet_address ? `${ownerData.wallet_address.slice(0, 10)}…${ownerData.wallet_address.slice(-8)}` : '—'}
                </Text>
                <Ionicons name="copy-outline" size={11} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5, marginBottom: 15 }} />
        </>
      )}

      <Text style={watchScreenStyles.sectionTitle}>
        {watchData?.brand ? `${watchData.brand} ${watchData.model}` : watchData?.model || 'Modelo'}
      </Text>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>Marca:</Text>
        <Text style={watchScreenStyles.detailValue}>{watchData?.brand || 'N/A'}</Text>
      </View>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>Modelo:</Text>
        <Text style={watchScreenStyles.detailValue}>{watchData?.model || 'N/A'}</Text>
      </View>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>Número de Serie:</Text>
        <Text style={watchScreenStyles.detailValue}>{watchData?.serialNumber || 'N/A'}</Text>
      </View>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>Año de Fabricación:</Text>
        <Text style={watchScreenStyles.detailValue}>{watchData?.manufacturingYear || 'N/A'}</Text>
      </View>
      {watchData?.mint_date && (
        <View style={watchScreenStyles.detailRow}>
          <Text style={watchScreenStyles.detailLabel}>Fecha de Minteo:</Text>
          <Text style={[watchScreenStyles.detailValue, { color: colors.primaryLight, fontWeight: '600' }]}>
            {new Date(watchData.mint_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

      <View style={[watchScreenStyles.detailRow, { marginBottom: 8 }]}>
        <Text style={watchScreenStyles.detailLabel}>Estado Blockchain</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={currentStateInfo?.icon} size={13} color={currentStateInfo?.color} />
          <Text style={{ color: currentStateInfo?.color, fontSize: 13, fontWeight: '600' }}>
            {currentStateId === 0 ? 'En propiedad' : currentStateInfo?.label}
          </Text>
        </View>
      </View>
      <View style={[watchScreenStyles.detailRow, { marginBottom: 10 }]}>
        <Text style={watchScreenStyles.detailLabel}>Estado Marketplace</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: isAltered ? colors.textMuted : isEscrowed ? '#f59e0b' : isListed ? colors.primaryLight : watchData?.is_public ? '#10b981' : colors.textSecondary }}>
          {isAltered ? '—' : isEscrowed ? 'Reservado' : isListed ? 'En Venta' : watchData?.is_public ? 'Público' : 'Privado'}
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

      <View style={[watchScreenStyles.detailRow, { alignItems: 'flex-start' }]}>
        <Text style={watchScreenStyles.detailLabel}>Dirección del contrato:</Text>
        <TouchableOpacity onPress={() => Clipboard.setStringAsync(nftAddress)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.primaryLight, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
            {nftAddress ? `${nftAddress.slice(0, 10)}…${nftAddress.slice(-8)}` : '0x...'}
          </Text>
          <Ionicons name="copy-outline" size={14} color={colors.primaryLight} />
        </TouchableOpacity>
      </View>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>ID del Token:</Text>
        <Text style={watchScreenStyles.detailValue}>{tokenId}</Text>
      </View>
      <View style={watchScreenStyles.detailRow}>
        <Text style={watchScreenStyles.detailLabel}>Estándar de token:</Text>
        <Text style={watchScreenStyles.detailValue}>ERC721</Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

      <TouchableOpacity
        onPress={() => {
          const url = `${POLYGONSCAN_BASE}/token/${nftAddress}?a=${tokenId}`;
          if (Platform.OS === 'web') window.open(url, '_blank');
        }}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: colors.surface, borderRadius: 12, padding: 14,
          borderWidth: 1, borderColor: colors.border,
        }}
      >
        <Ionicons name="open-outline" size={16} color={colors.primaryLight} />
        <Text style={{ color: colors.primaryLight, fontWeight: '600', fontSize: 13 }}>
          Ver en Polygonscan (Amoy)
        </Text>
      </TouchableOpacity>
    </View>
  );
}
