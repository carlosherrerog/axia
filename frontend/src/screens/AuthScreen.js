import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Platform, Modal, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import api from '../api/api.js';
import { useTheme } from '../context/ThemeContext';

// Campo de formulario 
const Field = React.forwardRef(function Field({
  colors, icon, label, placeholder, value, onChangeText,
  secureTextEntry, keyboardType, autoCapitalize = 'none',
  autoComplete, textContentType, error, rightElement,
  returnKeyType, onSubmitEditing, blurOnSubmit,
}, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      {label && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6, marginLeft: 2 }}>
          {label}
        </Text>
      )}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.backgroundAlt,
        borderRadius: 14,
        borderWidth: focused ? 1.5 : 1,
        borderColor: error ? '#ef4444' : focused ? colors.primary : colors.border,
        overflow: 'hidden',
        ...(Platform.OS === 'web' && focused && !error && {
          boxShadow: `0 0 0 3px ${colors.primary}22`,
        }),
      }}>
        <View style={{ width: 44, alignItems: 'center' }}>
          <Ionicons name={icon} size={17} color={error ? '#ef4444' : focused ? colors.primary : colors.textMuted} />
        </View>
        <TextInput
          ref={ref}
          style={{
            flex: 1,
            paddingVertical: 13,
            paddingRight: rightElement ? 0 : 14,
            fontSize: 15,
            color: colors.text,
            ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightElement}
      </View>
      {error && (
        <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 5, marginLeft: 4 }}>{error}</Text>
      )}
    </View>
  );
});

// Marca AXIA
function Brand({ colors, subtitle }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 36 }}>
      <Image
        source={require('../../assets/axia-icons/axia-logo-transparent.svg')}
        style={{
          width: 300, height: 180, marginBottom: 16,
          ...(Platform.OS === 'web' && { filter: 'drop-shadow(0 0 20px rgba(139,92,246,0.35))' }),
        }}
        resizeMode="contain"
      />
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{subtitle}</Text>
    </View>
  );
}

// Formulario de login (componente de nivel superior para evitar re-mount) 
function LoginForm({
  colors, isDark,
  loginId, setLoginId,
  loginPwd, setLoginPwd,
  showLoginPwd, setShowLoginPwd,
  loading, onSubmit, onForgot, onGoRegister,
}) {
  const pwdRef = useRef(null);

  const eyeBtn = (
    <TouchableOpacity onPress={() => setShowLoginPwd(v => !v)} style={{ paddingHorizontal: 13, paddingVertical: 13 }}>
      <Ionicons name={showLoginPwd ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View>
      <Brand colors={colors} isDark={isDark} subtitle="Bienvenido de nuevo" />

      <Field
        colors={colors}
        icon="person-outline"
        label="Usuario o correo"
        placeholder="tu@email.com"
        value={loginId}
        onChangeText={setLoginId}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => pwdRef.current?.focus()}
      />

      <Field
        ref={pwdRef}
        colors={colors}
        icon="lock-closed-outline"
        label="Contraseña"
        placeholder="••••••••"
        value={loginPwd}
        onChangeText={setLoginPwd}
        secureTextEntry={!showLoginPwd}
        autoComplete="current-password"
        textContentType="password"
        rightElement={eyeBtn}
        returnKeyType="go"
        blurOnSubmit={true}
        onSubmitEditing={onSubmit}
      />

      <TouchableOpacity
        onPress={onForgot}
        style={{ alignSelf: 'flex-end', marginTop: -4, marginBottom: 24 }}
      >
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
          ¿Olvidaste tu contraseña?
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onSubmit}
        disabled={loading}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 24, paddingVertical: 15,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
          ...(Platform.OS === 'web' && { boxShadow: `0 4px 18px ${colors.primary}45` }),
        }}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }}>Iniciar sesión</Text>
        }
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 32, gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>¿Primera vez?</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <TouchableOpacity
        onPress={onGoRegister}
        style={{
          marginTop: 16, paddingVertical: 14,
          borderRadius: 24, alignItems: 'center',
          borderWidth: 1.5, borderColor: colors.border,
          backgroundColor: 'transparent',
        }}
      >
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
          Crear una cuenta
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Indicador de requisito de contraseña 
function PwdRule({ ok, label, colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={13}
        color={ok ? '#10b981' : colors.textMuted}
      />
      <Text style={{ fontSize: 12, color: ok ? '#10b981' : colors.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

// Formulario de registro (componente de nivel superior) 
function RegisterForm({
  colors,
  firstName, setFirstName,
  lastName, setLastName,
  regUser, setRegUser, usernameError, handleUsernameChange,
  regEmail, setRegEmail,
  regPwd, setRegPwd, pwdError,
  showRegPwd, setShowRegPwd,
  loading, onSubmit, onGoLogin,
}) {
  // Indicador dinámico de requisitos de contraseña
  const lastNameRef = useRef(null);
  const usernameRef = useRef(null);
  const emailRef    = useRef(null);
  const pwdRef      = useRef(null);

  const specialCount = (regPwd.match(/[^a-zA-Z0-9]/g) || []).length;
  const hasEnoughChars   = regPwd.length >= 6;
  const hasOneSpecial    = specialCount === 1;
  const eyeBtn = (
    <TouchableOpacity onPress={() => setShowRegPwd(v => !v)} style={{ paddingHorizontal: 13, paddingVertical: 13 }}>
      <Ionicons name={showRegPwd ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
        <TouchableOpacity
          onPress={onGoLogin}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1, borderColor: colors.border,
            justifyContent: 'center', alignItems: 'center',
            marginRight: 14,
          }}
        >
          <Ionicons name="arrow-back" size={17} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>
            Crear cuenta
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>
            El valor no se falsifica.
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field
            colors={colors}
            icon="person-outline"
            label="Nombre"
            placeholder="Nombre"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => lastNameRef.current?.focus()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            colors={colors}
            icon="person-outline"
            label="Apellidos"
            placeholder="Apellidos"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            ref={lastNameRef}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => usernameRef.current?.focus()}
          />
        </View>
      </View>

      <Field
        colors={colors}
        icon="at-outline"
        label="Nombre de usuario"
        placeholder="nombre_usuario"
        value={regUser}
        onChangeText={handleUsernameChange}
        autoComplete="username"
        textContentType="username"
        error={usernameError}
        ref={usernameRef}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
      />

      <Field
        colors={colors}
        icon="mail-outline"
        label="Correo electrónico"
        placeholder="correo@gmail.com"
        value={regEmail}
        onChangeText={setRegEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        ref={emailRef}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => pwdRef.current?.focus()}
      />

      <Field
        colors={colors}
        icon="lock-closed-outline"
        label="Contraseña"
        placeholder="Mínimo 6 caracteres"
        value={regPwd}
        onChangeText={setRegPwd}
        secureTextEntry={!showRegPwd}
        autoComplete="new-password"
        textContentType="newPassword"
        rightElement={eyeBtn}
        error={pwdError}
        ref={pwdRef}
        returnKeyType="go"
        blurOnSubmit={true}
        onSubmitEditing={onSubmit}
      />

      {/* Requisitos de contraseña */}
      {regPwd.length > 0 && (
        <View style={{ marginTop: -8, marginBottom: 14, gap: 4 }}>
          <PwdRule ok={hasEnoughChars} colors={colors} label="Mínimo 6 caracteres" />
          <PwdRule ok={hasOneSpecial}  colors={colors} label="Exactamente 1 carácter especial (!@#$%…)" />
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 20, lineHeight: 17 }}>
        Al registrarte aceptas que tus transacciones se realizarán en la blockchain de Polygon mediante contratos inteligentes auditados.
      </Text>

      <TouchableOpacity
        onPress={onSubmit}
        disabled={loading}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 24, paddingVertical: 15,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
          ...(Platform.OS === 'web' && { boxShadow: `0 4px 18px ${colors.primary}45` }),
        }}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }}>Crear cuenta</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onGoLogin}
        style={{ marginTop: 20, alignSelf: 'center' }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          ¿Ya tienes cuenta?{' '}
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Inicia sesión</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Pantalla principal 
export default function AuthScreen({ navigation }) {
  const { colors } = useTheme();
  const isDark = true;

  const [mode, setMode] = useState('login');

  // Estado login
  const [loginId, setLoginId]         = useState('');
  const [loginPwd, setLoginPwd]       = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // Estado registro
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [regUser, setRegUser]             = useState('');
  const [regEmail, setRegEmail]           = useState('');
  const [regPwd, setRegPwd]               = useState('');
  const [showRegPwd, setShowRegPwd]       = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [pwdError, setPwdError]           = useState('');

  const [loading, setLoading] = useState(false);

  // Recuperar contraseña
  const [forgotVisible, setForgotVisible]     = useState(false);
  const [recoveryEmail, setRecoveryEmail]     = useState('');
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [resetVisible, setResetVisible]       = useState(false);
  const [resetCode, setResetCode]             = useState('');
  const [newPwd, setNewPwd]                   = useState('');
  const [confirmPwd, setConfirmPwd]           = useState('');
  const [resetLoading, setResetLoading]       = useState(false);

  // Alerta
  const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
  const showAlert = (title, message, type = 'info') => setAlert({ visible: true, title, message, type });
  const hideAlert = () => setAlert(a => ({ ...a, visible: false }));

  const handleUsernameChange = (t) => {
    const clean = t.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setRegUser(clean);
    setUsernameError(clean !== t ? 'Solo minúsculas, números y guión bajo' : '');
  };

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.post('/login', { identifier: loginId.trim(), password: loginPwd });
        const { access_token, refresh_token, user: u } = res.data;
        if (access_token) {
          if (Platform.OS === 'web') {
            localStorage.setItem('userToken', access_token);
            localStorage.setItem('refreshToken', refresh_token);
            localStorage.setItem('userData', JSON.stringify(u));
          } else {
            await SecureStore.setItemAsync('userToken', access_token);
            await SecureStore.setItemAsync('refreshToken', refresh_token);
            await SecureStore.setItemAsync('userData', JSON.stringify(u));
          }
        }
        if (u.is_admin)                                                   navigation.replace('Admin', { user: u });
        else if (u.roles?.includes('RELOJERO'))                           navigation.replace('WatchmakerDashboard', { user: u });
        else if (u.roles?.includes('FABRICANTE'))                         navigation.replace('ManufacturerDashboard', { user: u });
        else if (u.roles?.includes('DEALER') || u.roles?.includes('PARTICULAR')) navigation.replace('UserDashboard', { user: u });
        else                                                               navigation.replace('RoleSelection', { user: u });
      } else {
        // Validación local de contraseña
        const specialCount = (regPwd.match(/[^a-zA-Z0-9]/g) || []).length;
        if (regPwd.length < 6) {
          setPwdError('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }
        if (specialCount === 0) {
          setPwdError('La contraseña debe incluir exactamente 1 carácter especial (!@#$%…).');
          setLoading(false);
          return;
        }
        if (specialCount > 1) {
          setPwdError('La contraseña solo puede tener 1 carácter especial (!@#$%…).');
          setLoading(false);
          return;
        }
        setPwdError('');

        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim().toUpperCase();
        await api.post('/register', {
          full_name: fullName,
          username: regUser,
          email: regEmail.toLowerCase().trim(),
          password: regPwd,
        });
        showAlert('¡Cuenta creada!', 'Te hemos enviado un correo de verificación. Confírmalo para poder iniciar sesión.', 'success');
        setRegUser(''); setRegEmail(''); setRegPwd(''); setFirstName(''); setLastName(''); setPwdError('');
        setMode('login');
      }
    } catch (err) {
      let msg = 'Error de conexión con el servidor';
      if (err.response?.data) {
        const detail = err.response.data.detail;
        const raw    = Array.isArray(detail) ? detail[0].msg : detail;
        const status = err.response.status;
        if (String(raw).includes('valid email') || String(raw).includes('@-sign'))
          msg = 'La dirección de correo no es válida.';
        else if (String(raw).toLowerCase().includes('already registered') || String(raw).includes('ya existe'))
          msg = 'Ya existe una cuenta con este correo o nombre de usuario.';
        else if (status === 403) msg = 'Verifica tu correo antes de iniciar sesión.';
        else if (status === 401) msg = 'Usuario o contraseña incorrectos.';
        else msg = raw;
      }
      showAlert(mode === 'login' ? 'Error al iniciar sesión' : 'Error en el registro', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!recoveryEmail.trim()) { showAlert('Atención', 'Introduce tu correo.', 'warning'); return; }
    setSendingRecovery(true);
    try {
      await api.post('/forgot-password', { email: recoveryEmail.toLowerCase().trim() });
      setForgotVisible(false); setRecoveryEmail(''); setResetVisible(true);
      showAlert('Código enviado', 'Si el correo está registrado recibirás un código en breve.', 'success');
    } catch { showAlert('Error', 'No se pudo procesar la solicitud.', 'error'); }
    finally { setSendingRecovery(false); }
  };

  const handleResetPassword = async () => {
    if (!resetCode || !newPwd || !confirmPwd) { showAlert('Campos vacíos', 'Rellena todos los campos.', 'warning'); return; }
    if (newPwd !== confirmPwd) { showAlert('Error', 'Las contraseñas no coinciden.', 'error'); return; }
    setResetLoading(true);
    try {
      await api.post('/reset-password', { token: resetCode.trim(), new_password: newPwd });
      setResetVisible(false); setResetCode(''); setNewPwd(''); setConfirmPwd('');
      showAlert('¡Listo!', 'Contraseña actualizada correctamente.', 'success');
    } catch { showAlert('Error', 'El código es inválido o ha caducado.', 'error'); }
    finally { setResetLoading(false); }
  };

  const Glow = ({ top, left, right, bottom, size, opacity }) => (
    Platform.OS === 'web' ? (
      <View pointerEvents="none" style={{
        position: 'absolute', top, left, right, bottom,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: colors.primary, opacity,
        filter: 'blur(70px)',
      }} />
    ) : null
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      <Glow top={-100} left="30%" size={400} opacity={isDark ? 0.10 : 0.05} />
      <Glow bottom={-60} right="5%" size={280} opacity={isDark ? 0.06 : 0.03} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1, justifyContent: 'center', alignItems: 'center',
          paddingHorizontal: 24, paddingVertical: 56, paddingBottom: 100,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 400 }}>
          {mode === 'login' ? (
            <LoginForm
              colors={colors}
              isDark={isDark}
              loginId={loginId}
              setLoginId={setLoginId}
              loginPwd={loginPwd}
              setLoginPwd={setLoginPwd}
              showLoginPwd={showLoginPwd}
              setShowLoginPwd={setShowLoginPwd}
              loading={loading}
              onSubmit={handleAuth}
              onForgot={() => setForgotVisible(true)}
              onGoRegister={() => setMode('register')}
            />
          ) : (
            <RegisterForm
              colors={colors}
              firstName={firstName}
              setFirstName={setFirstName}
              lastName={lastName}
              setLastName={setLastName}
              regUser={regUser}
              setRegUser={setRegUser}
              usernameError={usernameError}
              handleUsernameChange={handleUsernameChange}
              regEmail={regEmail}
              setRegEmail={setRegEmail}
              regPwd={regPwd}
              setRegPwd={setRegPwd}
              pwdError={pwdError}
              showRegPwd={showRegPwd}
              setShowRegPwd={setShowRegPwd}
              loading={loading}
              onSubmit={handleAuth}
              onGoLogin={() => setMode('login')}
            />
          )}
        </View>
      </ScrollView>

      {/* Modal recuperar contraseña */}
      <Modal visible={forgotVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 28,
            padding: 28, width: '88%', maxWidth: 360,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
          }}>
            <View style={{
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: `${colors.primary}18`, borderWidth: 1, borderColor: `${colors.primary}30`,
              justifyContent: 'center', alignItems: 'center', marginBottom: 16,
            }}>
              <Ionicons name="mail-outline" size={23} color={colors.primary} />
            </View>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginBottom: 6, textAlign: 'center' }}>
              Recuperar contraseña
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 22, lineHeight: 19 }}>
              Recibirás un código de seguridad en tu correo.
            </Text>
            <Field
              colors={colors}
              icon="mail-outline"
              placeholder="tu@email.com"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setForgotVisible(false)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center',
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={sendingRecovery}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center', backgroundColor: colors.primary }}
              >
                {sendingRecovery
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Enviar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal nueva contraseña */}
      <Modal visible={resetVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 28,
            padding: 28, width: '88%', maxWidth: 360,
            alignItems: 'stretch', borderWidth: 1, borderColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginBottom: 4, textAlign: 'center' }}>
              Nueva contraseña
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 19 }}>
              Pega el código recibido y elige una nueva clave.
            </Text>
            <Field colors={colors} icon="barcode-outline"    placeholder="Código del correo"  value={resetCode}   onChangeText={setResetCode}   autoComplete="one-time-code" />
            <Field colors={colors} icon="lock-closed-outline" placeholder="Nueva contraseña"  value={newPwd}      onChangeText={setNewPwd}      secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <Field colors={colors} icon="lock-closed-outline" placeholder="Repetir contraseña" value={confirmPwd} onChangeText={setConfirmPwd}  secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setResetVisible(false)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center',
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={resetLoading}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center', backgroundColor: colors.primary }}
              >
                {resetLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Actualizar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal alertas */}
      <Modal visible={alert.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 28,
            padding: 28, width: '88%', maxWidth: 340,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
          }}>
            {alert.type === 'error'   && <Ionicons name="close-circle"       size={50} color="#ef4444" />}
            {alert.type === 'warning' && <Ionicons name="warning"             size={50} color="#f59e0b" />}
            {alert.type === 'success' && <Ionicons name="checkmark-circle"   size={50} color="#10b981" />}
            {alert.type === 'info'    && <Ionicons name="information-circle" size={50} color={colors.primary} />}
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17, marginTop: 14, marginBottom: 8, textAlign: 'center' }}>
              {alert.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 22, lineHeight: 20 }}>
              {alert.message}
            </Text>
            <TouchableOpacity
              onPress={hideAlert}
              style={{
                width: '100%', paddingVertical: 14, borderRadius: 24,
                backgroundColor: colors.primary, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
