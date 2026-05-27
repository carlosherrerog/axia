import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Platform, Linking, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { CommonActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import api from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import AlertModal, { useAlert } from '../components/AlertModal';
import { useTheme } from '../context/ThemeContext';
import { roleColors } from '../themes/styles';

// ── Componentes locales ─────────────────────────────────────────────────────

function SectionCard({ title, icon, color, children }) {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 16, overflow: 'hidden',
    }}>
      <View style={{ height: 2, backgroundColor: color + '70' }} />
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: color + '18', borderWidth: 1, borderColor: color + '40',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={icon} size={17} color={color} />
          </View>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

function EditableRow({ icon, color, label, value, onChangeText, placeholder, isLast, readonly }) {
  const { colors } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: colors.border,
    }}>
      {icon ? (
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: (color || colors.primary) + '15',
          borderWidth: 1, borderColor: (color || colors.primary) + '30',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Ionicons name={icon} size={16} color={color || colors.primary} />
        </View>
      ) : null}
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', width: 90, flexShrink: 0 }}>
        {label}
      </Text>
      {readonly ? (
        <Text style={{ flex: 1, color: colors.textMuted, fontSize: 14, textAlign: 'right' }} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        <TextInput
          style={{
            flex: 1, color: colors.text, fontSize: 14, textAlign: 'right',
            ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
        />
      )}
    </View>
  );
}

function SettingRow({ icon, color, label, description, onPress, right, danger, isLast }) {
  const { colors } = useTheme();
  const textColor  = danger ? '#ef4444' : colors.text;
  const iconColor  = danger ? '#ef4444' : (color || colors.textSecondary);
  const Wrapper    = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 13,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      {icon ? (
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: iconColor + '15', borderWidth: 1, borderColor: iconColor + '30',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: textColor, fontWeight: '600', fontSize: 14 }}>{label}</Text>
        {description ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
            {description}
          </Text>
        ) : null}
      </View>
      {right !== undefined
        ? right
        : onPress
          ? <Ionicons name="chevron-forward" size={16} color={danger ? '#ef4444' : colors.textMuted} />
          : null}
    </Wrapper>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function ConfiguracionScreen({ navigation }) {
  const { colors } = useTheme();
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 900;
  const { alertProps, showAlert } = useAlert();

  const [loggedUser, setLoggedUser]         = useState(null);
  const [loading, setLoading]               = useState(true);
  const [savingProfile, setSavingProfile]   = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [form, setForm]         = useState({ full_name: '', location: '' });
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [passModal, setPassModal]         = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/users/me');
        setLoggedUser(res.data);
        setForm({ full_name: res.data.full_name || '', location: res.data.location || '' });
      } catch (e) {
        console.error('Error cargando perfil:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Perfil ──────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const fd = new FormData();
      fd.append('full_name', form.full_name.trim());
      fd.append('location',  form.location.trim());
      const res = await api.patch('/users/me', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLoggedUser(res.data);
      showAlert('Guardado', 'Tu perfil se ha actualizado.', 'success');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo guardar el perfil.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Contraseña ──────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!passForm.current) { showAlert('Error', 'Introduce tu contraseña actual.', 'warning'); return; }
    if (passForm.next.length < 6) { showAlert('Error', 'La nueva contraseña debe tener al menos 6 caracteres.', 'warning'); return; }
    if (passForm.next !== passForm.confirm) { showAlert('Error', 'Las contraseñas nuevas no coinciden.', 'warning'); return; }
    try {
      setSavingPassword(true);
      await api.post('/users/me/change-password', {
        current_password: passForm.current,
        new_password: passForm.next,
      });
      setPassForm({ current: '', next: '', confirm: '' });
      showAlert('Contraseña actualizada', 'Tu contraseña se ha cambiado correctamente.', 'success');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo cambiar la contraseña.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Cerrar sesión ───────────────────────────────────────────────────────

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('refreshToken');
      } else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userData');
      }
    } catch {}
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
  };

  // ── Eliminar cuenta ─────────────────────────────────────────────────────

  const handleDeleteAccount = async () => {
    try {
      setDeletingAccount(true);
      await api.delete('/users/me');
      await handleLogout();
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo eliminar la cuenta. Inténtalo más tarde.', 'error');
      setDeletingAccount(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const initials = (loggedUser?.username?.[0] || '?').toUpperCase();
  const hasWallet = !!loggedUser?.wallet_address;
  const userRoles = loggedUser?.roles || [];
  const availableRoles = ['DEALER', 'RELOJERO', 'FABRICANTE'].filter(r => !userRoles.includes(r));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        navigation={navigation}
        onWalletChange={setLoggedUser}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{
        padding: 20, paddingBottom: 100,
        maxWidth: isDesktop ? 1000 : undefined,
        alignSelf: 'center', width: '100%',
      }}>

        {/* Volver */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24, alignSelf: 'flex-start' }}
        >
          <View style={{
            backgroundColor: colors.surface, borderRadius: 10, padding: 8,
            borderWidth: 1, borderColor: colors.border,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Volver</Text>
          </View>
        </TouchableOpacity>

        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>Configuración</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          Gestiona tu cuenta y preferencias.
        </Text>

        {/* Resumen de cuenta */}
        <View style={{
          backgroundColor: colors.backgroundAlt,
          borderRadius: 16, borderWidth: 1, borderColor: colors.border,
          padding: 18, marginBottom: 20,
          flexDirection: 'row', alignItems: 'center', gap: 16,
        }}>
          <View style={{
            width: 58, height: 58, borderRadius: 29,
            backgroundColor: colors.primary + '20',
            borderWidth: 2, borderColor: colors.primary + '60',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
              {loggedUser?.username}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {loggedUser?.email}
            </Text>
            {userRoles.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {userRoles.map(role => {
                  const rc = roleColors[role] || colors.primary;
                  return (
                    <View key={role} style={{
                      backgroundColor: rc + '18', borderRadius: 20,
                      paddingHorizontal: 8, paddingVertical: 2,
                      borderWidth: 1, borderColor: rc + '40',
                    }}>
                      <Text style={{ color: rc, fontSize: 10, fontWeight: '700' }}>{role}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* ── Datos personales ── */}
        <SectionCard title="Datos personales" icon="person-circle-outline" color={colors.primary}>
          <EditableRow icon="at-outline"        color={colors.primary} label="Usuario"  value={loggedUser?.username} readonly />
          <EditableRow icon="mail-outline"      color={colors.primary} label="Correo"   value={loggedUser?.email}    readonly />
          <EditableRow
            icon="person-outline" color={colors.primary} label="Nombre"
            value={form.full_name} onChangeText={t => setForm(f => ({ ...f, full_name: t }))}
            placeholder="Tu nombre y apellidos"
          />
          <EditableRow
            icon="location-outline" color={colors.primary} label="Ubicación"
            value={form.location} onChangeText={t => setForm(f => ({ ...f, location: t }))}
            placeholder="Ciudad, país…" isLast
          />
          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={savingProfile}
            style={{
              marginTop: 16, backgroundColor: colors.primary,
              borderRadius: 12, paddingVertical: 12,
              alignItems: 'center', opacity: savingProfile ? 0.7 : 1,
            }}
          >
            {savingProfile
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Guardar cambios</Text>}
          </TouchableOpacity>
        </SectionCard>

        {/* ── Seguridad ── */}
        <SectionCard title="Seguridad" icon="lock-closed-outline" color="#f59e0b">
          <SettingRow
            icon="key-outline" color="#f59e0b"
            label="Cambiar contraseña"
            description="Actualiza tu contraseña de acceso."
            isLast onPress={() => setPassModal(true)}
          />
        </SectionCard>

        {/* ── Wallet ── */}
        <SectionCard title="Wallet" icon="wallet-outline" color="#10b981">
          {hasWallet ? (
            <SettingRow
              icon="checkmark-circle-outline"
              color="#10b981"
              label="Wallet conectada"
              description={loggedUser.wallet_address}
              isLast
              onPress={async () => {
                await Clipboard.setStringAsync(loggedUser.wallet_address);
                showAlert('Copiado', 'Dirección de wallet copiada al portapapeles.', 'success');
              }}
            />
          ) : (
            <>
              <View style={{
                flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                backgroundColor: '#f59e0b10', borderRadius: 12,
                borderWidth: 1, borderColor: '#f59e0b30',
                padding: 14, marginBottom: 12,
              }}>
                <Ionicons name="information-circle-outline" size={17} color="#f59e0b" style={{ marginTop: 1 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 19 }}>
                  Sin wallet no podrás comprar, vender ni pujar en subastas. Los relojes están vinculados a wallets en la blockchain de Polygon.
                </Text>
              </View>
              <SettingRow
                icon="open-outline"
                color="#10b981"
                label="Descargar MetaMask (recomendada)"
                description="Obtén la wallet oficial para interactuar con la blockchain."
                isLast
                onPress={() => Linking.openURL('https://metamask.io/download/')}
              />
            </>
          )}
        </SectionCard>

        {/* ── Rol profesional (solo si hay roles disponibles) ── */}
        {availableRoles.length > 0 && (
          <SectionCard title="Rol profesional" icon="briefcase-outline" color="#8b5cf6">
            <SettingRow
              icon="add-circle-outline"
              color="#8b5cf6"
              label="Solicitar rol"
              description="Accede a funciones avanzadas: Dealer, Relojero o Fabricante."
              isLast
              onPress={() => navigation.navigate('ProfessionalRequest')}
            />
          </SectionCard>
        )}

        {/* ── Sesión ── */}
        <SectionCard title="Sesión" icon="power-outline" color="#ef4444">
          <SettingRow
            icon="log-out-outline"
            color="#f59e0b"
            label="Cerrar sesión"
            description="Salir de tu cuenta en este dispositivo."
            onPress={() => setConfirmDialog({
              type: 'warning',
              title: 'Cerrar sesión',
              message: '¿Quieres cerrar tu sesión en este dispositivo?',
              confirmLabel: 'Cerrar sesión',
              onConfirm: handleLogout,
            })}
          />
          <SettingRow
            icon="trash-outline"
            label="Eliminar cuenta"
            description="Elimina permanentemente tu cuenta de AXIA."
            danger
            isLast
            onPress={() => setConfirmDialog({
              type: 'error',
              title: 'Eliminar cuenta',
              message:
                '¿Estás seguro de que quieres eliminar tu cuenta?\n\n' +
                '• Tus datos e historial en AXIA se eliminarán permanentemente.\n\n' +
                '• Tus relojes seguirán vinculados a tu wallet en la blockchain de Polygon — siguen siendo tuyos.\n\n' +
                '• Esta acción no se puede deshacer.',
              confirmLabel: deletingAccount ? 'Eliminando...' : 'Sí, eliminar cuenta',
              onConfirm: handleDeleteAccount,
            })}
          />
        </SectionCard>

      </ScrollView>

      {/* Modal cambiar contraseña */}
      <Modal visible={passModal} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 24, padding: 28,
            width: '88%', maxWidth: 380, borderWidth: 1, borderColor: colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Ionicons name="lock-closed-outline" size={20} color="#f59e0b" />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>Cambiar contraseña</Text>
            </View>

            {[
              { label: 'Contraseña actual', key: 'current', show: showCurrent, setShow: setShowCurrent },
              { label: 'Nueva contraseña',  key: 'next',    show: showNext,    setShow: setShowNext    },
              { label: 'Confirmar nueva',   key: 'confirm', show: showConfirm, setShow: setShowConfirm },
            ].map(({ label, key, show, setShow }, i, arr) => (
              <View key={key} style={{ marginBottom: i < arr.length - 1 ? 12 : 16 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                  {label}
                </Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      backgroundColor: colors.surface, color: colors.text,
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, borderWidth: 1, borderColor: colors.border,
                      paddingRight: 44,
                      ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                    }}
                    value={passForm[key]}
                    onChangeText={t => setPassForm(f => ({ ...f, [key]: t }))}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!show}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShow(v => !v)}
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  >
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={async () => {
                await handleChangePassword();
                if (!savingPassword) setPassModal(false);
              }}
              disabled={savingPassword}
              style={{
                backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 13,
                alignItems: 'center', marginBottom: 10, opacity: savingPassword ? 0.7 : 1,
              }}
            >
              {savingPassword
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Actualizar contraseña</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPassModal(false); setPassForm({ current: '', next: '', confirm: '' }); }}
              style={{
                paddingVertical: 12, borderRadius: 12,
                backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Diálogo de confirmación (cerrar sesión / eliminar cuenta) */}
      {confirmDialog && (
        <AlertModal
          visible={true}
          type={confirmDialog.type}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={() => { setConfirmDialog(null); confirmDialog.onConfirm(); }}
          cancelLabel="Cancelar"
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      <AlertModal {...alertProps} />
    </View>
  );
}
