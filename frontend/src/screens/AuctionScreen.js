import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useFocusEffect } from '@react-navigation/native';
import api, { getToken, WS_URL } from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import AlertModal, { useAlert } from '../components/AlertModal';
import { useTheme } from '../context/ThemeContext';
import { watchScreenStyles } from '../themes/styles.js';
import WatchAuction_ABI from '../contracts/WatchAuction.json';
import MockUSDC_ABI from '../contracts/MockUSDC.json';

const AUCTION_ADDRESS = process.env.EXPO_PUBLIC_AUCTION_ADDRESS;
const USDC_ADDRESS    = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS;

const AUCTION_ERRORS = {
  '69b8d0fe': 'La subasta ya no está activa.',
  '64637389': 'La subasta aún no ha terminado.',
  'd02e774d': 'La subasta ya ha finalizado.',
  'a0d26eb6': 'La puja es demasiado baja. Debes superar la puja actual.',
  'ef025889': 'El vendedor no puede pujar en su propia subasta.',
  '82b42900': 'No estás autorizado para realizar esta acción.',
  '90b8ec18': 'Error en la transferencia de fondos. Revisa tu aprobación de USDC.',
  '00bfc921': 'El precio mínimo no es válido.',
  '30cd7471': 'No eres el propietario de este reloj.',
  '3ee5aeb5': 'Error de reentrancy. Inténtalo de nuevo.',
};

function decodeContractError(error) {
  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data ?? '';
  if (typeof data === 'string' && data.startsWith('0x')) {
    const selector = data.slice(2, 10).toLowerCase();
    if (AUCTION_ERRORS[selector]) return AUCTION_ERRORS[selector];
  }
  if (error?.code === 'ACTION_REJECTED') return 'Has cancelado la transacción en MetaMask.';
  return null;
}

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Finalizada';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const ZERO_ADDR    = '0x0000000000000000000000000000000000000000';
const parseUTCDate = s => s ? new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z') : null;
const fmtDateTime  = s => {
  const d = parseUTCDate(s);
  return d
    ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
};

export default function AuctionScreen({ route, navigation }) {
  const { tokenId } = route.params;
  const { colors }  = useTheme();

  const [auction, setAuction]           = useState(null);
  const [watch, setWatch]               = useState(null);
  const [loggedUser, setLoggedUser]     = useState(null);
  const [appUsers, setAppUsers]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [remaining, setRemaining]       = useState(0);
  const [txLoading, setTxLoading]       = useState(false);
  const [bidAmount, setBidAmount]       = useState('');
  const [showBidInput, setShowBidInput] = useState(false);
  const [confirmAlert, setConfirmAlert] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const { alertProps, showAlert }       = useAlert();

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [auctionRes, watchRes, userRes] = await Promise.all([
        api.get(`/auctions/${tokenId}`),
        api.get(`/public/nfts/${tokenId}`),
        api.get('/users/me'),
      ]);
      setAuction(auctionRes.data);
      setWatch(watchRes.data);
      setLoggedUser(userRes.data);
      setRemaining(auctionRes.data.seconds_remaining ?? 0);
      const minBid = Math.max(auctionRes.data.highest_bid, auctionRes.data.min_price);
      setBidAmount(String((minBid + 1).toFixed(2)));
    } catch (e) {
      console.error('AuctionScreen fetch error:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tokenId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    api.get('/users').then(r => setAppUsers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    getToken().then(token => {
      ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'update_auction') fetchData(true);
        } catch {}
      };
    });
    return () => ws?.close();
  }, [loggedUser?.id]);

  const findUserByWallet = (wallet) =>
    wallet ? appUsers.find(u => u.wallet_address?.toLowerCase() === wallet.toLowerCase()) : null;

  const handlePlaceBid = async () => {
    if (!window.ethereum) { showAlert('Error', 'Necesitas MetaMask.', 'error'); return; }
    const amount = parseFloat(bidAmount);
    const minBid = Math.max(auction.highest_bid, auction.min_price);
    if (isNaN(amount) || amount <= minBid) return;

    try {
      setTxLoading(true);
      setShowBidInput(false);
      const provider  = new ethers.BrowserProvider(window.ethereum);
      const signer    = await provider.getSigner();
      const usdc      = new ethers.Contract(USDC_ADDRESS, MockUSDC_ABI.abi, signer);
      const auctionCt = new ethers.Contract(AUCTION_ADDRESS, WatchAuction_ABI.abi, signer);
      const amountWei = ethers.parseUnits(String(amount), 6);

      const approveTx = await usdc.approve(AUCTION_ADDRESS, amountWei);
      await approveTx.wait();
      const bidTx = await auctionCt.placeBid(tokenId, amountWei);
      await bidTx.wait();

      await api.post(`/auctions/${tokenId}/bid`, { bid_amount_usdc: amount });
      showAlert('¡Puja realizada!', `Has pujado ${amount} USDC por este reloj.`, 'success');
      fetchData(true);
    } catch (error) {
      const msg = decodeContractError(error) ?? error.response?.data?.detail ?? 'No se pudo realizar la puja.';
      showAlert('Error al pujar', msg, 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const confirmEndAuction = () => {
    const noWinner = !auction.highest_bidder || auction.highest_bid === 0;
    setConfirmAlert({
      visible: true,
      title: noWinner ? 'Sin pujas' : 'Finalizar subasta',
      message: noWinner
        ? 'Nadie ha pujado por este reloj. Al finalizar, tu reloj volverá a tu colección.'
        : `¿Finalizar la subasta? El ganador ha pujado ${auction.highest_bid.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC.`,
      onConfirm: executeEndAuction,
    });
  };

  const executeEndAuction = async () => {
    if (!window.ethereum) { showAlert('Error', 'Necesitas MetaMask.', 'error'); return; }
    const noWinner = !auction.highest_bidder || auction.highest_bid === 0;
    try {
      setTxLoading(true);
      const provider  = new ethers.BrowserProvider(window.ethereum);
      const signer    = await provider.getSigner();
      const auctionCt = new ethers.Contract(AUCTION_ADDRESS, WatchAuction_ABI.abi, signer);
      const tx = await auctionCt.endAuction(tokenId);
      await tx.wait();
      await api.post(`/auctions/${tokenId}/end`);
      showAlert(
        noWinner ? 'Sin ganador' : 'Subasta finalizada',
        noWinner
          ? 'La subasta ha terminado sin pujas. Tu reloj ha vuelto a tu colección.'
          : 'La subasta se ha liquidado correctamente.',
        noWinner ? 'warning' : 'success'
      );
      setTimeout(() => navigation.navigate('Perfil'), 1800);
    } catch (error) {
      const msg = decodeContractError(error) ?? error.response?.data?.detail ?? 'No se pudo finalizar la subasta.';
      showAlert('Error al finalizar', msg, 'error');
    } finally {
      setTxLoading(false);
    }
  };

  // ── HISTORY RENDERER (idéntico al original) ──────────────────────────────
  const renderHistory = () => {
    const auctionLower = AUCTION_ADDRESS?.toLowerCase();
    const isAltered    = watch?.security_state === 4;

    const transfers = (watch?.history || []).map(e => {
      const isMint = !e.previous_owner_wallet || e.previous_owner_wallet.toLowerCase() === ZERO_ADDR;
      const d = parseUTCDate(e.transferred_at);
      const isAuction = !isMint && e.via_contract_wallet && auctionLower &&
        e.via_contract_wallet.toLowerCase() === auctionLower;
      return {
        _type: 'transfer',
        _ts: d ? d.getTime() / 1000 : 0,
        icon: isMint ? 'flash-outline' : isAuction ? 'hammer-outline' : 'swap-horizontal',
        color: isMint ? '#a855f7' : isAuction ? '#f59e0b' : colors.primary,
        title: isMint ? 'Minteo inicial' : isAuction ? 'Vendido en subasta' : 'Transferencia de propiedad',
        price: e.price_usdc != null
          ? `${Number(e.price_usdc).toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC`
          : null,
        isMint, isAuction,
        fromWallet: isMint
          ? (watch?.manufacturer_wallet || watch?.verifications?.[0]?.watchmaker || null)
          : (e.previous_owner_wallet || null),
        viaWallet: e.via_contract_wallet || null,
        toWallet: e.new_owner_wallet || null,
        fromUser: isMint
          ? findUserByWallet(watch?.manufacturer_wallet || watch?.verifications?.[0]?.watchmaker)
          : findUserByWallet(e.previous_owner_wallet),
        toUser: findUserByWallet(e.new_owner_wallet),
        date: fmtDateTime(e.transferred_at),
      };
    });

    const revisions = (watch?.revisions || []).map(r => ({
      _type: 'revision', _ts: r.date || 0,
      icon: 'construct-outline', color: '#f59e0b',
      title: 'Revisión técnica',
      lines: [r.description],
      watchmakerWallet: r.watchmaker,
      watchmakerUser: findUserByWallet(r.watchmaker),
      date: r.date ? new Date(r.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
    }));

    const mfgWallet      = watch?.manufacturer_wallet?.toLowerCase();
    const rawVerifs      = watch?.verifications || [];
    const latestVerifDate = rawVerifs.length > 0 ? Math.max(...rawVerifs.map(v => v.date || 0)) : -1;
    const verifications  = rawVerifs.map(v => {
      const isManufacturerCert  = mfgWallet && v.watchmaker?.toLowerCase() === mfgWallet;
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
        color: isRejection ? '#ef4444'
             : isManufacturerCert ? '#a855f7'
             : isP2PSale ? '#38bdf8'
             : '#10b981',
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

    if (all.length === 0) return (
      <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cube-outline" size={26} color={colors.textMuted} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sin historial disponible</Text>
      </View>
    );

    return all.map((event, index) => (
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
              { label: 'A', wallet: event.toWallet, user: event.toUser, isEscrow: false },
            ].filter(Boolean);
            return rows.map(({ label, wallet, user, isEscrow, isAuction: ia }) => wallet ? (
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
                    <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>{ia ? 'Subasta' : 'Escrow'}</Text>
                  </View>
                )}
                {user && !isEscrow && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('PublicProfile', { userId: user.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}
                  >
                    <Ionicons name="person-outline" size={10} color={colors.primaryLight} />
                    <Text style={{ color: colors.primaryLight, fontSize: 10, fontWeight: '600' }}>{user.username}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null);
          })()}

          {event.price && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Ionicons name="cash-outline" size={11} color="#10b981" />
              <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>{event.price}</Text>
            </View>
          )}

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
              {event.watchmakerUser && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('PublicProfile', { userId: event.watchmakerUser.id })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}
                >
                  <Ionicons name="person-outline" size={11} color={colors.primaryLight} />
                  <Text style={{ color: colors.primaryLight, fontSize: 11, fontWeight: '600' }}>{event.watchmakerUser.username}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.date}</Text>
        </View>
      </View>
    ));
  };

  // ── LOADING / NOT FOUND ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GlobalHeader loggedUser={loggedUser} navigation={navigation} title="Subasta" onWalletChange={setLoggedUser} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Ionicons name="hourglass-outline" size={52} color={colors.border} />
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Subasta no encontrada</Text>
        </View>
      </View>
    );
  }

  const isExpired       = remaining <= 0;
  const isOwner         = loggedUser?.wallet_address?.toLowerCase() === auction.seller?.toLowerCase();
  const isHighestBidder = !!(loggedUser?.wallet_address && auction.highest_bidder &&
    loggedUser.wallet_address.toLowerCase() === auction.highest_bidder.toLowerCase());
  const minBid          = Math.max(auction.highest_bid, auction.min_price);
  const minRequired     = minBid + 1;
  const bidValue        = parseFloat(bidAmount);
  const bidError        = showBidInput && bidAmount !== ''
    ? (isNaN(bidValue) || bidValue <= minBid)
      ? `La puja mínima debe ser de ${minRequired.toFixed(2)} USDC`
      : null
    : null;

  const timerColor = isExpired ? colors.textMuted : remaining < 3600 ? '#f59e0b' : colors.primaryLight;

  // ── JSX ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader loggedUser={loggedUser} navigation={navigation} title="Subasta" onWalletChange={setLoggedUser} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── HERO IMAGE ── */}
        <View style={{
          position: 'relative',
          height: Platform.OS === 'web' ? 480 : 360,
          overflow: 'hidden',
          backgroundColor: colors.backgroundAlt,
          ...(Platform.OS === 'web' && {
            background: `radial-gradient(ellipse at 50% 35%, rgba(139,92,246,0.18) 0%, ${colors.backgroundAlt} 68%)`,
          }),
        }}>
          <Image
            source={{ uri: watch?.image || 'https://via.placeholder.com/400?text=Watch' }}
            style={{ width: '65%', height: '82%', alignSelf: 'center', marginTop: '4%' }}
            resizeMode="contain"
          />

          {/* Bottom gradient — web only */}
          {Platform.OS === 'web' && (
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
              background: `linear-gradient(to top, ${colors.background} 0%, transparent 100%)`,
              pointerEvents: 'none',
            }} />
          )}

          {/* Back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              position: 'absolute', top: 16, left: 16,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: 24,
              paddingHorizontal: 14, paddingVertical: 8,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
              ...(Platform.OS === 'web' && { backdropFilter: 'blur(12px)' }),
            }}
          >
            <Ionicons name="arrow-back" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Volver</Text>
          </TouchableOpacity>

          {/* Status badge */}
          <View style={{
            position: 'absolute', top: 16, right: 16,
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: isExpired ? 'rgba(0,0,0,0.65)' : `${colors.primary}ee`,
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
            borderWidth: 1, borderColor: isExpired ? 'rgba(255,255,255,0.1)' : colors.primary,
            ...(Platform.OS === 'web' && { backdropFilter: 'blur(8px)' }),
          }}>
            {!isExpired && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
            <Ionicons name={isExpired ? 'ban-outline' : 'hammer-outline'} size={11} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
              {isExpired ? 'FINALIZADA' : 'EN SUBASTA'}
            </Text>
          </View>

          {/* Watch name overlay */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingTop: 32 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 3 }}>
              {watch?.brand?.toUpperCase()}
            </Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>
              {watch?.model}
            </Text>
            <View style={{ flexDirection: 'row', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
              {watch?.manufacturingYear && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{watch.manufacturingYear}</Text>
                </View>
              )}
              <View style={{
                backgroundColor: 'rgba(16,185,129,0.22)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <Ionicons name="shield-checkmark" size={10} color="#10b981" />
                <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>Certificado blockchain</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── METRICS BAR ── */}
        <View style={{
          flexDirection: 'row', marginHorizontal: 16, marginTop: 16,
          borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
        }}>
          {[
            {
              label: auction.highest_bid > 0 ? 'Puja actual' : 'Precio mínimo',
              value: (auction.highest_bid > 0 ? auction.highest_bid : auction.min_price)
                .toLocaleString('en-US', { minimumFractionDigits: 2 }),
              unit: 'USDC', color: '#10b981',
            },
            {
              label: 'Precio mínimo',
              value: auction.min_price.toLocaleString('en-US', { minimumFractionDigits: 2 }),
              unit: 'USDC', color: colors.primaryLight,
            },
            {
              label: 'Pujas',
              value: `${auction.bids?.length ?? 0}`,
              unit: (auction.bids?.length ?? 0) === 1 ? 'puja' : 'pujas',
              color: '#f59e0b',
            },
          ].map((m, i, arr) => (
            <View key={m.label} style={{
              flex: 1, alignItems: 'center', paddingVertical: 14,
              backgroundColor: colors.backgroundAlt,
              borderRightWidth: i < arr.length - 1 ? 1 : 0,
              borderRightColor: colors.border,
            }}>
              <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginBottom: 5 }}>
                {m.label.toUpperCase()}
              </Text>
              <Text style={{ color: m.color, fontWeight: '800', fontSize: 17 }}>{m.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{m.unit}</Text>
            </View>
          ))}
        </View>

        {/* ── COUNTDOWN ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 14,
          marginHorizontal: 16, marginTop: 10,
          borderRadius: 16, padding: 16,
          backgroundColor: colors.backgroundAlt,
          borderWidth: 1,
          borderColor: isExpired ? colors.border : `${timerColor}35`,
          ...(Platform.OS === 'web' && !isExpired && {
            boxShadow: `0 0 24px ${timerColor}18`,
          }),
        }}>
          <View style={{
            width: 48, height: 48, borderRadius: 14,
            backgroundColor: isExpired ? colors.surface : `${timerColor}18`,
            borderWidth: 1, borderColor: isExpired ? colors.border : `${timerColor}35`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={isExpired ? 'ban-outline' : remaining < 3600 ? 'flame-outline' : 'time-outline'}
              size={22} color={timerColor}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 3 }}>
              {isExpired ? 'ESTADO' : 'TIEMPO RESTANTE'}
            </Text>
            <Text style={{ fontWeight: '800', fontSize: 24, letterSpacing: -0.5, color: isExpired ? colors.textSecondary : colors.text }}>
              {formatCountdown(remaining)}
            </Text>
          </View>
          {!isExpired && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 3 }}>Finaliza</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {fmtDateTime(auction.end_time)}
              </Text>
            </View>
          )}
        </View>

        {/* ── AUCTION PANEL ── */}
        <View style={{
          margin: 16, borderRadius: 20, overflow: 'hidden',
          backgroundColor: colors.backgroundAlt,
          borderWidth: 1, borderColor: isExpired ? colors.border : `${colors.primary}28`,
        }}>
          {/* Seller row */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <View style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 }}>VENDEDOR</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{auction.seller_name}</Text>
            </View>
            <View style={{
              backgroundColor: `${colors.primary}15`, borderRadius: 10,
              paddingHorizontal: 10, paddingVertical: 5,
              borderWidth: 1, borderColor: `${colors.primary}30`,
            }}>
              <Text style={{ color: colors.primaryLight, fontSize: 11, fontWeight: '700' }}>DEALER</Text>
            </View>
          </View>

          <View style={{ padding: 16, gap: 12 }}>
            {/* Highest bidder */}
            {auction.highest_bidder ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: isHighestBidder ? `${colors.primary}12` : colors.surface,
                borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: isHighestBidder ? `${colors.primary}30` : colors.border,
              }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: isHighestBidder ? `${colors.primary}25` : colors.backgroundAlt,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: isHighestBidder ? colors.primary : colors.border,
                }}>
                  <Ionicons
                    name={isHighestBidder ? 'trophy' : 'person'}
                    size={16} color={isHighestBidder ? colors.primaryLight : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 }}>
                    MÁXIMO PUJANTE
                  </Text>
                  <Text style={{ color: isHighestBidder ? colors.primaryLight : colors.text, fontSize: 14, fontWeight: '700' }}>
                    {findUserByWallet(auction.highest_bidder)?.username ||
                      `${auction.highest_bidder.slice(0, 6)}…${auction.highest_bidder.slice(-4)}`}
                  </Text>
                </View>
                {isHighestBidder && (
                  <View style={{ backgroundColor: `${colors.primary}22`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ color: colors.primaryLight, fontSize: 12, fontWeight: '800' }}>TÚ 🏆</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                </View>
                <View>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Sin pujas todavía</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Sé el primero en pujar</Text>
                </View>
              </View>
            )}

            {/* ── ACTIONS ── */}

            {/* No wallet */}
            {!isExpired && !isOwner && !loggedUser?.wallet_address && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: colors.surface, borderRadius: 14, padding: 16,
                borderWidth: 1, borderColor: colors.border,
              }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="wallet-outline" size={20} color={colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 14 }}>Wallet no conectada</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Conecta tu wallet para poder pujar.
                  </Text>
                </View>
              </View>
            )}

            {/* Can bid */}
            {!isExpired && !isOwner && !!loggedUser?.wallet_address && !isHighestBidder && (
              showBidInput ? (
                <View style={{ gap: 10 }}>
                  {/* Quick suggestions */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[minRequired, minRequired + 5, minRequired + 10, minRequired + 50].map(sug => (
                      <TouchableOpacity
                        key={sug}
                        onPress={() => setBidAmount(sug.toFixed(2))}
                        style={{
                          flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                          backgroundColor: parseFloat(bidAmount) === sug ? `${colors.primary}22` : colors.surface,
                          borderWidth: 1,
                          borderColor: parseFloat(bidAmount) === sug ? `${colors.primary}50` : colors.border,
                        }}
                      >
                        <Text style={{
                          color: parseFloat(bidAmount) === sug ? colors.primaryLight : colors.textSecondary,
                          fontSize: 12, fontWeight: '700',
                        }}>
                          {sug >= 1000 ? `${(sug / 1000).toFixed(1)}k` : sug.toFixed(0)}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 9 }}>USDC</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ position: 'relative' }}>
                    <TextInput
                      value={bidAmount}
                      onChangeText={setBidAmount}
                      keyboardType="decimal-pad"
                      placeholder={`Mínimo ${minRequired.toFixed(2)}`}
                      placeholderTextColor={colors.textMuted}
                      style={{
                        backgroundColor: colors.surface, color: colors.text,
                        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                        paddingRight: 64, fontSize: 16, fontWeight: '600',
                        borderWidth: 1, borderColor: bidError ? '#ef4444' : colors.border,
                        ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                      }}
                    />
                    <View style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}>
                      <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12 }}>USDC</Text>
                    </View>
                  </View>

                  {bidError && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontSize: 12 }}>{bidError}</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setShowBidInput(false)}
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 24, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handlePlaceBid}
                      disabled={!!bidError || bidAmount === ''}
                      style={{
                        flex: 2, paddingVertical: 14, borderRadius: 24,
                        alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'row', gap: 8,
                        backgroundColor: (bidError || bidAmount === '') ? colors.border : colors.primary,
                        ...(Platform.OS === 'web' && !bidError && bidAmount !== '' && {
                          boxShadow: `0 4px 16px ${colors.primary}50`,
                        }),
                      }}
                    >
                      <Ionicons name="trending-up-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                        Pujar{bidAmount && !bidError ? ` ${bidAmount} USDC` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowBidInput(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                    borderRadius: 16, paddingVertical: 18,
                    backgroundColor: colors.primary,
                    ...(Platform.OS === 'web' && { boxShadow: `0 6px 24px ${colors.primary}55` }),
                  }}
                >
                  <Ionicons name="trending-up-outline" size={20} color="#fff" />
                  <View>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Realizar Puja</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                      Mínimo {minRequired.toFixed(2)} USDC
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            )}

            {/* Already highest bidder */}
            {!isExpired && isHighestBidder && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: `${colors.primary}12`, borderRadius: 14, padding: 16,
                borderWidth: 1, borderColor: `${colors.primary}25`,
              }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.primaryLight, fontWeight: '800', fontSize: 15 }}>Eres el máximo pujante</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Te notificaremos si alguien supera tu puja.
                  </Text>
                </View>
              </View>
            )}

            {/* Owner — en curso */}
            {isOwner && !isExpired && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  La subasta está en curso. Podrás finalizarla cuando expire el tiempo.
                </Text>
              </View>
            )}

            {/* Owner — expirada */}
            {isOwner && isExpired && (
              <TouchableOpacity
                onPress={confirmEndAuction}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                  backgroundColor: '#f59e0b', borderRadius: 16, paddingVertical: 18,
                  ...(Platform.OS === 'web' && { boxShadow: '0 6px 24px rgba(245,158,11,0.45)' }),
                }}
              >
                <Ionicons name="flag-outline" size={20} color="#fff" />
                <View>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Finalizar Subasta</Text>
                  {(auction.bids?.length ?? 0) > 0 && (
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                      {auction.bids.length} puja{auction.bids.length !== 1 ? 's' : ''} registrada{auction.bids.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {/* No owner — expirada */}
            {!isOwner && isExpired && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="hourglass-outline" size={20} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  Subasta concluida. Esperando que el vendedor la finalice.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── BID HISTORY ── */}
        {auction.bids?.length > 0 && (
          <View style={[watchScreenStyles.contentCard, { marginHorizontal: 16, marginTop: 4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#10b98118', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trending-up" size={18} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Historial de Pujas</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                  {auction.bids.length} puja{auction.bids.length !== 1 ? 's' : ''} · Tiempo real
                </Text>
              </View>
            </View>

            {auction.bids.map((bid, i) => {
              const bidUser  = findUserByWallet(bid.wallet);
              const isWinner = bid.wallet?.toLowerCase() === auction.highest_bidder?.toLowerCase();
              const isMe     = bid.wallet?.toLowerCase() === loggedUser?.wallet_address?.toLowerCase();
              const initials = (bidUser?.username || bid.wallet.slice(0, 2)).toUpperCase().slice(0, 2);
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 11,
                    borderBottomWidth: i < auction.bids.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  {/* Rank */}
                  <View style={{ width: 28, alignItems: 'center', marginRight: 8 }}>
                    {i === 0
                      ? <Ionicons name="trophy" size={15} color="#10b981" />
                      : <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>#{i + 1}</Text>
                    }
                  </View>

                  {/* Avatar initials */}
                  <View style={{
                    width: 34, height: 34, borderRadius: 17, marginRight: 10,
                    backgroundColor: isWinner ? '#10b98120' : colors.surface,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isWinner ? '#10b98145' : colors.border,
                  }}>
                    <Text style={{ color: isWinner ? '#10b981' : colors.textMuted, fontSize: 12, fontWeight: '800' }}>
                      {initials}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isMe ? colors.primaryLight : isWinner ? colors.text : colors.textSecondary, fontSize: 13, fontWeight: isWinner ? '700' : '500' }} numberOfLines={1}>
                      {bidUser?.username ?? `${bid.wallet.slice(0, 8)}…${bid.wallet.slice(-6)}`}
                      {isMe ? ' · Tú' : ''}
                    </Text>
                  </View>

                  <Text style={{ color: isWinner ? '#10b981' : colors.textSecondary, fontWeight: '700', fontSize: 14 }}>
                    {bid.amount.toFixed(2)}{' '}
                    <Text style={{ fontSize: 10, fontWeight: '400', color: colors.textMuted }}>USDC</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── ON-CHAIN HISTORY ── */}
        <View style={[watchScreenStyles.contentCard, { marginHorizontal: 16, marginTop: 4, marginBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="time" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Historial On-Chain</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Registro inmutable en blockchain</Text>
            </View>
          </View>
          {renderHistory()}
        </View>

      </ScrollView>

      {/* Transaction overlay */}
      <Modal visible={txLoading} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
          justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{ backgroundColor: colors.backgroundAlt, borderRadius: 24, padding: 36, alignItems: 'center', gap: 18, borderWidth: 1, borderColor: colors.border, minWidth: 280 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>Esperando MetaMask</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
              Confirma la transacción en tu wallet para continuar.
            </Text>
          </View>
        </View>
      </Modal>

      <AlertModal {...alertProps} />
      <AlertModal
        visible={confirmAlert.visible}
        type="warning"
        title={confirmAlert.title}
        message={confirmAlert.message}
        confirmLabel="Finalizar"
        onConfirm={() => { setConfirmAlert(s => ({ ...s, visible: false })); confirmAlert.onConfirm?.(); }}
        cancelLabel="Cancelar"
        onCancel={() => setConfirmAlert(s => ({ ...s, visible: false }))}
      />
    </View>
  );
}
