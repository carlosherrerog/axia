import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Animated, Platform, useWindowDimensions, Image, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import GlobalHeader from '../components/GlobalHeader';
import api from '../api/api';

// Tarjetas principales — contenido resumido, siempre visible
const FEATURE_DATA = [
  {
    id: 'que-es',
    icon: 'diamond',
    color: '#8b5cf6',
    title: '¿Qué es AXIA?',
    content: [
      { type: 'etymology' },
      { type: 'paragraph', text: 'Ecosistema blockchain para la autenticación y comercio seguro de relojes de lujo. Cada pieza está vinculada a un NFT en Polygon con historial de propiedad inmutable.' },
      { type: 'highlight', icon: 'shield-checkmark', text: 'Nadie puede falsificar ni borrar el historial. Ni siquiera AXIA.' },
    ],
  },
  {
    id: 'roles',
    icon: 'people',
    color: '#06b6d4',
    title: 'Roles de usuario',
    content: [
      { type: 'role', icon: 'person',    color: '#a78bfa', label: 'Particular',  text: 'Compra y vende con peritaje obligatorio y fianza del 2% como garantía de autenticidad.' },
      { type: 'role', icon: 'storefront', color: '#10b981', label: 'Dealer',     text: 'Profesional verificado. Sin fianza, envío automático en blockchain, acceso exclusivo a subastas.' },
      { type: 'role', icon: 'build',     color: '#f59e0b', label: 'Relojero',   text: 'Certifica la autenticidad en ventas P2P. Cobra comisión del 2% por peritaje.' },
      { type: 'role', icon: 'construct', color: '#ec4899', label: 'Fabricante', text: 'Emite los NFTs en fabricación. Recibe regalías automáticas del 1% en cada reventa.' },
    ],
  },
  {
    id: 'marketplace',
    icon: 'storefront',
    color: '#10b981',
    title: 'Marketplace',
    content: [
      { type: 'flow', icon: 'flash', color: '#10b981', label: 'Dealer → Comprador', text: 'Sin peritaje ni fianza. El sistema confirma el envío automáticamente en blockchain.' },
      { type: 'flow', icon: 'shield-half', color: '#f59e0b', label: 'Particular → Comprador', text: 'Peritaje por relojero asignado y fianza del 2%. Si el reloj es falso, la venta se cancela automáticamente.' },
      { type: 'highlight', icon: 'lock-closed', text: 'El dinero nunca va al vendedor hasta que el comprador confirma la recepción del reloj.' },
    ],
  },
  {
    id: 'subastas',
    icon: 'hammer',
    color: '#f59e0b',
    title: 'Sistema de subastas',
    content: [
      { type: 'paragraph', text: 'Exclusivo para Dealers. Precio mínimo de salida y pujas en USDC durante un tiempo determinado.' },
      { type: 'steps', items: [
        'El Dealer fija precio mínimo y duración.',
        'Cualquier usuario con wallet conectada puede pujar.',
        'Si te superan, tu USDC vuelve automáticamente a tu balance.',
        'Al cerrar, el NFT y el pago se transfieren en una sola transacción blockchain.',
      ]},
      { type: 'highlight', icon: 'wallet', text: 'Necesitas MetaMask conectado para pujar. Hazlo desde el header.' },
    ],
  },
];

// Secciones técnicas — acordeones desplegables
const TECH_SECTIONS = [
  {
    id: 'coleccion',
    icon: 'albums',
    color: '#8b5cf6',
    title: 'Tu colección digital',
    content: [
      { type: 'subtitle', text: 'Importar un reloj' },
      { type: 'paragraph', text: 'Si tienes un reloj cuyo NFT está en tu wallet, puedes importarlo a AXIA. El sistema sincroniza automáticamente los metadatos y reconstruye el historial completo desde la blockchain.' },
      { type: 'subtitle', text: 'Ocultar un reloj' },
      { type: 'paragraph', text: 'Puedes ocultar cualquier reloj de tu colección. Esto elimina los datos locales, pero al volver a importarlo todo se recupera íntegramente. No se pierde ninguna información.' },
      { type: 'subtitle', text: 'Visibilidad pública' },
      { type: 'paragraph', text: 'Cada reloj puede configurarse como público o privado. Los públicos aparecen en los perfiles públicos y en el marketplace cuando están listados.' },
      { type: 'highlight', icon: 'link', text: 'El historial de propiedad se lee directamente de los eventos de la blockchain: es inmutable y no puede ser alterado por nadie, ni por AXIA.' },
    ],
  },
  {
    id: 'wallet',
    icon: 'wallet',
    color: '#38bdf8',
    title: 'Wallet y blockchain',
    content: [
      { type: 'paragraph', text: 'Una wallet (cartera digital) es tu identidad en la blockchain. En AXIA usamos MetaMask, la extensión de navegador más extendida, compatible con la red Polygon.' },
      { type: 'subtitle', text: 'Conectar tu wallet' },
      { type: 'steps', items: [
        'Instala MetaMask como extensión en tu navegador.',
        'Pulsa "Conectar wallet" en el header de la aplicación.',
        'MetaMask te pedirá que firmes un mensaje para verificar tu identidad.',
        'Una vez vinculada, tu dirección aparece en el header en verde.',
      ]},
      { type: 'highlight', icon: 'information-circle', text: 'AXIA nunca accede a tus fondos directamente. Solo lees y firmas transacciones que tú previamente apruebas en MetaMask.' },
    ],
  },
  {
    id: 'nfc',
    icon: 'radio',
    color: '#06b6d4',
    title: 'Tarjeta NFC · NTAG424 DNA',
    content: [
      { type: 'paragraph', text: 'Cada reloj registrado en AXIA puede llevar una tarjeta NFC NTAG424 DNA, un chip criptográfico que actúa como puente físico entre el reloj y su gemelo digital en la blockchain.' },
      { type: 'highlight', icon: 'shield-checkmark', text: 'El NTAG424 DNA genera un código único (CMAC) en cada lectura, imposible de clonar. Es la misma tecnología de los pasaportes biométricos.' },
      { type: 'subtitle', text: 'Cómo escanear la tarjeta' },
      { type: 'steps', items: [
        'Abre AXIA en tu móvil con NFC activado.',
        'Navega a la ficha del reloj que quieres verificar.',
        'Pulsa "Escanear NFC" y acerca tu móvil a la tarjeta del reloj.',
        'La app compara el UID criptográfico del chip con el registrado en el NFT.',
        'Si coincide verás ✓ Autenticado. Si no, el sistema alerta de posible falsificación.',
      ]},
      { type: 'role', icon: 'checkmark-circle', color: '#10b981', label: 'UID vinculado al NFT', text: 'El identificador único del chip está grabado en el contrato inteligente al momento del minteo. No puede modificarse.' },
      { type: 'role', icon: 'finger-print', color: '#06b6d4', label: 'Firma criptográfica (CMAC)', text: 'Cada lectura genera un código diferente basado en una clave interna del chip. Confirma que es el original, no una copia.' },
      { type: 'role', icon: 'alert-circle', color: '#f97316', label: 'Estado del reloj', text: 'Si el NFT está marcado como alterado o el UID no coincide, el escaneo devuelve un aviso de autenticidad comprometida.' },
      { type: 'highlight', icon: 'information-circle', text: 'El escaneo NFC solo funciona en móviles con NFC habilitado. En escritorio esta función no está disponible.' },
    ],
  },
  {
    id: 'contratos',
    icon: 'code-slash',
    color: '#10b981',
    title: 'Contratos en Polygon',
    content: [
      { type: 'paragraph', text: 'Los contratos inteligentes de AXIA están desplegados en la mainnet de Polygon y son de acceso público. Puedes verificar su código y todas las transacciones en Polygonscan.' },
      { type: 'contract', icon: 'diamond',         color: '#8b5cf6', label: 'WatchNFT',         description: 'NFT ERC-721 · Autenticación de relojes con NFC',          address: '0x8725a60F432EDCaA3dF1d7987e99B9C18c465988' },
      { type: 'contract', icon: 'storefront',      color: '#10b981', label: 'WatchMarketplace', description: 'Listados, Escrow y comisiones del marketplace',            address: '0x57057749e6aF1b21070FA2A4e5D4359AA2711735' },
      { type: 'contract', icon: 'hammer',          color: '#f59e0b', label: 'WatchAuction',     description: 'Sistema de subastas exclusivo para Dealers',              address: '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6' },
      { type: 'contract', icon: 'shield-checkmark', color: '#38bdf8', label: 'WatchSignature',  description: 'Verificación criptográfica de firmas',                    address: '0x967187957d31d0912aE57cad1B51F764339AaEe6' },
      { type: 'contract', icon: 'cash',            color: '#06b6d4', label: 'MockUSDC',         description: 'Stablecoin USDC utilizada en las transacciones',          address: '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F' },
    ],
  },
  {
    id: 'seguridad',
    icon: 'shield-checkmark',
    color: '#ef4444',
    title: 'Seguridad y garantías',
    content: [
      { type: 'paragraph', text: 'Los contratos inteligentes de AXIA son el núcleo del sistema de garantías. Ninguna parte puede alterar una transacción en curso sin el consentimiento de todas las partes.' },
      { type: 'role', icon: 'alert-circle', color: '#f97316', label: 'Reloj alterado', text: 'Si un relojero detecta piezas no originales, el NFT queda marcado como "Alterado" en la blockchain. Visible para todos, no puede ocultarse.' },
      { type: 'role', icon: 'warning', color: '#ef4444', label: 'Reloj robado / perdido', text: 'Los propietarios pueden marcar sus relojes como robados o perdidos. Esta información queda registrada en el NFT y es pública.' },
      { type: 'highlight', icon: 'shield', text: 'El sistema de Escrow garantiza que el dinero del comprador solo se libera cuando confirma la recepción. En caso de disputa, el Admin puede intervenir.' },
    ],
  },
];

const HERO_STATS = [
  { icon: 'code-slash',       label: '5 contratos',  sub: 'Polygon Mainnet',    color: '#8b5cf6' },
  { icon: 'shield-checkmark', label: 'Autenticidad', sub: 'NFC · NTAG424',      color: '#10b981' },
  { icon: 'cash',             label: 'USDC',          sub: 'Stablecoin',         color: '#38bdf8' },
  { icon: 'lock-closed',      label: 'Escrow',        sub: 'Sin intermediarios', color: '#f59e0b' },
];

// Renderiza un bloque de contenido (compartido entre FeatureCard y AccordionSection)
function renderBlock(block, i, section, colors, copiedAddress, onCopy) {
  if (block.type === 'etymology') {
    return (
      <View key={i} style={{
        borderLeftWidth: 2, borderLeftColor: '#8b5cf660',
        paddingLeft: 14, paddingVertical: 6,
        backgroundColor: '#8b5cf608', borderRadius: 8,
      }}>
        <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 }}>
          ΑΞΙΑ · Del griego antiguo
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Valor intrínseco. Mérito. Dignidad.</Text>
          {'  '}Usado en la Antigua Grecia para referirse al valor propio de algo. Deriva de{' '}
          <Text style={{ color: '#a78bfa', fontStyle: 'italic' }}>axioma</Text>
          {': una verdad que no necesita demostración.'}
        </Text>
      </View>
    );
  }
  if (block.type === 'paragraph') {
    return (
      <Text key={i} style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 21 }}>
        {block.text}
      </Text>
    );
  }
  if (block.type === 'subtitle') {
    return (
      <Text key={i} style={{ color: colors.text, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 }}>
        {block.text.toUpperCase()}
      </Text>
    );
  }
  if (block.type === 'highlight') {
    return (
      <View key={i} style={{
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: section.color + '12',
        borderRadius: 10, borderWidth: 1, borderColor: section.color + '30',
        padding: 12,
      }}>
        <Ionicons name={block.icon} size={15} color={section.color} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, color: section.color, fontSize: 12, lineHeight: 19, fontWeight: '500' }}>
          {block.text}
        </Text>
      </View>
    );
  }
  if (block.type === 'steps') {
    return (
      <View key={i} style={{ gap: 7 }}>
        {block.items.map((step, j) => (
          <View key={j} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{
              width: 20, height: 20, borderRadius: 10,
              backgroundColor: section.color + '20',
              borderWidth: 1, borderColor: section.color + '50',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
            }}>
              <Text style={{ color: section.color, fontSize: 10, fontWeight: '800' }}>{j + 1}</Text>
            </View>
            <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 19 }}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  if (block.type === 'flow') {
    return (
      <View key={i} style={{
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: block.color + '10',
        borderRadius: 10, borderWidth: 1, borderColor: block.color + '30',
        padding: 12,
      }}>
        <View style={{
          width: 30, height: 30, borderRadius: 9,
          backgroundColor: block.color + '18',
          borderWidth: 1, borderColor: block.color + '40',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Ionicons name={block.icon} size={15} color={block.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: block.color, fontSize: 12, fontWeight: '700' }}>{block.label}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>{block.text}</Text>
        </View>
      </View>
    );
  }
  if (block.type === 'role') {
    return (
      <View key={i} style={{
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: colors.surface,
        borderRadius: 10, borderWidth: 1, borderColor: colors.border,
        padding: 11,
      }}>
        <View style={{
          width: 32, height: 32, borderRadius: 9,
          backgroundColor: block.color + '18',
          borderWidth: 1, borderColor: block.color + '40',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Ionicons name={block.icon} size={15} color={block.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: block.color, fontSize: 12, fontWeight: '700' }}>{block.label}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>{block.text}</Text>
        </View>
      </View>
    );
  }
  if (block.type === 'contract') {
    const isCopied = copiedAddress === block.address;
    return (
      <View key={i} style={{
        backgroundColor: colors.surface,
        borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        padding: 12, gap: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 30, height: 30, borderRadius: 8,
            backgroundColor: block.color + '18',
            borderWidth: 1, borderColor: block.color + '40',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Ionicons name={block.icon} size={14} color={block.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: block.color, fontSize: 13, fontWeight: '700' }}>{block.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 15 }}>{block.description}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={async () => {
              await Clipboard.setStringAsync(block.address);
              onCopy(block.address);
              setTimeout(() => onCopy(null), 2000);
            }}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isCopied ? '#10b98112' : colors.backgroundAlt,
              borderRadius: 8, borderWidth: 1,
              borderColor: isCopied ? '#10b98140' : colors.border,
              paddingHorizontal: 10, paddingVertical: 7,
            }}
          >
            <Ionicons name={isCopied ? 'checkmark-circle' : 'copy-outline'} size={12} color={isCopied ? '#10b981' : colors.textMuted} />
            <Text style={{ color: isCopied ? '#10b981' : colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
              {isCopied ? '¡Copiada!' : block.address}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://amoy.polygonscan.com/address/${block.address}`)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: '#8b5cf612',
              borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf630',
              paddingHorizontal: 10, paddingVertical: 7,
            }}
          >
            <Ionicons name="open-outline" size={12} color="#8b5cf6" />
            <Text style={{ color: '#8b5cf6', fontSize: 11, fontWeight: '600' }}>Polygonscan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return null;
}

// Tarjeta de sección principal — contenido siempre visible
function FeatureCard({ section, style }) {
  const { colors } = useTheme();
  const [copiedAddress, setCopiedAddress] = useState(null);
  const isRoles = section.id === 'roles';

  return (
    <View style={[{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    }, style]}>
      {/* Línea de acento superior */}
      <View style={{ height: 3, backgroundColor: section.color }} />

      {/* Cabecera */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
        <View style={{
          width: 38, height: 38, borderRadius: 11,
          backgroundColor: section.color + '18',
          borderWidth: 1, borderColor: section.color + '40',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={section.icon} size={19} color={section.color} />
        </View>
        <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }}>
          {section.title}
        </Text>
      </View>

      {/* Contenido */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 18, gap: 10 }}>
        {isRoles ? (
          // Roles en cuadrícula 2×2
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {section.content.map((role, i) => (
              <View key={i} style={{
                flex: 1, minWidth: 130,
                backgroundColor: colors.surface,
                borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                padding: 10, gap: 6,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 8,
                    backgroundColor: role.color + '18',
                    borderWidth: 1, borderColor: role.color + '40',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={role.icon} size={13} color={role.color} />
                  </View>
                  <Text style={{ color: role.color, fontSize: 12, fontWeight: '700' }}>{role.label}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }} numberOfLines={4}>
                  {role.text}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          section.content.map((block, i) =>
            renderBlock(block, i, section, colors, copiedAddress, setCopiedAddress)
          )
        )}
      </View>
    </View>
  );
}

// Sección técnica colapsable
function AccordionSection({ section, isLast }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(null);
  const animHeight = useRef(new Animated.Value(0)).current;
  const animRotate = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(animHeight, { toValue, useNativeDriver: false, bounciness: 0, speed: 20 }),
      Animated.spring(animRotate, { toValue, useNativeDriver: true, bounciness: 0, speed: 20 }),
    ]).start();
    setOpen(!open);
  };

  const rotate = animRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const maxH   = animHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 1400] });

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1,
      borderColor: open ? section.color + '40' : colors.border,
      marginBottom: isLast ? 0 : 10,
      overflow: 'hidden',
      ...(Platform.OS === 'web' && { transition: 'border-color 0.2s ease' }),
    }}>
      {open && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: section.color }} />
      )}
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
      >
        <View style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: section.color + '18',
          borderWidth: 1, borderColor: section.color + '40',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={section.icon} size={18} color={section.color} />
        </View>
        <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }}>
          {section.title}
        </Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={17} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      <Animated.View style={{ maxHeight: maxH, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 18, gap: 10 }}>
          {section.content.map((block, i) =>
            renderBlock(block, i, section, colors, copiedAddress, setCopiedAddress)
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default function InfoScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const maxWidth  = Math.min(width, 820);
  const [emailCopied, setEmailCopied] = useState(false);
  const [loggedUser, setLoggedUser]   = useState(null);

  useEffect(() => {
    api.get('/users/me').then(r => setLoggedUser(r.data)).catch(() => {});
  }, []);

  const copyEmail = async () => {
    await Clipboard.setStringAsync('axiawatches@gmail.com');
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        navigation={navigation}
        showBack={false}
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth }}>

          {/* ── HERO ── */}
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 24, borderWidth: 1, borderColor: colors.border,
            padding: isDesktop ? 44 : 20,
            marginBottom: isDesktop ? 32 : 20, alignItems: 'center', overflow: 'hidden',
          }}>
            {/* Orbs decorativos */}
            <View style={{ position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#8b5cf610', top: -100, right: -80 }} />
            <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#38bdf808', bottom: -60, left: -50 }} />
            <View style={{ position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#10b98108', top: 10, left: -20 }} />

            {/* Logo */}
            {Platform.OS === 'web' ? (
              <Image
                source={require('../../assets/axia-icons/axia-logo-transparent.svg')}
                style={{
                  width: isDesktop ? 260 : 180,
                  height: isDesktop ? 88 : 62,
                  marginBottom: isDesktop ? 20 : 14,
                  filter: 'drop-shadow(0 0 28px rgba(139,92,246,0.45))',
                }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: 8, marginBottom: 14 }}>
                AXIA
              </Text>
            )}

            {/* Tagline */}
            <Text style={{
              color: colors.text,
              fontSize: isDesktop ? 22 : 16,
              fontWeight: '800', textAlign: 'center',
              letterSpacing: -0.5, marginBottom: 6,
            }}>
              El mercado de relojes de lujo, en la blockchain
            </Text>
            {isDesktop && (
              <Text style={{
                color: colors.textSecondary, fontSize: 14,
                textAlign: 'center', lineHeight: 22,
                maxWidth: 440, marginBottom: 28,
              }}>
                Cada pieza física vinculada a un gemelo digital único. Autenticidad inmutable, trazabilidad total, pagos seguros en USDC.
              </Text>
            )}

            {/* Stats */}
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap', gap: isDesktop ? 10 : 8,
              justifyContent: 'center', marginTop: isDesktop ? 0 : 14,
            }}>
              {HERO_STATS.map(stat => (
                <View key={stat.label} style={{
                  alignItems: 'center',
                  backgroundColor: stat.color + '12',
                  borderRadius: 12, borderWidth: 1, borderColor: stat.color + '30',
                  paddingHorizontal: isDesktop ? 14 : 10,
                  paddingVertical: isDesktop ? 10 : 8,
                  minWidth: isDesktop ? 90 : 75,
                }}>
                  <Ionicons name={stat.icon} size={isDesktop ? 20 : 16} color={stat.color} style={{ marginBottom: 4 }} />
                  <Text style={{ color: colors.text, fontSize: isDesktop ? 12 : 11, fontWeight: '800' }}>{stat.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 1, textAlign: 'center' }}>{stat.sub}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── TARJETAS PRINCIPALES ── */}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14, paddingLeft: 2 }}>
            ECOSISTEMA
          </Text>

          {isDesktop ? (
            <View style={{ gap: 12, marginBottom: 32 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <FeatureCard section={FEATURE_DATA[0]} style={{ flex: 1 }} />
                <FeatureCard section={FEATURE_DATA[1]} style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <FeatureCard section={FEATURE_DATA[2]} style={{ flex: 1 }} />
                <FeatureCard section={FEATURE_DATA[3]} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 12, marginBottom: 32 }}>
              {FEATURE_DATA.map(s => <FeatureCard key={s.id} section={s} />)}
            </View>
          )}

          {/* ── DIVISOR TÉCNICO ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
              DOCUMENTACIÓN TÉCNICA
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* ── ACORDEONES TÉCNICOS ── */}
          {TECH_SECTIONS.map((section, i) => (
            <AccordionSection
              key={section.id}
              section={section}
              isLast={i === TECH_SECTIONS.length - 1}
            />
          ))}

          {/* ── CONTACTO ── */}
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 18, borderWidth: 1, borderColor: colors.border,
            padding: 20, marginTop: 28, overflow: 'hidden',
          }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#8b5cf6' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: '#8b5cf618', borderWidth: 1, borderColor: '#8b5cf640',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="mail" size={18} color="#8b5cf6" />
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>¿Necesitas ayuda?</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 14 }}>
              Para dudas sobre la plataforma, incidencias con transacciones o verificaciones, contacta con el equipo de AXIA:
            </Text>
            <TouchableOpacity
              onPress={copyEmail}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: emailCopied ? '#10b98115' : '#8b5cf615',
                borderRadius: 12, borderWidth: 1,
                borderColor: emailCopied ? '#10b98140' : '#8b5cf640',
                padding: 14,
              }}
            >
              <Ionicons name={emailCopied ? 'checkmark-circle' : 'mail-outline'} size={18} color={emailCopied ? '#10b981' : '#8b5cf6'} />
              <Text style={{ color: emailCopied ? '#10b981' : '#8b5cf6', fontSize: 14, fontWeight: '700', flex: 1 }}>
                {emailCopied ? '¡Copiado!' : 'axiawatches@gmail.com'}
              </Text>
              <Ionicons name="copy-outline" size={14} color={emailCopied ? '#10b98199' : '#8b5cf699'} />
            </TouchableOpacity>
          </View>

          {/* ── FOOTER ── */}
          <View style={{ alignItems: 'center', marginTop: 28, gap: 5 }}>
            <View style={{ width: 32, height: 2, backgroundColor: colors.border, borderRadius: 1, marginBottom: 6 }} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>AXIA · Powered by Polygon</Text>
            <Text style={{ color: colors.border, fontSize: 11 }}>Todos los derechos reservados</Text>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
