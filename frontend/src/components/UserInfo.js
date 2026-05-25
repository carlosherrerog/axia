import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Platform, useWindowDimensions, Linking,
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

export default function UserInfo({ loggedUser, showAlert, stats, onSettings, noMargin = false }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;
  const isMobile = width < 768;

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
      marginHorizontal: noMargin ? 0 : (isMobile ? 16 : 8),
      marginBottom: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
      overflow: 'hidden',
      ...shadow,
    }}>

      {/* Fila superior: avatar + info + wallet status */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: isMobile ? 12 : 18,
        gap: isMobile ? 10 : 14,
      }}>
        {/* Avatar */}
        <View style={{
          width: isMobile ? 40 : 54, height: isMobile ? 40 : 54,
          borderRadius: isMobile ? 20 : 27,
          backgroundColor: colors.primary + '18',
          borderWidth: 2, borderColor: colors.primary + '55',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Text style={{ fontSize: isMobile ? 17 : 22, fontWeight: '700', color: colors.primary }}>
            {initial}
          </Text>
        </View>

        {/* Nombre + roles */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: isMobile ? 14 : 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 }} numberOfLines={1}>
                {loggedUser.username}
              </Text>
              {!isMobile && loggedUser.full_name ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1} ellipsizeMode="tail">
                  {loggedUser.full_name}
                </Text>
              ) : null}
              {!isMobile && loggedUser.email ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1} ellipsizeMode="tail">
                  {loggedUser.email}
                </Text>
              ) : null}
              {!isMobile && loggedUser.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1} ellipsizeMode="tail">{loggedUser.location}</Text>
                </View>
              ) : null}
            </View>

            {/* Badge wallet + botón configuración */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {hasWallet ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: USDC_GREEN + '12',
                  borderWidth: 1, borderColor: USDC_GREEN + '35',
                  borderRadius: 20, paddingHorizontal: isMobile ? 7 : 9, paddingVertical: isMobile ? 3 : 5,
                }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: USDC_GREEN }} />
                  {!isMobile && (
                    <Text style={{ color: USDC_GREEN, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                      WALLET ACTIVA
                    </Text>
                  )}
                  {isMobile && (
                    <Text style={{ color: USDC_GREEN, fontSize: 9, fontWeight: '700' }}>Wallet</Text>
                  )}
                </View>
              ) : null}
              {onSettings ? (
                <TouchableOpacity
                  onPress={onSettings}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="settings-outline" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Badges de rol */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: isMobile ? 6 : 9 }}>
            {(roles.length > 0 ? roles : ['PARTICULAR']).map(role => {
              const rc = roleColors[role] ?? roleColors.PARTICULAR;
              return (
                <View key={role} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: rc + '14',
                  borderWidth: 1, borderColor: rc + '40',
                  borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
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
          paddingHorizontal: isMobile ? 12 : 18,
          paddingTop: isMobile ? 10 : 12,
          paddingBottom: isMobile ? 12 : 12,
        }}>
          {!isMobile ? (
            /* Desktop: dirección + balances en una sola fila horizontal */
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={handleCopy}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: colors.surface, borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Ionicons name="wallet-outline" size={11} color={colors.textMuted} />
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.textSecondary, fontSize: 11, maxWidth: 280,
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                    letterSpacing: 0.3,
                  }}
                >
                  {addr}
                </Text>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={11} color={copied ? USDC_GREEN : colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Linking.openURL(`https://amoy.polygonscan.com/address/${addr}`)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: '#8b5cf612', borderRadius: 8,
                  borderWidth: 1, borderColor: '#8b5cf630',
                  paddingHorizontal: 8, paddingVertical: 6,
                }}
              >
                <Ionicons name="open-outline" size={11} color="#8b5cf6" />
                <Text style={{ color: '#8b5cf6', fontSize: 11, fontWeight: '700' }}>Polygonscan</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              {/* USDC */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: USDC_GREEN + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: USDC_GREEN }}>$</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>USDC</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: USDC_GREEN, letterSpacing: -0.5 }}>{usdcBalance}</Text>
              </View>

              <View style={{ width: 1, height: 22, backgroundColor: colors.border }} />

              {/* POL */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: POL_GREEN + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: POL_GREEN }}>P</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>POL</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: POL_GREEN, letterSpacing: -0.5 }}>{polBalance}</Text>
              </View>
            </View>
          ) : (
            /* Móvil: dirección + polygonscan arriba, balances abajo */
            <>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={handleCopy}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.surface, borderRadius: 10,
                    paddingHorizontal: 10, paddingVertical: 7,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Ionicons name="wallet-outline" size={12} color={colors.textMuted} />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1, color: colors.textSecondary, fontSize: 10,
                      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                      letterSpacing: 0.5,
                    }}
                  >
                    {`${addr.slice(0, 8)}…${addr.slice(-6)}`}
                  </Text>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12} color={copied ? USDC_GREEN : colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://amoy.polygonscan.com/address/${addr}`)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#8b5cf612', borderRadius: 10,
                    borderWidth: 1, borderColor: '#8b5cf630',
                    paddingHorizontal: 8, paddingVertical: 7,
                  }}
                >
                  <Ionicons name="open-outline" size={12} color="#8b5cf6" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: USDC_GREEN + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 8, fontWeight: '900', color: USDC_GREEN }}>$</Text>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>USDC</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: USDC_GREEN, letterSpacing: -0.5 }}>{usdcBalance}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 2 }} />
                <View style={{ flex: 1, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: POL_GREEN + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 8, fontWeight: '900', color: POL_GREEN }}>P</Text>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>POL</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: POL_GREEN, letterSpacing: -0.5 }}>{polBalance}</Text>
                </View>
              </View>
            </>
          )}
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
