// src/screens/PublicProfileScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, useWindowDimensions, Image, Platform, Alert } from 'react-native'; // ✅ Añadido Alert
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard'; // ✅ Importado Clipboard
import api, { WS_URL } from '../api/api.js';
import PublicWatchCard from '../components/PublicWatchCard';
import GlobalHeader from '../components/GlobalHeader';
import { colors, watchScreenStyles, roleColors } from '../themes/styles.js';

export default function PublicProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const [profile, setProfile] = useState(null);
  const [loggedUser, setLoggedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const hPad = isDesktop ? Math.max(24, Math.floor((width - 1000) / 2)) : 16;
  const contentW = width - 2 * hPad;
  
  const [activeTab, setActiveTab] = useState('coleccion');

  const fetchLoggedUser = async () => {
    try {
      const res = await api.get('/users/me');
      setLoggedUser(res.data);
    } catch (e) {
      console.error("Error obteniendo loggedUser", e);
    }
  };

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/public/users/${userId}`);
      setProfile(res.data);
    } catch (error) {
      console.error("Error cargando perfil público:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchLoggedUser();
      fetchProfile();

      const ws = new WebSocket(`${WS_URL}/ws/admin`);
      ws.onmessage = (event) => {
        if (event.data === "update_marketplace" || event.data === "update_nfts") {
          fetchProfile(); 
        }
      };
      return () => { if (ws) ws.close(); };
    }, [fetchProfile])
  );

  if (loading || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const watches = profile.watches || [];
  const forSaleNfts = watches.filter(w => w.is_listed === 1 || w.is_listed === true);
  const collectionNfts = watches; 
  const nftsToDisplay = activeTab === 'coleccion' ? collectionNfts : forSaleNfts;

  let cols = 2;
  if (contentW >= 1100) cols = 5;
  else if (contentW >= 850) cols = 4;
  else if (contentW >= 620) cols = 3;

  const topRole = profile.roles?.includes('FABRICANTE') ? 'FABRICANTE'
    : profile.roles?.includes('DEALER') ? 'DEALER'
    : profile.roles?.includes('RELOJERO') ? 'RELOJERO'
    : null;
  const topRoleColor = topRole ? (roleColors[topRole] || colors.primary) : colors.primary;
  const topRoleIcon  = topRole ? { FABRICANTE: 'construct', DEALER: 'storefront', RELOJERO: 'build' }[topRole] : 'person';

  const renderHeader = () => (
    <View style={{ marginBottom: 24 }}>
      {/* Botón volver */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, alignSelf: 'flex-start' }}
      >
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Volver</Text>
        </View>
      </TouchableOpacity>

      {/* Hero card */}
      <View style={{
        backgroundColor: colors.backgroundAlt,
        borderRadius: 20, borderWidth: 1, borderColor: colors.border,
        marginBottom: 20, overflow: 'hidden',
      }}>
        {/* Franja de acento superior */}
        <View style={{ height: 3, backgroundColor: topRoleColor + '90' }} />

        <View style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            {/* Avatar */}
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: topRoleColor + '18',
              borderWidth: 2, borderColor: topRoleColor + '60',
              justifyContent: 'center', alignItems: 'center', flexShrink: 0,
            }}>
              {profile.profile_image ? (
                <Image source={{ uri: profile.profile_image }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
              ) : (
                <Ionicons name={topRoleIcon} size={36} color={topRoleColor} />
              )}
            </View>

            {/* Datos principales */}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: 0.2 }}>
                {profile.username}
              </Text>

              {/* Roles */}
              {profile.roles && profile.roles.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {profile.roles.map(role => {
                    const rc = roleColors[role] || colors.primary;
                    const ri = { FABRICANTE: 'construct', DEALER: 'storefront', RELOJERO: 'build' }[role] || 'person';
                    return (
                      <View key={role} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: rc + '20', borderWidth: 1, borderColor: rc + '60',
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                      }}>
                        <Ionicons name={ri} size={11} color={rc} />
                        <Text style={{ color: rc, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>{role}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Particular</Text>
                </View>
              )}

              {/* Wallet */}
              {profile.wallet_address ? (
                <TouchableOpacity
                  onPress={() => Clipboard.setStringAsync(profile.wallet_address)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                >
                  <View style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="wallet-outline" size={12} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                      {`${profile.wallet_address.slice(0, 8)}…${profile.wallet_address.slice(-6)}`}
                    </Text>
                    <Ionicons name="copy-outline" size={11} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="wallet-outline" size={13} color={colors.border} />
                  <Text style={{ color: colors.border, fontSize: 12 }}>Sin wallet vinculada</Text>
                </View>
              )}

              {/* Ubicación */}
              {profile.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{profile.location}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', marginTop: 18, gap: 1 }}>
            {[
              { label: 'Relojes', value: collectionNfts.length, icon: 'watch-outline' },
              { label: 'En venta', value: forSaleNfts.length, icon: 'pricetag-outline' },
            ].map((stat, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.surface, borderRadius: i === 0 ? 12 : 12, marginHorizontal: 4, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name={stat.icon} size={18} color={topRoleColor} style={{ marginBottom: 4 }} />
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{stat.value}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 }}>
        {[
          { key: 'coleccion', label: 'Colección', icon: 'albums-outline', count: collectionNfts.length },
          { key: 'venta',     label: 'En Venta',  icon: 'pricetag-outline', count: forSaleNfts.length },
        ].map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 10, borderRadius: 10,
                backgroundColor: active ? topRoleColor + '20' : 'transparent',
                borderWidth: active ? 1 : 0, borderColor: active ? topRoleColor + '50' : 'transparent',
              }}
            >
              <Ionicons name={tab.icon} size={15} color={active ? topRoleColor : colors.textSecondary} />
              <Text style={{ color: active ? topRoleColor : colors.textSecondary, fontSize: 13, fontWeight: active ? '700' : '400' }}>
                {tab.label}
              </Text>
              <View style={{ backgroundColor: active ? topRoleColor + '30' : colors.surface, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: active ? topRoleColor : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{tab.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader 
        loggedUser={loggedUser} 
        title={`Perfil Público`} 
        navigation={navigation} 
      />

      <FlatList
        data={nftsToDisplay}
        key={`grid-${cols}`}
        numColumns={cols}
        keyExtractor={(item) => item.token_id.toString()}
        contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 20, paddingBottom: 100 }}
        columnWrapperStyle={{ gap: 20 }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={activeTab === 'coleccion' ? "albums-outline" : "pricetag-outline"} size={48} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 15 }}>
              {activeTab === 'coleccion' ? 'La colección está vacía.' : 'No tiene relojes a la venta actualmente.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ width: Math.floor((contentW - (cols - 1) * 20) / cols), marginBottom: 20 }}>
            <PublicWatchCard nft={item} navigation={navigation} />
          </View>
        )}
      />
    </View>
  );
}