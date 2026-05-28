import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors as defaultColors, watchScreenStyles, roleColors } from '../themes/styles';

const POLYGONSCAN_BASE = 'https://amoy.polygonscan.com';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export default function WatchHistoryTab({
  watchData,
  appUsers = [],
  navigation,
  nftAddress,
  auctionAddress,
  marketplaceAddress,
  tokenId,
  isAltered = false,
  isManufacturer = false,
  colors = defaultColors,
}) {
  const findUserByWallet = (wallet) =>
    wallet ? appUsers.find(u => u.wallet_address?.toLowerCase() === wallet.toLowerCase()) : null;

  const parseUTCDate = s => s ? new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z') : null;
  const fmtDateTime  = s => {
    const d = parseUTCDate(s);
    return d ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  };

  // Timestamps de verificaciones P2P para poder correlacionar con transfers
  const p2pVerifTimestamps = (watchData?.verifications || [])
    .filter(v => typeof v.comment === 'string' && v.comment.startsWith('Peritaje superado en venta P2P'))
    .map(v => v.date || 0);

  const transfers = (watchData?.history || []).map(e => {
    const isMint = !e.previous_owner_wallet || e.previous_owner_wallet.toLowerCase() === ZERO_ADDR;
    const d = parseUTCDate(e.transferred_at);
    const ts = d ? d.getTime() / 1000 : 0;
    const isAuction = !isMint && e.via_contract_wallet && auctionAddress &&
      e.via_contract_wallet.toLowerCase() === auctionAddress.toLowerCase();
    const isAuctionReturn = isAuction &&
      e.previous_owner_wallet && e.new_owner_wallet &&
      e.previous_owner_wallet.toLowerCase() === e.new_owner_wallet.toLowerCase();
    const isMarketplaceSale = !isMint && !isAuction && e.via_contract_wallet && marketplaceAddress &&
      e.via_contract_wallet.toLowerCase() === marketplaceAddress.toLowerCase() && e.price_usdc != null;
    // Es P2P si hay una verificación P2P en los 30 días anteriores a la transferencia
    const isP2PSale = isMarketplaceSale &&
      p2pVerifTimestamps.some(vt => vt <= ts && ts - vt <= 30 * 24 * 3600);
    const isDealerSale = isMarketplaceSale && !isP2PSale;

    const icon  = isMint ? 'flash-outline'
                : isAuctionReturn ? 'close-circle-outline'
                : isAuction ? 'hammer-outline'
                : isP2PSale ? 'shield-checkmark-outline'
                : isDealerSale ? 'storefront-outline'
                : 'swap-horizontal';
    const color = isMint ? '#a855f7'
                : isAuctionReturn ? '#6b7280'
                : isAuction ? '#f59e0b'
                : isP2PSale ? '#10b981'
                : isDealerSale ? '#38bdf8'
                : colors.primary;
    const title = isMint ? 'Minteo inicial'
                : isAuctionReturn ? 'Subasta desierta'
                : isAuction ? 'Vendido en subasta'
                : isP2PSale ? 'Venta P2P'
                : isDealerSale ? 'Venta Dealer / Fabricante'
                : 'Transferencia de propiedad';
    return {
      _type: 'transfer',
      _ts: ts,
      icon, color, title,
      lines: [e.price_usdc != null ? `${Number(e.price_usdc).toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC` : null].filter(Boolean),
      isMint, isAuction, isAuctionReturn,
      fromWallet: isMint
        ? (watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker || null)
        : isAuctionReturn ? null : (e.previous_owner_wallet || null),
      viaWallet:  isAuctionReturn ? null : (e.via_contract_wallet || null),
      toWallet:   e.new_owner_wallet || null,
      fromUser: isMint
        ? findUserByWallet(watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker)
        : findUserByWallet(e.previous_owner_wallet),
      toUser: findUserByWallet(e.new_owner_wallet),
      date: fmtDateTime(e.transferred_at),
    };
  });

  const revisions = (watchData?.revisions || []).map(r => ({
    _type: 'revision', _ts: r.date || 0,
    icon: 'construct-outline', color: '#f59e0b',
    title: 'Revisión técnica',
    lines: [r.description],
    watchmakerWallet: r.watchmaker,
    watchmakerUser: findUserByWallet(r.watchmaker),
    date: r.date ? new Date(r.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
  }));

  const mfgWallet = watchData?.manufacturer_wallet?.toLowerCase();
  const rawVerifs = watchData?.verifications || [];
  const latestVerifDate = rawVerifs.length > 0 ? Math.max(...rawVerifs.map(v => v.date || 0)) : -1;

  const verifications = rawVerifs.map(v => {
    const isManufacturerCert   = mfgWallet && v.watchmaker?.toLowerCase() === mfgWallet;
    const isRejectionByComment = typeof v.comment === 'string' && v.comment.startsWith('Peritaje rechazado');
    const isRejection = !isManufacturerCert && (isRejectionByComment || (isAltered && v.date === latestVerifDate));
    const isP2PSale   = !isRejection && !isManufacturerCert &&
      typeof v.comment === 'string' && v.comment.startsWith('Peritaje superado en venta P2P');
    return {
      _type: 'verification', _ts: v.date || 0,
      icon: isRejection ? 'close-circle-outline'
          : isManufacturerCert ? 'ribbon-outline'
          : isP2PSale ? 'shield-half-outline'
          : 'shield-checkmark-outline',
      color: isRejection ? '#ef4444' : isManufacturerCert ? '#a855f7' : isP2PSale ? '#38bdf8' : '#10b981',
      title: isRejection ? 'Peritaje fallido — Alteración detectada'
           : isManufacturerCert ? 'Certificado de fabricación'
           : isP2PSale ? 'Peritaje de venta P2P'
           : 'Peritaje de autenticidad',
      lines: [v.comment],
      isRejection,
      watchmakerWallet: v.watchmaker,
      watchmakerUser: findUserByWallet(v.watchmaker),
      date: v.date ? new Date(v.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
    };
  });

  const all = [...transfers, ...revisions, ...verifications].sort((a, b) => b._ts - a._ts);

  return (
    <View style={watchScreenStyles.contentCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="time" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Historial On-Chain</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Registro inmutable de transferencias, verificaciones y cambios</Text>
        </View>
      </View>

      {all.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="cube-outline" size={26} color={colors.textMuted} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sin historial disponible</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
            Las transferencias y cambios de estado aparecerán aquí una vez registradas en blockchain.
          </Text>
        </View>
      ) : all.map((event, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ alignItems: 'center', width: 28 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: event.color + '25', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={event.icon} size={13} color={event.color} />
            </View>
            {index < all.length - 1 && (
              <View style={{ width: 1.5, flex: 1, minHeight: 20, backgroundColor: event.isRejection ? '#ef444430' : colors.border, marginTop: 4 }} />
            )}
          </View>

          <View style={{ flex: 1, paddingBottom: 16 }}>
            <Text style={{ color: event.color, fontWeight: '700', fontSize: 13 }}>{event.title}</Text>

            {event._type === 'transfer' && (() => {
              const rows = [
                { label: event.isMint ? 'Por' : 'De', wallet: event.fromWallet, user: event.fromUser, isEscrow: false },
                event.viaWallet ? { label: 'Vía', wallet: event.viaWallet, user: null, isEscrow: true, isAuction: event.isAuction } : null,
                !event.isMint ? { label: 'A', wallet: event.toWallet, user: event.toUser, isEscrow: false } : null,
              ].filter(Boolean);
              return rows.map(({ label, wallet, user, isEscrow, isAuction: isAuc }) => wallet ? (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, minWidth: 20 }}>{label}:</Text>
                  <TouchableOpacity onPress={() => Clipboard.setStringAsync(wallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: isEscrow ? '#f59e0b' : colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                      {wallet.slice(0, 8)}…{wallet.slice(-6)}
                    </Text>
                    <Ionicons name="copy-outline" size={11} color={isEscrow ? '#f59e0b' : colors.primaryLight} />
                  </TouchableOpacity>
                  {isEscrow && (
                    <View style={{ backgroundColor: '#f59e0b22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 }}>
                      <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>{isAuc ? 'Subasta' : 'Escrow'}</Text>
                    </View>
                  )}
                  {user && !isEscrow && (
                    <TouchableOpacity
                      onPress={() => navigation?.navigate('PublicProfile', { userId: user.id })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{user.username}</Text>
                      {(() => { const rk = user.roles?.find(r => ['FABRICANTE','DEALER','RELOJERO'].includes(r)); return rk ? <Ionicons name="checkmark-circle" size={13} color={roleColors[rk]} /> : null; })()}
                    </TouchableOpacity>
                  )}
                </View>
              ) : null);
            })()}

            {event._type === 'transfer' && event.lines.map((l, i) => l ? (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Ionicons name="cash-outline" size={11} color="#10b981" />
                <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>{l}</Text>
              </View>
            ) : null)}

            {event._type !== 'transfer' && event.lines?.map((l, i) => l ? (
              event.isRejection ? (
                <View key={i} style={{ backgroundColor: '#ef444415', borderRadius: 8, borderWidth: 1, borderColor: '#ef444430', padding: 8, marginTop: 5 }}>
                  <Text style={{ color: '#ef4444', fontSize: 12, fontStyle: 'italic' }}>"{l}"</Text>
                </View>
              ) : (
                <Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{l}</Text>
              )
            ) : null)}

            {event.watchmakerWallet && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <TouchableOpacity onPress={() => Clipboard.setStringAsync(event.watchmakerWallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                    {event.watchmakerWallet.slice(0, 8)}…{event.watchmakerWallet.slice(-6)}
                  </Text>
                  <Ionicons name="copy-outline" size={11} color={colors.primaryLight} />
                </TouchableOpacity>
                {event.watchmakerUser && !isManufacturer && (
                  <TouchableOpacity
                    onPress={() => navigation?.navigate('PublicProfile', { userId: event.watchmakerUser.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{event.watchmakerUser.username}</Text>
                    {(() => { const rk = event.watchmakerUser.roles?.find(r => ['FABRICANTE','DEALER','RELOJERO'].includes(r)); return rk ? <Ionicons name="checkmark-circle" size={13} color={roleColors[rk]} /> : null; })()}
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.date}</Text>
          </View>
        </View>
      ))}

      <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Contrato NFT</Text>
          <TouchableOpacity onPress={() => Clipboard.setStringAsync(nftAddress)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
              {nftAddress ? `${nftAddress.slice(0, 10)}…${nftAddress.slice(-8)}` : '—'}
            </Text>
            <Ionicons name="copy-outline" size={12} color={colors.primaryLight} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Token ID</Text>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>#{tokenId}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { const url = `${POLYGONSCAN_BASE}/token/${nftAddress}?a=${tokenId}`; if (Platform.OS === 'web') window.open(url, '_blank'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
        >
          <Ionicons name="open-outline" size={13} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ver en Polygonscan</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
