// src/themes/styles.js
//
// Sistema de diseño AXIA
// ──────────────────────
// Filosofía: Web3 · Alta Relojería · Minimalismo Apple
//
// Dark  → Polygon Noir:  fondos OLED profundos, violeta refinado, sin ruido visual
// Light → Apple Blanc:   blancos limpios, tipografía oscura, bordes apenas visibles
//
// Reglas:
//   • Sin gradientes decorativos en botones
//   • Sombras solo donde aportan profundidad, nunca como efecto visual
//   • Letter-spacing contenido (0–0.4) — el exceso es amateur
//   • Colores de rol: paleta de alta joyería (oro envejecido, acero, amatista)

import { StyleSheet, Platform } from 'react-native';

// TIPOGRAFÍA — escala
export const typography = {
  xs:   { fontSize: 11, lineHeight: 16 },
  sm:   { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 22 },
  md:   { fontSize: 17, lineHeight: 24 },
  lg:   { fontSize: 20, lineHeight: 28 },
  xl:   { fontSize: 24, lineHeight: 32 },
  xxl:  { fontSize: 30, lineHeight: 38 },
};


// ESQUEMA OSCURO — Zinc Noir (estilo dark moderno)
export const darkColors = {
  // Fondos — charcoal neutro sin tinte azulado
  background:    '#0d0d0d',
  backgroundAlt: '#18181b',
  surface:       '#27272a',

  // Texto — zinc scale
  text:          '#fafafa',
  textPrimary:   '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted:     '#71717a',

  // Acento — violeta AXIA (único color de marca)
  primary:       '#8b5cf6',
  primaryLight:  '#a78bfa',
  primaryDark:   '#7c3aed',

  // Estructura — bordes zinc neutros
  border:        '#3f3f46',
  borderLight:   '#52525b',

  // Superficie de tarjeta
  card:          '#18181b',

  // Utilidades
  metamaskOrange: '#f97316',

  // Wallet
  walletBg:            '#18181b',
  walletBorder:        '#8b5cf6',
  walletTextDark:      '#fafafa',
  walletTextMedium:    '#a1a1aa',
  walletHighlight:     '#a78bfa',
  walletCardBg:        '#27272a',
  walletAddressBg:     '#27272a',
  walletAddressBorder: '#3f3f46',
};

export const colors = darkColors;

// COLORES DE ROL — paleta de alta relojería
// Inspiración: materiales nobles de un reloj de lujo
//   ADMIN      → amatista (el color Polygon base, marca de plataforma)
//   PARTICULAR → violeta medio (el usuario estándar de la plataforma)
//   DEALER     → oro envejecido (joyerías, comercios de lujo)
//   RELOJERO   → acero azulado (precisión, artesanía, instrumentos)
//   FABRICANTE → oro rosa pálido (manufactura, origen, exclusividad)
export const roleColors = {
  ADMIN:       '#a78bfa',   // amatista vivo — marca AXIA
  PARTICULAR:  '#8b5cf6',   // violeta Polygon
  DEALER:      '#d4a017',   // oro brillante
  RELOJERO:    '#0ea5e9',   // azul acero vivo
  FABRICANTE:  '#e879a7',   // rosa gold vivo
};

// COLORES DE ESTADO — sistema semafórico contenido
export const alertColors = {
  error:   '#ef4444',   // rojo vivo
  warning: '#f59e0b',   // ámbar visible
  success: '#10b981',   // esmeralda vivo
  info:    '#8b5cf6',   // violeta de la plataforma
  confirm: '#8b5cf6',
};

// Estados de seguridad del reloj
export const WATCH_STATES = {
  0: { label: 'Activo',    color: '#10b981', icon: 'shield-checkmark', desc: 'Reloj seguro y operativo.' },
  1: { label: 'Robado',    color: '#ef4444', icon: 'warning',          desc: 'Reportado como robado. Comercio bloqueado.' },
  2: { label: 'Perdido',   color: '#94a3b8', icon: 'help-circle',      desc: 'Reportado como extraviado.' },
  3: { label: 'Destruido', color: '#475569', icon: 'trash',            desc: 'Declarado destruido. Acción irreversible.' },
  4: { label: 'Alterado',  color: '#f97316', icon: 'alert-circle',     desc: 'Componentes no originales detectados. Venta y transferencia bloqueadas.' },
};

// ESTILOS GLOBALES
// Estos usan `colors` (= darkColors) para componentes que no migran a useTheme.
// Los componentes nuevos usan `useTheme()` directamente con styles inline.
export const globalStyles = StyleSheet.create({
  // Layout base
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Tarjeta de formulario (Auth, modales) — redondeada, sombra difusa
  card: {
    backgroundColor: colors.backgroundAlt,
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },

  // Tipografía
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 28,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Inputs — más redondeados
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 12,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    outlineStyle: 'none',
  },
  eyeButton: {
    padding: 8,
  },

  // Botón primario — píldora
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Botón secundario — píldora con borde
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },

  // Navegación Auth
  switchButton: { marginTop: 18, alignItems: 'center' },
  switchText: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: '500',
  },

  // Estados vacíos
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 14,
  },

  // Grids
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    overflow: 'visible',
  },

  // Éxito / Wallet
  successBox: {
    backgroundColor: 'rgba(15,122,85,0.1)',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,122,85,0.3)',
  },
  successLabel: {
    color: alertColors.success,
    fontWeight: '600',
    marginBottom: 4,
    fontSize: 13,
  },
  walletText: {
    color: alertColors.success,
    fontSize: 12,
  },

  // Tabs genéricos
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 20,
    marginHorizontal: 16,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Importar / misc
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  importText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
});

// ALERTAS — modal estándar
export const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    backgroundColor: colors.backgroundAlt,
    padding: 28,
    borderRadius: 28,
    width: '85%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 8,
    textAlign: 'center',
    color: colors.text,
    letterSpacing: -0.2,
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 21,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: alertColors.error,
    borderRadius: 24,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  singleButton: { width: '100%' },

  // Input dentro de modal (recuperar contraseña)
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    marginBottom: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    outlineStyle: 'none',
  },
});

// ADMIN PANEL
export const adminStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  adminBadge: {
    color: roleColors.ADMIN,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 10,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(198,40,40,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198,40,40,0.2)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.text,
    letterSpacing: -0.2,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userRowHover: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: 8,
  },
  userInfo: { flex: 1 },
  userName: {
    fontWeight: '600',
    fontSize: 14,
    color: colors.text,
    letterSpacing: -0.1,
  },
  userSubtext: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  roleBadgeRow: { flexDirection: 'row', gap: 4 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roleSection: {
    backgroundColor: colors.backgroundAlt,
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    color: colors.text,
    letterSpacing: -0.2,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actionBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  revokeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(198,40,40,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198,40,40,0.2)',
  },
  revokeBtnText: {
    color: alertColors.error,
    fontWeight: '600',
    fontSize: 13,
  },
  rejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  approveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  approveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  requestCard: {
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 10,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  emptyText: {
    color: colors.textMuted,
    fontStyle: 'italic',
    fontSize: 13,
  },
});

// PERFIL DE USUARIO
export const userStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  userBadge: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232,120,12,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,120,12,0.3)',
    gap: 6,
  },
  walletBtnText: {
    color: '#e8780c',
    fontWeight: '600',
    fontSize: 13,
  },
  walletConnected: {
    backgroundColor: 'rgba(15,122,85,0.1)',
    borderColor: 'rgba(15,122,85,0.3)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
    color: colors.text,
    letterSpacing: -0.2,
  },
  emptyCard: {
    backgroundColor: colors.backgroundAlt,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 10,
    fontSize: 14,
  },
});

// TARJETA DE RELOJ (colección privada)
export const watchCardStyles = StyleSheet.create({
  card: {
    width: 210,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 14,
    marginRight: 14,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    backgroundColor: 'rgba(24,24,27,0.92)',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(130,71,229,0.4)',
    backdropFilter: 'blur(8px)',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 38,
    right: 10,
    zIndex: 30,
    backgroundColor: 'rgba(18,18,20,0.98)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: 'rgba(130,71,229,0.55)',
    shadowColor: '#8247e5',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    minWidth: 155,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(130,71,229,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  image: {
    width: '100%',
    height: 145,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  brandText: {
    fontWeight: '700',
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.2,
  },
  modelText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  idText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

// PANTALLA INDIVIDUAL DE RELOJ
export const watchScreenStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 14,
    color: colors.text,
    letterSpacing: -0.2,
  },
  image: {
    width: '100%',
    height: 260,
    backgroundColor: colors.surface,
  },
  tabRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  contentCard: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    color: colors.text,
    letterSpacing: -0.2,
  },
  detailRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontWeight: '600',
    color: colors.primaryLight,
    width: 140,
    fontSize: 13,
  },
  detailValue: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  activeStatusBox: {
    backgroundColor: 'rgba(15,122,85,0.08)',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,122,85,0.2)',
  },
  activeStatusTitle: {
    color: alertColors.success,
    fontWeight: '600',
    marginBottom: 4,
    fontSize: 13,
  },
  activeStatusDesc: {
    color: alertColors.success,
    fontSize: 13,
  },
});

// MARKETPLACE
export const marketplaceStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: colors.text,
    fontSize: 14,
    outlineStyle: 'none',
  },
  priceRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  priceInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: { padding: 8 },
  card: {
    flex: 0.5,
    backgroundColor: colors.backgroundAlt,
    margin: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageContainer: {
    height: 160,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  watchImage: { width: '90%', height: '90%' },
  priceTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  infoContainer: { padding: 12 },
  brandText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  modelText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  sellerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerText: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
  },
});

// HEADER GLOBAL
export const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  welcomeSection: { flex: 1 },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  walletDisconnected: {
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderColor: 'rgba(124,58,237,0.3)',
  },
  walletConnected: {
    backgroundColor: 'rgba(15,122,85,0.08)',
    borderColor: 'rgba(15,122,85,0.3)',
  },
  walletText: {
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    marginLeft: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(198,40,40,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(198,40,40,0.15)',
  },
});

// SOLICITUD PROFESIONAL (ProfessionalRequestScreen)
export const professionalRequestStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  instructions: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 22,
    lineHeight: 20,
  },
  card: {
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  textAreaTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 22,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 110,
    lineHeight: 21,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 28,
    marginBottom: 48,
  },
});

// NOTIFICACIONES
export const notificationsStyles = StyleSheet.create({
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 14,
    marginLeft: 4,
  },
  card: {
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.15s ease',
      cursor: 'pointer',
    }),
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  deleteButton: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(198,40,40,0.08)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// BANNERS / TOAST — notificaciones flotantes
export const bannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    width: Platform.OS === 'web' ? 400 : '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 12,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1c1e',
    letterSpacing: -0.1,
  },
  message: {
    fontSize: 12,
    color: '#48484a',
    marginTop: 1,
    lineHeight: 16,
  },
  notifBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: alertColors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.backgroundAlt,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
});

// SELECTOR DE ROL (modal de cambio de rol activo)
export const roleSelectorStyles = StyleSheet.create({
  roleToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  modalOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  modalOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
