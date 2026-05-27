import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  TouchableOpacity, Modal, Platform, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api, { getToken, WS_URL } from '../api/api.js';
import GlobalHeader from '../components/GlobalHeader';
import NotificationCard from '../components/NotificationCard';
import { globalStyles } from '../themes/styles.js';
import { useTheme } from '../context/ThemeContext';


export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const hPad = width >= 768 ? Math.max(24, Math.floor((width - 1000) / 2)) : 16;

  const [loggedUser, setLoggedUser]       = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title, message, type = 'info') => setAlert({ visible: true, title, message, type });
  const hideAlert = () => setAlert(a => ({ ...a, visible: false }));

  const fetchData = useCallback(async () => {
    try {
      const [userRes, notifRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/notifications'),
      ]);
      setLoggedUser(userRes.data);
      setNotifications(notifRes.data.map(n => ({
        ...n,
        date: new Date(n.created_at).toLocaleDateString('es-ES'),
      })));
    } catch (e) {
      console.error('Error cargando notificaciones:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    if (!loggedUser?.id) return;
    let ws;
    getToken().then(token => {
      ws = new WebSocket(`${WS_URL}/ws/${loggedUser.id}?token=${token}`);
      ws.onmessage = (e) => { if (e.data === 'update_users') fetchData(); };
    });
    return () => ws?.close();
  }, [loggedUser?.id, fetchData]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { showAlert('Error', 'No se pudo borrar el mensaje.', 'error'); }
  };

  const handleClearAll = async () => {
    try {
      await Promise.all(notifications.map(n => api.delete(`/notifications/${n.id}`)));
      setNotifications([]);
    } catch { showAlert('Error', 'No se pudieron borrar todas las notificaciones.', 'error'); }
  };

  const handleNotificationAction = (notification) => {
    if (notification.type === 'WATCH_ASSIGNED') {
      navigation.navigate('Perfil');
      return;
    }
    if (['SALE', 'SHIPPING', 'VERIFIED', 'SECURITY', 'AUCTION'].includes(notification.type)) {
      if (notification.reference_id) {
        navigation.navigate('SaleScreen', {
          listingId: notification.reference_id,
          tokenId: notification.watch_id || undefined,
        });
      }
      return;
    }
  };

  // Agrupar notificaciones: hoy / esta semana / anteriores
  const groupNotifications = (list) => {
    const now   = Date.now();
    const day   = 86400000;
    const today = [], week = [], older = [];
    list.forEach(n => {
      const diff = now - new Date(n.created_at).getTime();
      if (diff < day)      today.push(n);
      else if (diff < 7 * day) week.push(n);
      else                 older.push(n);
    });
    return [
      { title: 'Hoy',             data: today },
      { title: 'Esta semana',     data: week  },
      { title: 'Anteriores',      data: older },
    ].filter(g => g.data.length > 0);
  };

  const groups = groupNotifications(notifications);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        title="Notificaciones"
        loggedUser={loggedUser}
        navigation={navigation}
        unreadCount={notifications.length}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}>
        {/* Barra de acciones */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: hPad, paddingTop: 18, paddingBottom: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Marketplace')}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.border,
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <Ionicons name="arrow-back" size={16} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
              Actividad
            </Text>
            {notifications.length > 0 && (
              <View style={{
                backgroundColor: colors.primary, borderRadius: 10,
                paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                  {notifications.length}
                </Text>
              </View>
            )}
          </View>

          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={handleClearAll}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 10, paddingVertical: 6,
                backgroundColor: colors.surface,
                borderRadius: 8, borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Borrar todo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lista agrupada */}
        {notifications.length === 0 ? (
          <View style={{
            flex: 1, justifyContent: 'center', alignItems: 'center',
            paddingVertical: 72, paddingHorizontal: 32,
          }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border,
              justifyContent: 'center', alignItems: 'center', marginBottom: 18,
            }}>
              <Ionicons name="mail-open-outline" size={32} color={colors.textMuted} />
            </View>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16, marginBottom: 6, textAlign: 'center' }}>
              Sin notificaciones
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Aquí aparecerán las actualizaciones sobre tus compras, ventas y solicitudes.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: hPad }}>
            {groups.map(group => (
              <View key={group.title} style={{ marginBottom: 24 }}>
                {/* Encabezado de grupo */}
                <Text style={{
                  color: colors.textMuted, fontSize: 11, fontWeight: '700',
                  letterSpacing: 0.8, textTransform: 'uppercase',
                  marginBottom: 10, marginLeft: 2,
                }}>
                  {group.title}
                </Text>
                {group.data.map(item => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    onAction={handleNotificationAction}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
        </View>
      </ScrollView>


      {/* Modal de alertas */}
      <Modal visible={alert.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 20, padding: 28, width: '85%', maxWidth: 340,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
          }}>
            {alert.type === 'error'   && <Ionicons name="close-circle"       size={52} color="#ef4444" />}
            {alert.type === 'warning' && <Ionicons name="warning"             size={52} color="#f59e0b" />}
            {alert.type === 'success' && <Ionicons name="checkmark-circle"   size={52} color="#10b981" />}
            {alert.type === 'info'    && <Ionicons name="information-circle" size={52} color={colors.primary} />}
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginTop: 14, marginBottom: 8, textAlign: 'center' }}>
              {alert.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 22, lineHeight: 20 }}>
              {alert.message}
            </Text>
            <TouchableOpacity
              onPress={hideAlert}
              style={[globalStyles.primaryButton, { width: '100%', backgroundColor: colors.primary }]}
            >
              <Text style={globalStyles.buttonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
