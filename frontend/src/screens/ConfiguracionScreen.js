import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/api';
import GlobalHeader from '../components/GlobalHeader';
import AlertModal, { useAlert } from '../components/AlertModal';
import { useTheme } from '../context/ThemeContext';
import { roleColors } from '../themes/styles';

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

export default function ConfiguracionScreen({ navigation }) {
  const { colors } = useTheme();
  const { alertProps, showAlert } = useAlert();

  const [loggedUser, setLoggedUser] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    location: '',
  });

  const [passForm, setPassForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/users/me');
        setLoggedUser(res.data);
        setForm({
          full_name: res.data.full_name || '',
          location:  res.data.location  || '',
        });
      } catch (e) {
        console.error('Error cargando perfil:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      showAlert('Guardado', 'Tu perfil se ha actualizado correctamente.', 'success');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo guardar el perfil.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passForm.current) {
      showAlert('Error', 'Introduce tu contraseña actual.', 'warning'); return;
    }
    if (passForm.next.length < 6) {
      showAlert('Error', 'La nueva contraseña debe tener al menos 6 caracteres.', 'warning'); return;
    }
    if (passForm.next !== passForm.confirm) {
      showAlert('Error', 'Las contraseñas nuevas no coinciden.', 'warning'); return;
    }
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  };

  const labelStyle = {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 7,
    textTransform: 'uppercase',
  };

  const readonlyInput = [inputStyle, { backgroundColor: colors.surface + '60', color: colors.textMuted }];

  const initials = (loggedUser?.username?.[0] || '?').toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        navigation={navigation}
        onWalletChange={setLoggedUser}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

        {/* Volver */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24, alignSelf: 'flex-start' }}
        >
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Volver</Text>
          </View>
        </TouchableOpacity>

        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>Configuración</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          Gestiona tu perfil y la seguridad de tu cuenta.
        </Text>

        {/* Tarjeta resumen de cuenta */}
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
            {loggedUser?.roles?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {loggedUser.roles.map(role => {
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

        {/* ── SECCIÓN 1: Datos personales ── */}
        <SectionCard title="Datos personales" icon="person-circle-outline" color={colors.primary}>

          <Text style={labelStyle}>Nombre de usuario</Text>
          <View style={[readonlyInput, { marginBottom: 5, justifyContent: 'center' }]}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>{loggedUser?.username}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 16 }}>
            El nombre de usuario no puede modificarse.
          </Text>

          <Text style={labelStyle}>Nombre completo</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 16 }]}
            value={form.full_name}
            onChangeText={t => setForm(f => ({ ...f, full_name: t }))}
            placeholder="Tu nombre y apellidos"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={labelStyle}>Correo electrónico</Text>
          <View style={[readonlyInput, { marginBottom: 5, justifyContent: 'center' }]}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>{loggedUser?.email}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 16 }}>
            El correo no puede cambiarse desde aquí.
          </Text>

          <Text style={labelStyle}>Ubicación</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 16 }]}
            value={form.location}
            onChangeText={t => setForm(f => ({ ...f, location: t }))}
            placeholder="Ciudad, país…"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={savingProfile}
            style={{
              marginTop: 8,
              backgroundColor: colors.primary,
              borderRadius: 12, paddingVertical: 13,
              alignItems: 'center', opacity: savingProfile ? 0.7 : 1,
            }}
          >
            {savingProfile
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar perfil</Text>
                </View>
              )}
          </TouchableOpacity>
        </SectionCard>

        {/* ── SECCIÓN 2: Contraseña ── */}
        <SectionCard title="Cambiar contraseña" icon="lock-closed-outline" color="#f59e0b">

          {[
            { label: 'Contraseña actual', key: 'current', show: showCurrent, setShow: setShowCurrent },
            { label: 'Nueva contraseña',  key: 'next',    show: showNext,    setShow: setShowNext    },
            { label: 'Confirmar nueva',   key: 'confirm', show: showConfirm, setShow: setShowConfirm },
          ].map(({ label, key, show, setShow }) => (
            <View key={key} style={{ marginBottom: 14 }}>
              <Text style={labelStyle}>{label}</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[inputStyle, { paddingRight: 44 }]}
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

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: '#f59e0b12', borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b30',
            padding: 10, marginBottom: 14,
          }}>
            <Ionicons name="information-circle-outline" size={15} color="#f59e0b" />
            <Text style={{ color: '#f59e0b', fontSize: 12, flex: 1 }}>
              Mínimo 6 caracteres. Combina letras y números para mayor seguridad.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleChangePassword}
            disabled={savingPassword}
            style={{
              backgroundColor: '#f59e0b',
              borderRadius: 12, paddingVertical: 13,
              alignItems: 'center', opacity: savingPassword ? 0.7 : 1,
            }}
          >
            {savingPassword
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="lock-closed-outline" size={17} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Actualizar contraseña</Text>
                </View>
              )}
          </TouchableOpacity>
        </SectionCard>

      </ScrollView>

      <AlertModal {...alertProps} />
    </View>
  );
}
