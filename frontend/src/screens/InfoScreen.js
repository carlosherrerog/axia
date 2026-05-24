import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Animated, Platform, useWindowDimensions, Image, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const SECTIONS = [
  {
    id: 'que-es',
    icon: 'diamond',
    color: '#8b5cf6',
    title: '¿Qué es AXIA?',
    content: [
      {
        type: 'etymology',
      },
      {
        type: 'paragraph',
        text: 'AXIA es un ecosistema blockchain para la autenticación, trazabilidad y comercio seguro de relojes de lujo. Cada reloj físico está vinculado a un gemelo digital único —un NFT— registrado en la blockchain de Polygon.',
      },
      {
        type: 'paragraph',
        text: 'Esto significa que el historial completo de cada pieza (fabricación, propietarios anteriores, reparaciones, ventas) queda grabado de forma permanente e inmutable. Nadie puede falsificarlo ni borrarlo.',
      },
      {
        type: 'highlight',
        icon: 'shield-checkmark',
        text: 'Cada transacción se liquida en USDC (stablecoin), eliminando la volatilidad y los intermediarios tradicionales.',
      },
    ],
  },
  {
    id: 'roles',
    icon: 'people',
    color: '#06b6d4',
    title: 'Roles de usuario',
    content: [
      {
        type: 'role',
        icon: 'person',
        color: '#a78bfa',
        label: 'Particular',
        text: 'Usuario estándar. Puede comprar y vender relojes en el marketplace P2P. Sus ventas requieren peritaje de un relojero y retención de fianza del 2% como garantía de autenticidad.',
      },
      {
        type: 'role',
        icon: 'storefront',
        color: '#10b981',
        label: 'Dealer',
        text: 'Empresa o profesional verificado en la blockchain. Vende sin fianza ni peritaje, con envío automático confirmado. Acceso exclusivo al sistema de subastas.',
      },
      {
        type: 'role',
        icon: 'build',
        color: '#f59e0b',
        label: 'Relojero',
        text: 'Experto técnico. Certifica la autenticidad de relojes en ventas P2P. Puede rechazar piezas falsificadas, lo que cancela la venta y marca el NFT como alterado.',
      },
      {
        type: 'role',
        icon: 'construct',
        color: '#ec4899',
        label: 'Fabricante',
        text: 'Creador original del reloj. Emite el NFT en el momento de fabricación. Recibe regalías automáticas (1%) en cada reventa futura de sus piezas.',
      },
    ],
  },
  {
    id: 'marketplace',
    icon: 'storefront',
    color: '#10b981',
    title: 'Marketplace y compraventa',
    content: [
      {
        type: 'subtitle',
        text: 'Venta de Dealer → Particular',
      },
      {
        type: 'steps',
        items: [
          'El Dealer publica el reloj con precio en USDC.',
          'El comprador ejecuta la compra; el pago queda en Escrow (bloqueado).',
          'El sistema confirma el envío automáticamente en la blockchain.',
          'El comprador recibe el reloj y pulsa "Confirmar entrega". Los fondos se liberan al Dealer.',
        ],
      },
      {
        type: 'subtitle',
        text: 'Venta P2P (Particular → Particular o Dealer)',
      },
      {
        type: 'steps',
        items: [
          'El particular publica el reloj. Se retiene un 2% de fianza.',
          'El comprador paga; el dinero queda en Escrow.',
          'El vendedor confirma el envío físico del paquete.',
          'El sistema asigna un relojero que inspecciona el reloj.',
          'Si es auténtico, el comprador confirma entrega y los fondos se liberan.',
          'Si es falso: venta cancelada, comprador reembolsado, vendedor pierde la fianza.',
        ],
      },
      {
        type: 'highlight',
        icon: 'lock-closed',
        text: 'El dinero nunca va directamente al vendedor hasta que el comprador confirma la recepción del reloj.',
      },
    ],
  },
  {
    id: 'subastas',
    icon: 'hammer',
    color: '#f59e0b',
    title: 'Sistema de subastas',
    content: [
      {
        type: 'paragraph',
        text: 'Las subastas son exclusivas para Dealers. Permiten poner un reloj a la venta con precio mínimo de salida y que los usuarios compitan pujando durante un tiempo determinado.',
      },
      {
        type: 'steps',
        items: [
          'El Dealer crea la subasta indicando precio mínimo y duración.',
          'Cualquier usuario con wallet puede pujar superando la puja anterior.',
          'Si eres superado, tu USDC se devuelve automáticamente a tu balance.',
          'Al expirar el tiempo, el Dealer finaliza la subasta.',
          'Si hay ganador, el NFT y el pago se transfieren automáticamente vía blockchain.',
        ],
      },
      {
        type: 'highlight',
        icon: 'wallet',
        text: 'Necesitas tener una wallet conectada para pujar. Conecta MetaMask desde el header.',
      },
    ],
  },
  {
    id: 'coleccion',
    icon: 'albums',
    color: '#8b5cf6',
    title: 'Tu colección digital',
    content: [
      {
        type: 'subtitle',
        text: 'Importar un reloj',
      },
      {
        type: 'paragraph',
        text: 'Si tienes un reloj cuyo NFT está en tu wallet, puedes importarlo a AXIA para que aparezca en tu colección. El sistema sincroniza automáticamente los metadatos y reconstruye el historial completo desde la blockchain.',
      },
      {
        type: 'subtitle',
        text: 'Ocultar un reloj',
      },
      {
        type: 'paragraph',
        text: 'Puedes ocultar cualquier reloj de tu colección. Esto elimina los datos locales, pero al volver a importarlo todo se recupera íntegramente desde la blockchain. No se pierde ninguna información.',
      },
      {
        type: 'subtitle',
        text: 'Visibilidad pública',
      },
      {
        type: 'paragraph',
        text: 'Cada reloj puede configurarse como público o privado. Los relojes públicos aparecen en los perfiles públicos y en el marketplace cuando están listados.',
      },
      {
        type: 'highlight',
        icon: 'link',
        text: 'El historial de propiedad se lee directamente de los eventos de la blockchain: es inmutable y no puede ser alterado por nadie, ni por AXIA.',
      },
    ],
  },
  {
    id: 'wallet',
    icon: 'wallet',
    color: '#38bdf8',
    title: 'Wallet y blockchain',
    content: [
      {
        type: 'paragraph',
        text: 'Una wallet (cartera digital) es tu identidad en la blockchain. En AXIA usamos MetaMask, la extensión de navegador más extendida, compatible con la red Polygon.',
      },
      {
        type: 'subtitle',
        text: 'Conectar tu wallet',
      },
      {
        type: 'steps',
        items: [
          'Instala MetaMask como extensión en tu navegador.',
          'Pulsa "Conectar wallet" en el header de la aplicación.',
          'MetaMask te pedirá que firmes un mensaje para verificar tu identidad.',
          'Una vez vinculada, tu dirección aparece en el header en verde.',
        ],
      },
      {
        type: 'highlight',
        icon: 'information-circle',
        text: 'AXIA nunca accede a tus fondos directamente. Solo lees y firmas transacciones que tú previamente apruebas en MetaMask.',
      },
    ],
  },
  {
    id: 'nfc',
    icon: 'radio',
    color: '#06b6d4',
    title: 'Tarjeta NFC · NTAG424 DNA',
    content: [
      {
        type: 'paragraph',
        text: 'Cada reloj registrado en AXIA puede llevar asociada una tarjeta NFC NTAG424 DNA, un chip de seguridad criptográfica que actúa como puente físico entre el reloj y su gemelo digital en la blockchain.',
      },
      {
        type: 'highlight',
        icon: 'shield-checkmark',
        text: 'El NTAG424 DNA genera un código de autenticación único (CMAC) en cada lectura, imposible de clonar o replicar. Es la misma tecnología que usan los pasaportes biométricos.',
      },
      {
        type: 'subtitle',
        text: 'Cómo escanear la tarjeta',
      },
      {
        type: 'steps',
        items: [
          'Abre AXIA en tu móvil con NFC activado (Ajustes → NFC).',
          'Navega a la ficha del reloj que quieres verificar.',
          'Pulsa el botón "Escanear NFC" y acerca tu móvil a la tarjeta del reloj.',
          'La app lee el UID criptográfico del chip y lo compara con el registrado en el NFT.',
          'Si coincide verás ✓ Autenticado. Si no coincide, el sistema alerta de posible falsificación.',
        ],
      },
      {
        type: 'subtitle',
        text: 'Qué verifica el escaneo',
      },
      {
        type: 'role',
        icon: 'checkmark-circle',
        color: '#10b981',
        label: 'UID vinculado al NFT',
        text: 'El identificador único del chip está grabado en el contrato inteligente en el momento del minteo. No puede modificarse posteriormente.',
      },
      {
        type: 'role',
        icon: 'finger-print',
        color: '#06b6d4',
        label: 'Firma criptográfica (CMAC)',
        text: 'Cada lectura genera un código diferente basado en una clave secreta interna del chip. Confirma que el chip es físicamente el original, no una copia del UID.',
      },
      {
        type: 'role',
        icon: 'alert-circle',
        color: '#f97316',
        label: 'Estado del reloj',
        text: 'Si el NFT está marcado como alterado o el UID no coincide con el registrado en la blockchain, el escaneo devolverá un aviso de autenticidad comprometida.',
      },
      {
        type: 'highlight',
        icon: 'information-circle',
        text: 'El escaneo NFC solo funciona en dispositivos móviles con NFC habilitado. En navegadores de escritorio esta función no está disponible.',
      },
    ],
  },
  {
    id: 'contratos',
    icon: 'code-slash',
    color: '#10b981',
    title: 'Contratos en Polygon',
    content: [
      {
        type: 'paragraph',
        text: 'Los contratos inteligentes de AXIA están desplegados en la mainnet de Polygon y son de acceso público. Puedes verificar su código y todas las transacciones históricas en Polygonscan.',
      },
      {
        type: 'contract',
        icon: 'diamond',
        color: '#8b5cf6',
        label: 'WatchNFT',
        description: 'NFT ERC-721 · Autenticación de relojes con NFC',
        address: '0x8725a60F432EDCaA3dF1d7987e99B9C18c465988',
      },
      {
        type: 'contract',
        icon: 'storefront',
        color: '#10b981',
        label: 'WatchMarketplace',
        description: 'Listados, Escrow y comisiones del marketplace',
        address: '0x57057749e6aF1b21070FA2A4e5D4359AA2711735',
      },
      {
        type: 'contract',
        icon: 'hammer',
        color: '#f59e0b',
        label: 'WatchAuction',
        description: 'Sistema de subastas exclusivo para Dealers',
        address: '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6',
      },
      {
        type: 'contract',
        icon: 'shield-checkmark',
        color: '#38bdf8',
        label: 'WatchSignature',
        description: 'Verificación criptográfica de firmas',
        address: '0x967187957d31d0912aE57cad1B51F764339AaEe6',
      },
      {
        type: 'contract',
        icon: 'cash',
        color: '#06b6d4',
        label: 'MockUSDC',
        description: 'Stablecoin USDC utilizada en las transacciones',
        address: '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F',
      },
    ],
  },
  {
    id: 'seguridad',
    icon: 'shield-checkmark',
    color: '#ef4444',
    title: 'Seguridad y garantías',
    content: [
      {
        type: 'paragraph',
        text: 'Los contratos inteligentes de AXIA están desplegados en Polygon y son el núcleo del sistema de garantías. Ninguna parte (ni AXIA, ni el vendedor, ni el comprador) puede alterar una transacción en curso sin el consentimiento de todas las partes.',
      },
      {
        type: 'role',
        icon: 'alert-circle',
        color: '#f97316',
        label: 'Reloj alterado',
        text: 'Si un relojero detecta piezas no originales, el NFT queda marcado como "Alterado" en la blockchain. Este estado es visible para todos y no puede ocultarse.',
      },
      {
        type: 'role',
        icon: 'warning',
        color: '#ef4444',
        label: 'Reloj robado / perdido',
        text: 'Los propietarios pueden marcar sus relojes como robados o perdidos. Esta información queda registrada en el NFT y es visible públicamente.',
      },
      {
        type: 'highlight',
        icon: 'shield',
        text: 'El sistema de Escrow garantiza que el dinero del comprador solo se libera cuando confirma la recepción. En caso de disputa, el Admin puede intervenir.',
      },
    ],
  },
];

function AccordionSection({ section, isLast }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(null);
  const animHeight = useRef(new Animated.Value(0)).current;
  const animRotate = useRef(new Animated.Value(0)).current;

  const copyAddress = async (address) => {
    await Clipboard.setStringAsync(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const openPolygonscan = (address) => {
    Linking.openURL(`https://polygonscan.com/address/${address}`);
  };

  const shortAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(animHeight, { toValue, useNativeDriver: false, bounciness: 0, speed: 20 }),
      Animated.spring(animRotate, { toValue, useNativeDriver: true, bounciness: 0, speed: 20 }),
    ]).start();
    setOpen(!open);
  };

  const rotate = animRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const maxH = animHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 1200] });

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1,
      borderColor: open ? section.color + '40' : colors.border,
      marginBottom: isLast ? 0 : 12,
      overflow: 'hidden',
      ...(Platform.OS === 'web' && { transition: 'border-color 0.2s ease' }),
    }}>
      {/* Línea de acento izquierda */}
      {open && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: section.color }} />
      )}

      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 }}
      >
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: section.color + '18',
          borderWidth: 1, borderColor: section.color + '40',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={section.icon} size={20} color={section.color} />
        </View>

        <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>
          {section.title}
        </Text>

        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={{ maxHeight: maxH, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 18, paddingBottom: 20, gap: 12 }}>
          {section.content.map((block, i) => {
            if (block.type === 'etymology') {
              return (
                <View key={i} style={{
                  borderLeftWidth: 2, borderLeftColor: '#8b5cf660',
                  paddingLeft: 14, paddingVertical: 4,
                  backgroundColor: '#8b5cf608', borderRadius: 8,
                }}>
                  <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 }}>
                    ΑΞΙΑ · Del griego antiguo
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Valor intrínseco. Mérito. Dignidad.</Text>
                    {'  '}Usado en la Antigua Grecia para referirse al valor propio de algo o la dignidad de una persona. Deriva de{' '}
                    <Text style={{ color: '#a78bfa', fontStyle: 'italic' }}>axioma</Text>
                    {': una verdad que no necesita demostración.'}
                  </Text>
                </View>
              );
            }
            if (block.type === 'paragraph') {
              return (
                <Text key={i} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === 'subtitle') {
              return (
                <Text key={i} style={{ color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginTop: 4 }}>
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
                  <Ionicons name={block.icon} size={16} color={section.color} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, color: section.color, fontSize: 13, lineHeight: 20, fontWeight: '500' }}>
                    {block.text}
                  </Text>
                </View>
              );
            }
            if (block.type === 'steps') {
              return (
                <View key={i} style={{ gap: 8 }}>
                  {block.items.map((step, j) => (
                    <View key={j} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: section.color + '20',
                        borderWidth: 1, borderColor: section.color + '50',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                      }}>
                        <Text style={{ color: section.color, fontSize: 11, fontWeight: '800' }}>{j + 1}</Text>
                      </View>
                      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            }
            if (block.type === 'role') {
              return (
                <View key={i} style={{
                  flexDirection: 'row', gap: 12, alignItems: 'flex-start',
                  backgroundColor: colors.surface,
                  borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                  padding: 12,
                }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 10,
                    backgroundColor: block.color + '18',
                    borderWidth: 1, borderColor: block.color + '40',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ionicons name={block.icon} size={16} color={block.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: block.color, fontSize: 13, fontWeight: '700' }}>{block.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{block.text}</Text>
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
                      width: 32, height: 32, borderRadius: 9,
                      backgroundColor: block.color + '18',
                      borderWidth: 1, borderColor: block.color + '40',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Ionicons name={block.icon} size={15} color={block.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: block.color, fontSize: 13, fontWeight: '700' }}>{block.label}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>{block.description}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => copyAddress(block.address)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: isCopied ? '#10b98112' : colors.backgroundAlt,
                        borderRadius: 8, borderWidth: 1,
                        borderColor: isCopied ? '#10b98140' : colors.border,
                        paddingHorizontal: 10, paddingVertical: 7,
                      }}
                    >
                      <Ionicons
                        name={isCopied ? 'checkmark-circle' : 'copy-outline'}
                        size={13}
                        color={isCopied ? '#10b981' : colors.textMuted}
                      />
                      <Text style={{
                        color: isCopied ? '#10b981' : colors.textSecondary,
                        fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'],
                      }}>
                        {isCopied ? '¡Copiada!' : block.address}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openPolygonscan(block.address)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: '#8b5cf612',
                        borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf630',
                        paddingHorizontal: 10, paddingVertical: 7,
                      }}
                    >
                      <Ionicons name="open-outline" size={13} color="#8b5cf6" />
                      <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '600' }}>Polygonscan</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
            return null;
          })}
        </View>
      </Animated.View>
    </View>
  );
}

export default function InfoScreen({ navigation }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [emailCopied, setEmailCopied] = useState(false);

  const copyEmail = async () => {
    await Clipboard.setStringAsync('axiawatches@gmail.com');
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };
  const maxWidth = Math.min(width, 720);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth }}>

          {/* Botón volver */}
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28, alignSelf: 'flex-start' }}
          >
            <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Volver</Text>
            </View>
          </TouchableOpacity>

          {/* Hero */}
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 20, borderWidth: 1, borderColor: colors.border,
            padding: 28, marginBottom: 28, alignItems: 'center', overflow: 'hidden',
          }}>
            {/* Halo de fondo */}
            <View style={{
              position: 'absolute', width: 200, height: 200, borderRadius: 100,
              backgroundColor: '#8b5cf615', top: -60, right: -60,
            }} />
            <View style={{
              position: 'absolute', width: 140, height: 140, borderRadius: 70,
              backgroundColor: '#38bdf810', bottom: -40, left: -30,
            }} />

            <Image
              source={require('../../assets/axia-icons/axia-logo-transparent.svg')}
              style={{
                width: 220, height: 76, marginBottom: 16,
                ...(Platform.OS === 'web' && { filter: 'drop-shadow(0 0 20px rgba(139,92,246,0.35))' }),
              }}
              resizeMode="contain"
            />

<Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 420 }}>
              Ecosistema blockchain para la autenticación y comercio seguro de relojes de lujo
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: 'shield-checkmark', label: 'Autenticidad', color: '#10b981' },
                { icon: 'link', label: 'Blockchain', color: '#8b5cf6' },
                { icon: 'cash', label: 'USDC', color: '#38bdf8' },
              ].map(chip => (
                <View key={chip.label} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: chip.color + '15', borderRadius: 20,
                  borderWidth: 1, borderColor: chip.color + '40',
                  paddingHorizontal: 12, paddingVertical: 6,
                }}>
                  <Ionicons name={chip.icon} size={13} color={chip.color} />
                  <Text style={{ color: chip.color, fontSize: 12, fontWeight: '700' }}>{chip.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Secciones */}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14, paddingLeft: 4 }}>
            GUÍA RÁPIDA
          </Text>

          {SECTIONS.map((section, i) => (
            <AccordionSection
              key={section.id}
              section={section}
              isLast={i === SECTIONS.length - 1}
            />
          ))}

          {/* Contacto */}
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 16, borderWidth: 1, borderColor: colors.border,
            padding: 20, marginTop: 28, overflow: 'hidden',
          }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#8b5cf680' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: '#8b5cf618', borderWidth: 1, borderColor: '#8b5cf640',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="mail" size={18} color="#8b5cf6" />
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>¿Necesitas ayuda?</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 16 }}>
              Para dudas sobre la plataforma, incidencias con transacciones, verificaciones o cualquier otra cuestión, contacta con el equipo de AXIA:
            </Text>
            <TouchableOpacity
              onPress={copyEmail}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: emailCopied ? '#10b98115' : '#8b5cf615', borderRadius: 12,
                borderWidth: 1, borderColor: emailCopied ? '#10b98140' : '#8b5cf640',
                padding: 14,
              }}
            >
              <Ionicons
                name={emailCopied ? 'checkmark-circle' : 'mail-outline'}
                size={18}
                color={emailCopied ? '#10b981' : '#8b5cf6'}
              />
              <Text style={{ color: emailCopied ? '#10b981' : '#8b5cf6', fontSize: 14, fontWeight: '700', flex: 1 }}>
                {emailCopied ? '¡Copiado!' : 'axiawatches@gmail.com'}
              </Text>
              <Ionicons name="copy-outline" size={14} color={emailCopied ? '#10b98199' : '#8b5cf699'} />
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={{ alignItems: 'center', marginTop: 28, gap: 6 }}>
            <View style={{ width: 32, height: 2, backgroundColor: colors.border, borderRadius: 1, marginBottom: 8 }} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>AXIA · Powered by Polygon</Text>
            <Text style={{ color: colors.border, fontSize: 11 }}>Todos los derechos reservados</Text>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
