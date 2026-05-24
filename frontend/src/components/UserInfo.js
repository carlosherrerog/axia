import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../context/ThemeContext';
import { roleColors } from '../themes/styles';

const ROLE_ICONS = {
  FABRICANTE: 'construct',
  DEALER:     'storefront',
  RELOJERO:   'build',
  ADMIN:      'shield-checkmark',
  PARTICULAR: 'person',
};

const USDC_GREEN = '#22c55e';
const POL_GREEN  = '#4ade80';

const fmt = (value, dec = 2) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });

export default function UserInfo({ loggedUser, showAlert, stats }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const [usdcBalance, setUsdcBalance] = useState('0.00');
  const [polBalance,  setPolBalance]  = useState('0.00');
  const [copied,      setCopied]      = useState(false);

  const fetchBalances = useCallback(async (address) => {
    if (Platform.OS !== 'web' || !window.ethereum || !address) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const polBal = await provider.getBalance(address);
      setPolBalance(fmt(ethers.formatEther(polBal), 4));
      const usdcAddress = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS;
      if (usdcAddress) {
        const abi = ['function balanceOf(address) view returns (uint256)'];
        const contract = new ethers.Contract(usdcAddress, abi, provider);
        const usdcBal = await contract.balanceOf(address);
        setUsdcBalance(fmt(ethers.formatUnits(usdcBal, 6), 2));
      }
    } catch (e) {
      console.error('UserInfo balance fetch error:', e);
    }
  }, []);

  useEffect(() => {
    if (loggedUser?.wallet_address) fetchBalances(loggedUser.wallet_address);
    else { setUsdcBalance('0.00'); setPolBalance('0.00'); }
  }, [loggedUser?.wallet_address, fetchBalances]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !window.ethereum || !loggedUser?.wallet_address) return;
    const usdcAddress = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS;
    if (!usdcAddress) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const abi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
    const contract = new ethers.Contract(usdcAddress, abi, provider);
    const onTransfer = (from, to, value) => {
      const addr = loggedUser.wallet_address.toLowerCase();
      if (from.toLowerCase() === addr || to.toLowerCase() === addr) {
        fetchBalances(loggedUser.wallet_address);
      }
    };
    contract.on('Transfer', onTransfer);
    return () => contract.removeAllListeners('Transfer');
  }, [loggedUser?.wallet_address, fetchBalances, showAlert]);

  const handleCopy = async () => {
    if (!loggedUser?.wallet_address) return;
    await Clipboard.setStringAsync(loggedUser.wallet_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!loggedUser) return null;

  const initial   = (loggedUser.username?.[0] || '?').toUpperCase();
  const baseRoles = loggedUser.roles ?? [];
  const roles     = loggedUser.is_admin ? ['ADMIN', ...baseRoles] : baseRoles;
  const hasWallet = !!loggedUser.wallet_address;
  const addr      = loggedUser.wallet_address ?? '';

  const shadow = Platform.OS === 'web'
    ? { boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }
    : {};

  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
      overflow: 'hidden',
      ...shadow,
    }}>

      {/* Fila superior: avatar + info + wallet status */}
      <View style={{
        flexDirection: 'row',
        alignItems: isWide ? 'center' : 'flex-start',
        padding: 18,
        gap: 14,
      }}>
        {/* Avatar */}
        <View style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: colors.primary + '18',
          borderWidth: 2, borderColor: colors.primary + '55',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>
            {initial}
          </Text>
        </View>

        {/* Nombre + email + roles */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 }}>
                {loggedUser.username}
              </Text>
              {loggedUser.full_name ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                  {loggedUser.full_name}
                </Text>
              ) : null}
              {loggedUser.email ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                  {loggedUser.email}
                </Text>
              ) : null}
              {loggedUser.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{loggedUser.location}</Text>
                </View>
              ) : null}
            </View>

            {/* Badge wallet conectada */}
            {hasWallet ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: USDC_GREEN + '12',
                borderWidth: 1, borderColor: USDC_GREEN + '35',
                borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
                alignSelf: 'flex-start',
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: USDC_GREEN }} />
                <Text style={{ color: USDC_GREEN, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                  WALLET ACTIVA
                </Text>
              </View>
            ) : null}
          </View>

          {/* Badges de rol */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
            {(roles.length > 0 ? roles : ['PARTICULAR']).map(role => {
              const rc = roleColors[role] ?? roleColors.PARTICULAR;
              return (
                <View key={role} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: rc + '14',
                  borderWidth: 1, borderColor: rc + '40',
                  borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
                }}>
                  <Ionicons name={ROLE_ICONS[role] ?? 'person'} size={10} color={rc} />
                  <Text style={{ color: rc, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 }}>
                    {role}
                  </Text>
                  <Ionicons name="checkmark-circle" size={11} color={rc} />
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Sección wallet */}
      {hasWallet ? (
        <View style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 16,
        }}>
          {/* Dirección */}
          <TouchableOpacity
            onPress={handleCopy}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.surface,
              borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9,
              borderWidth: 1, borderColor: colors.border,
              marginBottom: 14,
            }}
          >
            <Ionicons name="wallet-outline" size={13} color={colors.textMuted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: colors.textSecondary,
                fontSize: 10,
                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                letterSpacing: 0.5,
              }}
            >
              {addr}
            </Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={13}
              color={copied ? USDC_GREEN : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Saldos */}
          <View style={{ flexDirection: 'row', gap: 10 }}>

            {/* USDC */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: USDC_GREEN + '20',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: USDC_GREEN }}>$</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>
                  USDC
                </Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '800', color: USDC_GREEN, letterSpacing: -0.8 }}>
                {usdcBalance}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                USD Coin · Polygon
              </Text>
            </View>

            {/* Separador vertical */}
            <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 2 }} />

            {/* POL */}
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: POL_GREEN + '20',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: POL_GREEN }}>P</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>
                  POL
                </Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '800', color: POL_GREEN, letterSpacing: -0.8 }}>
                {polBalance}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                Token nativo · Gas
              </Text>
            </View>

          </View>
        </View>
      ) : null}

      {/* Estadísticas opcionales */}
      {stats?.length > 0 ? (
        <View style={{
          flexDirection: 'row',
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          {stats.map((s, i) => (
            <View key={s.label} style={{
              flex: 1, alignItems: 'center',
              paddingVertical: 12,
              borderRightWidth: i < stats.length - 1 ? 1 : 0,
              borderRightColor: colors.border,
            }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: colors.primary, letterSpacing: -0.4 }}>
                {s.value}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

    </View>
  );
}
