import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Modal, RefreshControl, Pressable, Image, useWindowDimensions,
  TextInput as TextInputNative,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { WS_URL } from '../api/api.js';
import { roleColors, alertColors } from '../themes/styles.js';
import { useTheme } from '../context/ThemeContext';

const ROLE_META = {
  RELOJERO:   { icon: 'build',      label: 'Relojeros',   color: roleColors.RELOJERO   },
  DEALER:     { icon: 'storefront', label: 'Dealers',     color: roleColors.DEALER     },
  FABRICANTE: { icon: 'business',   label: 'Fabricantes', color: roleColors.FABRICANTE },
};

// ─── Admin Header ─────────────────────────────────────────────────────────────
function AdminHeader({ user, marketPaused, onLogout, colors }) {
  const initial = (user?.username?.[0] || 'A').toUpperCase();

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderBottomWidth: 1, borderBottomColor: colors.border,
      paddingTop: Platform.OS === 'ios' ? 52 : 14,
      paddingBottom: 14,
      paddingHorizontal: 24,
      flexDirection: 'row', alignItems: 'center',
      ...(Platform.OS === 'web' && {
        boxShadow: '0 1px 12px rgba(0,0,0,0.2)',
      }),
    }}>

      {/* Marca izquierda: wordmark + separador + badge ADMIN */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {Platform.OS === 'web' ? (
          <Image
            source={require('../../assets/axia-icons/axia-wordmark-purple.svg')}
            style={{ width: 90, height: 30 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={{ color: '#a855f7', fontSize: 17, fontWeight: '900', letterSpacing: 2 }}>
            AXIA
          </Text>
        )}

        {/* Separador vertical */}
        <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: 'rgba(168,85,247,0.1)',
          borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4,
          borderWidth: 1, borderColor: 'rgba(168,85,247,0.22)',
        }}>
          <Ionicons name="shield-checkmark" size={11} color="#a855f7" />
          <Text style={{ color: '#a855f7', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>
            ADMIN
          </Text>
        </View>

        {marketPaused && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: 'rgba(244,63,94,0.08)',
            borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4,
            borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)',
          }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#f43f5e' }} />
            <Text style={{ color: '#f43f5e', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>
              PAUSADO
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* Derecha: nombre + avatar + logout */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>
            {user?.full_name || user?.username}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{user?.email}</Text>
        </View>

        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: 'rgba(168,85,247,0.15)',
          borderWidth: 2, borderColor: 'rgba(168,85,247,0.35)',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ color: '#a855f7', fontWeight: '800', fontSize: 15 }}>{initial}</Text>
        </View>

        <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />

        <TouchableOpacity
          onPress={onLogout}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: 'rgba(244,63,94,0.07)',
            borderWidth: 1, borderColor: 'rgba(244,63,94,0.18)',
          }}
        >
          <Ionicons name="log-out-outline" size={14} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontSize: 12, fontWeight: '600' }}>Salir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, colors }) {
  return (
    <View style={{
      flex: 1, alignItems: 'center',
      backgroundColor: colors.backgroundAlt,
      borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8,
      borderWidth: 1, borderColor: `${color}22`,
    }}>
      <Ionicons name={icon} size={18} color={color} style={{ marginBottom: 6 }} />
      <Text style={{ color, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ─── Marketplace Control ──────────────────────────────────────────────────────
function MarketplaceCard({ paused, loading, onToggle, logisticsStatus, copiedLogistics, onCopyLogistics, colors, onRefresh }) {
  const active = !paused;
  const statusColor = active ? '#10b981' : '#f43f5e';

  const [editLogistics,   setEditLogistics]   = useState(false);
  const [editAuction,     setEditAuction]     = useState(false);
  const [logisticsDraft,  setLogisticsDraft]  = useState('');
  const [auctionDraft,    setAuctionDraft]    = useState('');
  const [savingL,         setSavingL]         = useState(false);
  const [savingA,         setSavingA]         = useState(false);
  const [alertL,          setAlertL]          = useState(null);
  const [alertA,          setAlertA]          = useState(null);

  const handleSaveLogistics = async () => {
    setSavingL(true);
    try {
      await api.post('/admin/set-logistics-system', { address: logisticsDraft });
      setEditLogistics(false);
      setAlertL({ type: 'success', msg: 'Sistema logístico actualizado.' });
      onRefresh?.();
    } catch (e) {
      setAlertL({ type: 'error', msg: e.response?.data?.detail || 'Error al guardar.' });
    } finally { setSavingL(false); }
  };

  const handleSaveAuction = async () => {
    setSavingA(true);
    try {
      await api.post('/admin/set-auction-contract', { address: auctionDraft });
      setEditAuction(false);
      setAlertA({ type: 'success', msg: 'Contrato de subastas actualizado.' });
    } catch (e) {
      setAlertA({ type: 'error', msg: e.response?.data?.detail || 'Error al guardar.' });
    } finally { setSavingA(false); }
  };

  const AddressRow = ({ label, icon, value, editing, draft, onChangeDraft, onEdit, onSave, onCancel, saving, alert, onDismiss }) => (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
        <Ionicons name={icon} size={12} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 }}>{label}</Text>
        {editing ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 6,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
              {saving ? <ActivityIndicator size="small" color="#10b981" />
                : <Ionicons name="checkmark" size={11} color="#10b981" />}
              <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700' }}>Guardar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => { onEdit(); onChangeDraft(value || ''); }}>
            <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {editing ? (
        <View style={{
          borderWidth: 1, borderColor: 'rgba(130,71,229,0.3)', borderRadius: 8,
          paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(130,71,229,0.05)',
        }}>
          <TextInputNative
            value={draft} onChangeText={onChangeDraft}
            placeholder="0x..." placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 10,
              fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              ...(Platform.OS === 'web' && { outlineStyle: 'none' }) }}
          />
        </View>
      ) : (
        <Text numberOfLines={1} style={{
          color: colors.textMuted, fontSize: 10,
          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        }}>{value || 'No configurada'}</Text>
      )}

      {alert && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
          backgroundColor: alert.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
          borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6,
          borderWidth: 1, borderColor: alert.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
        }}>
          <Ionicons name={alert.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={12} color={alert.type === 'success' ? '#10b981' : '#f43f5e'} />
          <Text style={{ flex: 1, fontSize: 11, color: alert.type === 'success' ? '#10b981' : '#f43f5e' }}>{alert.msg}</Text>
          <TouchableOpacity onPress={onDismiss}><Ionicons name="close" size={11} color={colors.textMuted} /></TouchableOpacity>
        </View>
      )}

      {!editing && label === 'Sistema Logístico' && logisticsStatus?.balance_eth === 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: 'rgba(244,63,94,0.07)', borderRadius: 7, padding: 7, marginTop: 6,
          borderWidth: 1, borderColor: 'rgba(244,63,94,0.18)' }}>
          <Ionicons name="warning-outline" size={11} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontSize: 11 }}>Sin fondos — las transacciones pueden fallar</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Estado marketplace */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        padding: 14, gap: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <View style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: `${statusColor}12`,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Ionicons name={active ? 'storefront' : 'pause-circle'} size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Marketplace</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600' }}>
              {active ? 'Operativo' : 'Pausado'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onToggle} disabled={loading}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
            backgroundColor: active ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
            borderWidth: 1, borderColor: active ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)',
          }}
        >
          {loading
            ? <ActivityIndicator size="small" color={active ? '#f43f5e' : '#10b981'} />
            : <>
                <Ionicons name={active ? 'pause' : 'play'} size={13} color={active ? '#f43f5e' : '#10b981'} />
                <Text style={{ color: active ? '#f43f5e' : '#10b981', fontWeight: '700', fontSize: 12 }}>
                  {active ? 'Pausar' : 'Reanudar'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* Sistema logístico */}
      <AddressRow
        label="Sistema Logístico" icon="send-outline"
        value={logisticsStatus?.address}
        editing={editLogistics} draft={logisticsDraft}
        onChangeDraft={setLogisticsDraft}
        onEdit={() => setEditLogistics(true)}
        onSave={handleSaveLogistics}
        onCancel={() => setEditLogistics(false)}
        saving={savingL} alert={alertL} onDismiss={() => setAlertL(null)}
      />

      {/* Contrato de subastas */}
      <AddressRow
        label="Contrato Subastas" icon="hammer-outline"
        value={logisticsStatus?.auction_address}
        editing={editAuction} draft={auctionDraft}
        onChangeDraft={setAuctionDraft}
        onEdit={() => setEditAuction(true)}
        onSave={handleSaveAuction}
        onCancel={() => setEditAuction(false)}
        saving={savingA} alert={alertA} onDismiss={() => setAlertA(null)}
      />
    </View>
  );
}

// ─── Fees Card ────────────────────────────────────────────────────────────────
function FeesCard({ colors }) {
  const [fees, setFees]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editRecipient, setEditRecipient] = useState(false);
  const [draft, setDraft]         = useState({});
  const [recipientDraft, setRecipientDraft] = useState('');
  const [alert, setAlert]         = useState(null);

  const toBps  = (pct) => Math.round(parseFloat(pct) * 100);
  const toPct  = (bps) => (bps / 100).toFixed(2);

  const fetchFees = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/fees');
      setFees(data);
      setDraft({
        platform:   toPct(data.platform),
        royalty:    toPct(data.royalty),
        watchmaker: toPct(data.watchmaker),
        deposit:    toPct(data.deposit),
      });
      setRecipientDraft(data.recipient);
    } catch {
      setAlert({ type: 'error', msg: 'No se pudieron cargar las comisiones.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFees(); }, []);

  const handleSaveFees = async () => {
    const vals = { platform: parseFloat(draft.platform), royalty: parseFloat(draft.royalty), watchmaker: parseFloat(draft.watchmaker), deposit: parseFloat(draft.deposit) };
    if (Object.values(vals).some(v => isNaN(v) || v < 0)) {
      setAlert({ type: 'error', msg: 'Los valores deben ser números positivos.' }); return;
    }
    if (vals.platform > 10 || vals.royalty > 10) {
      setAlert({ type: 'error', msg: 'Plataforma y regalía: máximo 10%.' }); return;
    }
    if (vals.watchmaker > 5 || vals.deposit > 5) {
      setAlert({ type: 'error', msg: 'Relojero y depósito: máximo 5%.' }); return;
    }
    setSaving(true);
    try {
      await api.post('/admin/fees', {
        platform:   toBps(draft.platform),
        royalty:    toBps(draft.royalty),
        watchmaker: toBps(draft.watchmaker),
        deposit:    toBps(draft.deposit),
      });
      await fetchFees();
      setEditing(false);
      setAlert({ type: 'success', msg: 'Comisiones actualizadas correctamente.' });
    } catch (e) {
      setAlert({ type: 'error', msg: e.response?.data?.detail || 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecipient = async () => {
    setSaving(true);
    try {
      await api.post('/admin/fee-recipient', { address: recipientDraft });
      await fetchFees();
      setEditRecipient(false);
      setAlert({ type: 'success', msg: 'Wallet destinataria actualizada.' });
    } catch (e) {
      setAlert({ type: 'error', msg: e.response?.data?.detail || 'Error al guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const FEE_ROWS = [
    { key: 'platform',   label: 'Plataforma',  icon: 'storefront-outline', max: 10, color: '#8247e5' },
    { key: 'royalty',    label: 'Regalía',     icon: 'business-outline',   max: 10, color: '#f59e0b' },
    { key: 'watchmaker', label: 'Relojero',    icon: 'build-outline',      max: 5,  color: '#06b6d4' },
    { key: 'deposit',    label: 'Depósito P2P', icon: 'shield-outline',    max: 5,  color: '#10b981' },
  ];

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 11,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="cash-outline" size={14} color="#8247e5" />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Comisiones</Text>
        </View>
        {!loading && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {editing && (
              <TouchableOpacity
                onPress={() => { setEditing(false); setDraft({ platform: toPct(fees.platform), royalty: toPct(fees.royalty), watchmaker: toPct(fees.watchmaker), deposit: toPct(fees.deposit) }); }}
                style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => editing ? handleSaveFees() : setEditing(true)}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7,
                backgroundColor: editing ? 'rgba(16,185,129,0.1)' : 'rgba(130,71,229,0.1)',
                borderWidth: 1, borderColor: editing ? 'rgba(16,185,129,0.25)' : 'rgba(130,71,229,0.25)',
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#10b981" />
                : <Ionicons name={editing ? 'checkmark' : 'pencil-outline'} size={12} color={editing ? '#10b981' : '#8247e5'} />
              }
              <Text style={{ fontSize: 11, fontWeight: '700', color: editing ? '#10b981' : '#8247e5' }}>
                {editing ? 'Guardar' : 'Editar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filas de comisiones */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
        ) : (
          FEE_ROWS.map(row => (
            <View key={row.key} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 10, paddingVertical: 7,
              backgroundColor: colors.surface, borderRadius: 9,
              borderWidth: 1, borderColor: colors.border, gap: 8,
            }}>
              <Ionicons name={row.icon} size={12} color={row.color} />
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>
                {row.label}
              </Text>
              {editing ? (() => {
                const val = parseFloat(draft[row.key]);
                const isOver = !isNaN(val) && val > row.max;
                const isNeg  = !isNaN(val) && val < 0;
                const hasErr = isOver || isNeg;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                      (Máx. {row.max}%)
                    </Text>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      borderWidth: 1,
                      borderColor: hasErr ? '#f43f5e' : `${row.color}40`,
                      borderRadius: 6,
                      backgroundColor: hasErr ? 'rgba(244,63,94,0.06)' : `${row.color}08`,
                      paddingHorizontal: 7, paddingVertical: 3,
                    }}>
                      <TextInputNative
                        value={String(draft[row.key] ?? '')}
                        onChangeText={v => {
                          const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                          setDraft(d => ({ ...d, [row.key]: clean }));
                        }}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={{
                          color: hasErr ? '#f43f5e' : row.color,
                          fontWeight: '700', fontSize: 13,
                          width: 38, textAlign: 'right',
                          ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                        }}
                      />
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>%</Text>
                    </View>
                  </View>
                );
              })() : (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                  <Text style={{ color: row.color, fontWeight: '800', fontSize: 15 }}>
                    {fees ? toPct(fees[row.key]) : '—'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>%</Text>
                </View>
              )}
            </View>
          ))
        )}

        {/* Alerta inline */}
        {alert && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: alert.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
            borderWidth: 1, borderColor: alert.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
          }}>
            <Ionicons
              name={alert.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={13} color={alert.type === 'success' ? '#10b981' : '#f43f5e'}
            />
            <Text style={{ flex: 1, fontSize: 11, color: alert.type === 'success' ? '#10b981' : '#f43f5e' }}>
              {alert.msg}
            </Text>
            <TouchableOpacity onPress={() => setAlert(null)}>
              <Ionicons name="close" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Wallet que recibe comisiones */}
        {!loading && fees && (
          <View style={{
            backgroundColor: colors.surface, borderRadius: 9,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 10, paddingVertical: 8, gap: 5,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                <Ionicons name="arrow-forward-circle-outline" size={13} color="#8247e5" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    Wallet receptora de comisiones
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                    Recibe el porcentaje de plataforma de cada venta
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setEditRecipient(r => !r)}>
                <Ionicons name={editRecipient ? 'close' : 'pencil-outline'} size={12} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {editRecipient ? (
              <View style={{ gap: 7 }}>
                <View style={{
                  borderWidth: 1, borderColor: 'rgba(130,71,229,0.3)',
                  borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6,
                  backgroundColor: 'rgba(130,71,229,0.05)',
                }}>
                  <TextInputNative
                    value={recipientDraft}
                    onChangeText={setRecipientDraft}
                    placeholder="0x..."
                    placeholderTextColor={colors.textMuted}
                    style={{
                      color: colors.text, fontSize: 10,
                      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                      ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
                    }}
                  />
                </View>
                <TouchableOpacity
                  onPress={handleSaveRecipient} disabled={saving}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 7,
                    paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
                  }}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#10b981" />
                    : <Ionicons name="checkmark" size={13} color="#10b981" />
                  }
                  <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 12 }}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{
                color: colors.textSecondary, fontSize: 10,
                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              }} numberOfLines={1}>{fees.recipient}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({ user: u, roleColor, onApprove, onReject, colors }) {
  const [expanded, setExpanded] = useState(false);
  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1, borderColor: `${roleColor}28`,
      marginBottom: 12, overflow: 'hidden',
    }}>
      <View style={{ height: 2, backgroundColor: roleColor }} />
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: `${roleColor}15`, borderWidth: 1.5, borderColor: `${roleColor}30`,
            justifyContent: 'center', alignItems: 'center', marginRight: 12,
          }}>
            <Text style={{ color: roleColor, fontWeight: '800', fontSize: 15 }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                {u.full_name || u.username}
              </Text>
              <View style={{
                backgroundColor: `${roleColor}12`, borderRadius: 5,
                paddingHorizontal: 6, paddingVertical: 2,
                borderWidth: 1, borderColor: `${roleColor}28`,
              }}>
                <Text style={{ color: roleColor, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
                  {u.requested_role}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              @{u.username} · {u.email}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''}
          </Text>
        </View>

        {/* Wallet */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.surface, borderRadius: 8,
          paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Ionicons name={u.wallet_address ? 'wallet' : 'wallet-outline'} size={13}
            color={u.wallet_address ? '#10b981' : colors.textMuted} />
          <Text style={{
            color: u.wallet_address ? colors.text : colors.textMuted,
            fontSize: 11, flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }} numberOfLines={1}>
            {u.wallet_address || 'Sin wallet'}
          </Text>
          {u.wallet_address && (
            <View style={{ backgroundColor: '#10b98115', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: '#10b981', fontSize: 9, fontWeight: '700' }}>OK</Text>
            </View>
          )}
        </View>

        {/* Carta expandible */}
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={{
            backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1,
            borderColor: expanded ? `${roleColor}35` : colors.border,
            overflow: 'hidden', marginBottom: 12,
          }}
        >
          <View style={{
            flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8,
            borderBottomWidth: expanded ? 1 : 0, borderBottomColor: colors.border,
          }}>
            <Ionicons name="document-text-outline" size={14} color={expanded ? roleColor : colors.textSecondary} />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, flex: 1 }}>
              Carta de presentación
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {u.request_message ? `${u.request_message.length} car.` : 'Vacía'}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
          </View>
          {expanded && (
            <View style={{ padding: 12 }}>
              {u.request_message
                ? <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20, fontStyle: 'italic' }}>
                    "{u.request_message}"
                  </Text>
                : <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>Sin mensaje adjunto</Text>
              }
            </View>
          )}
        </Pressable>

        {/* Acciones */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onReject}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 10, borderRadius: 10, gap: 5,
              backgroundColor: 'rgba(244,63,94,0.07)',
              borderWidth: 1, borderColor: 'rgba(244,63,94,0.22)',
            }}
          >
            <Ionicons name="close-circle-outline" size={14} color="#f43f5e" />
            <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 13 }}>Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApprove}
            style={{
              flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 10, borderRadius: 10, gap: 5, backgroundColor: roleColor,
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Aprobar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Active User Card ─────────────────────────────────────────────────────────
function ActiveUserCard({ u, roleColor, onRevoke, colors }) {
  const [copied, setCopied] = useState(false);
  const initials = (u.full_name || u.username || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const handleCopy = async () => {
    if (!u.wallet_address) return;
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(u.wallet_address);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 38, height: 38, borderRadius: 19,
          backgroundColor: `${roleColor}12`, borderWidth: 1.5, borderColor: `${roleColor}25`,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ color: roleColor, fontWeight: '800', fontSize: 13 }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
            {u.full_name || u.username}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>@{u.username}</Text>
        </View>
        <TouchableOpacity
          onPress={onRevoke}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
            backgroundColor: 'rgba(244,63,94,0.07)',
            borderWidth: 1, borderColor: 'rgba(244,63,94,0.18)',
          }}
        >
          <Ionicons name="remove-circle-outline" size={13} color="#f43f5e" />
          <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 12 }}>Revocar</Text>
        </TouchableOpacity>
      </View>
      {u.wallet_address && (
        <TouchableOpacity
          onPress={handleCopy}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: `${roleColor}07`, borderRadius: 7,
            paddingHorizontal: 10, paddingVertical: 6, marginTop: 8,
            borderWidth: 1, borderColor: `${roleColor}20`,
          }}
        >
          <Ionicons name={copied ? 'checkmark-circle' : 'wallet-outline'} size={12} color={roleColor} />
          <Text style={{
            flex: 1, fontSize: 10, color: colors.textSecondary,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }} numberOfLines={1}>{u.wallet_address}</Text>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={11}
            color={copied ? '#10b981' : colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
const EXPLORER_BASE = 'https://polygonscan.com/address/';

const CONTRACTS = [
  {
    key: 'nft',
    label: 'WatchNFT',
    icon: 'disc-outline',
    color: '#8b5cf6',
    address: process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS || '0x8725a60F432EDCaA3dF1d7987e99B9C18c465988',
    desc: 'ERC-721 · Autenticación de relojes',
  },
  {
    key: 'market',
    label: 'Marketplace',
    icon: 'storefront-outline',
    color: '#3b82f6',
    address: process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS || '0x57057749e6aF1b21070FA2A4e5D4359AA2711735',
    desc: 'Escrow · Compraventa y liquidaciones',
  },
  {
    key: 'auction',
    label: 'WatchAuction',
    icon: 'hammer-outline',
    color: '#f59e0b',
    address: process.env.EXPO_PUBLIC_AUCTION_ADDRESS || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6',
    desc: 'Subastas con puja mínima',
  },
  {
    key: 'sig',
    label: 'Signature',
    icon: 'shield-checkmark-outline',
    color: '#10b981',
    address: process.env.EXPO_PUBLIC_SIGNATURE_VERIFIER_ADDRESS || '0x967187957d31d0912aE57cad1B51F764339AaEe6',
    desc: 'Verificación de seguridad NFC',
  },
  {
    key: 'usdc',
    label: 'MockUSDC',
    icon: 'cash-outline',
    color: '#22c55e',
    address: process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F',
    desc: 'Stablecoin de pagos (USDC)',
  },
];

function ContractsPanel({ colors }) {
  const [expanded,  setExpanded]  = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = async (key, address) => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <View style={{
      backgroundColor: colors.backgroundAlt,
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 18, overflow: 'hidden',
    }}>
      <View style={{ height: 2, backgroundColor: '#8b5cf6' }} />

      {/* Cabecera — siempre visible, pulsar para desplegar */}
      <Pressable
        onPress={() => setExpanded(e => !e)}
        style={[{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 13, gap: 10,
        }, Platform.OS === 'web' && { cursor: 'pointer' }]}
      >
        <View style={{
          width: 30, height: 30, borderRadius: 9,
          backgroundColor: '#8b5cf615', borderWidth: 1, borderColor: '#8b5cf640',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="code-slash-outline" size={15} color="#8b5cf6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Contratos desplegados</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {expanded ? 'Red local · Hardhat' : `${CONTRACTS.length} contratos · Red local · Hardhat`}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16} color={colors.textMuted}
        />
      </Pressable>

      {/* Contenido desplegable */}
      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
          {CONTRACTS.map(c => {
            const isCopied = copiedKey === c.key;
            return (
              <View key={c.key} style={{
                backgroundColor: colors.surface,
                borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 12, gap: 10,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 8,
                    backgroundColor: c.color + '18', borderWidth: 1, borderColor: c.color + '40',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ionicons name={c.icon} size={14} color={c.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.color, fontSize: 12, fontWeight: '700' }}>{c.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, lineHeight: 15 }}>{c.desc}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 7 }}>
                  <TouchableOpacity
                    onPress={() => handleCopy(c.key, c.address)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: isCopied ? '#10b98112' : colors.backgroundAlt,
                      borderRadius: 8, borderWidth: 1,
                      borderColor: isCopied ? '#10b98140' : colors.border,
                      paddingHorizontal: 9, paddingVertical: 6,
                    }}
                  >
                    <Ionicons
                      name={isCopied ? 'checkmark-circle' : 'copy-outline'}
                      size={12}
                      color={isCopied ? '#10b981' : colors.textMuted}
                    />
                    <Text style={{
                      color: isCopied ? '#10b981' : colors.textSecondary,
                      fontSize: 11, fontWeight: '600',
                      flexShrink: 1,
                    }} numberOfLines={1}>
                      {isCopied ? '¡Copiada!' : c.address}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`${EXPLORER_BASE}${c.address}`)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: '#8b5cf612',
                      borderRadius: 8, borderWidth: 1, borderColor: '#8b5cf630',
                      paddingHorizontal: 9, paddingVertical: 6,
                    }}
                  >
                    <Ionicons name="open-outline" size={12} color="#8b5cf6" />
                    <Text style={{ color: '#8b5cf6', fontSize: 11, fontWeight: '600' }}>Polygonscan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function AdminScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 900;
  const { user }   = route.params;

  const [loggedUser,       setLoggedUser]       = useState(user);
  const [users,            setUsers]            = useState([]);
  const [loadingUsers,     setLoadingUsers]     = useState(true);
  const [loadingWallet,    setLoadingWallet]    = useState(false);
  const [loadingPause,     setLoadingPause]     = useState(false);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activeSection,    setActiveSection]    = useState('pending');
  const [marketPaused,     setMarketPaused]     = useState(null);
  const [logisticsStatus,  setLogisticsStatus]  = useState(null);
  const [copiedLogistics,  setCopiedLogistics]  = useState(false);
  const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
  const [usdcBalance,      setUsdcBalance]      = useState(null);
  const [polBalance,       setPolBalance]       = useState(null);
  const [walletCopied,     setWalletCopied]     = useState(false);

  const fmt = (v, dec = 2) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });

  const fetchWalletBalances = useCallback(async (address) => {
    if (Platform.OS !== 'web' || !window.ethereum || !address) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const pol = await provider.getBalance(address);
      setPolBalance(fmt(ethers.formatEther(pol), 4));
      const usdcAddress = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS;
      if (usdcAddress) {
        const contract = new ethers.Contract(
          usdcAddress,
          ['function balanceOf(address) view returns (uint256)'],
          provider,
        );
        const usdc = await contract.balanceOf(address);
        setUsdcBalance(fmt(ethers.formatUnits(usdc, 6), 2));
      }
    } catch (e) {
      console.error('Admin wallet balance error:', e);
    }
  }, []);

  useEffect(() => {
    if (loggedUser?.wallet_address) fetchWalletBalances(loggedUser.wallet_address);
    else { setUsdcBalance(null); setPolBalance(null); }
  }, [loggedUser?.wallet_address, fetchWalletBalances]);

  const showAlert = (title, message, type = 'error') =>
    setAlert({ visible: true, title, message, type });
  const hideAlert = () => setAlert(a => ({ ...a, visible: false }));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (initial = false) => {
    try {
      if (initial) setLoadingUsers(true);
      const [resMe, resUsers, resLogistics, resMarket] = await Promise.all([
        api.get('/users/me'),
        api.get('/admin/users'),
        api.get('/admin/logistics-status').catch(() => ({ data: null })),
        api.get('/admin/marketplace-status').catch(() => ({ data: null })),
      ]);
      setLoggedUser(resMe.data);
      setUsers(resUsers.data);
      setLogisticsStatus(resLogistics.data);
      if (resMarket.data) setMarketPaused(resMarket.data.paused);
    } catch (e) {
      console.error('Admin fetch error:', e);
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchAll(true);
    const ws = new WebSocket(`${WS_URL}/ws/admin`);
    ws.onmessage = ({ data }) => {
      let type = data;
      try { type = JSON.parse(data)?.type ?? data; } catch {}
      if (
        type === 'update_users' ||
        type === 'new_user_registered' ||
        String(data).startsWith('new_role_request') ||
        type === 'marketplace_paused' ||
        type === 'marketplace_resumed'
      ) fetchAll(false);
    };
    ws.onerror = (e) => console.log('WS Admin error:', e?.message);
    return () => ws.close();
  }, [fetchAll]));

  // ── Acciones ───────────────────────────────────────────────────────────────
  const handleRoleAction = async (userId, action, role = null) => {
    try {
      if (action === 'revoke') {
        await api.post(`/admin/revoke-role/${userId}?role=${role}`);
        showAlert('Rol revocado', `Permiso de ${role} eliminado.`, 'success');
      } else {
        await api.post(`/admin/approve-role/${userId}?action=${action}`);
        showAlert(
          action === 'approve' ? '¡Aprobado!' : 'Rechazado',
          action === 'approve' ? 'El usuario ya tiene acceso a su panel.' : 'Solicitud rechazada.',
          action === 'approve' ? 'success' : 'info',
        );
      }
      fetchAll(false);
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo procesar la acción.', 'error');
    }
  };

  const handleToggleMarket = async () => {
    setLoadingPause(true);
    try {
      const { data } = await api.post(marketPaused ? '/admin/marketplace-resume' : '/admin/marketplace-pause');
      setMarketPaused(data.paused);
      showAlert(
        data.paused ? 'Marketplace pausado' : 'Marketplace reanudado',
        data.paused ? 'Las transacciones han sido bloqueadas.' : 'El marketplace vuelve a estar operativo.',
        data.paused ? 'warning' : 'success',
      );
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'No se pudo cambiar el estado.', 'error');
    } finally {
      setLoadingPause(false);
    }
  };

  const handleConnectWallet = async () => {
    if (Platform.OS !== 'web' || !window.ethereum)
      return showAlert('Atención', 'Usa un navegador con MetaMask.', 'warning');
    try {
      setLoadingWallet(true);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address  = accounts[0];
      const { data: { nonce } } = await api.post('/auth/challenge', { address });
      const signer    = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const signature = await signer.signMessage(nonce);
      const { data }  = await api.post('/auth/verify', { address, signature, nonce });
      setLoggedUser(data);
      showAlert('Wallet vinculada', 'Tu cuenta Web3 está conectada.', 'success');
    } catch (e) {
      showAlert('Error', e.response?.data?.detail || 'Error de conexión.', 'error');
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') localStorage.clear();
      else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('refreshToken');
        await SecureStore.deleteItemAsync('userData');
      }
    } catch {}
    navigation.replace('Login');
  };

  // ── Derivados ──────────────────────────────────────────────────────────────
  const allPending   = users.filter(u => u.requested_role && !u.is_admin);
  const particulares = users.filter(u => !u.is_admin && !u.roles?.some(r => ['DEALER','RELOJERO','FABRICANTE'].includes(r)));
  const stats = {
    total:       users.filter(u => !u.is_admin).length,
    pending:     allPending.length,
    relojeros:   users.filter(u => u.roles?.includes('RELOJERO')).length,
    dealers:     users.filter(u => u.roles?.includes('DEALER')).length,
    fabricantes: users.filter(u => u.roles?.includes('FABRICANTE')).length,
  };

  const SECTIONS = [
    { id: 'pending',     label: 'Solicitudes', icon: 'time-outline',       badge: stats.pending },
    { id: 'RELOJERO',    label: 'Relojeros',   icon: 'build-outline',      badge: stats.relojeros   || null },
    { id: 'DEALER',      label: 'Dealers',     icon: 'storefront-outline', badge: stats.dealers     || null },
    { id: 'FABRICANTE',  label: 'Fabricantes', icon: 'business-outline',   badge: stats.fabricantes || null },
    { id: 'users',       label: 'Particulares', icon: 'people-outline',    badge: particulares.length || null },
  ];

  const renderContent = () => {
    if (loadingUsers) return (
      <View style={{ alignItems: 'center', paddingVertical: 60 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>Cargando...</Text>
      </View>
    );

    if (activeSection === 'pending') {
      if (!allPending.length) return (
        <EmptyState icon="checkmark-circle-outline" title="Todo al día"
          subtitle="No hay solicitudes pendientes." color="#10b981" colors={colors} />
      );
      return allPending.map(u => {
        const meta = ROLE_META[u.requested_role] || { color: colors.primary };
        return <RequestCard key={u.id} user={u} roleColor={meta.color} colors={colors}
          onApprove={() => handleRoleAction(u.id, 'approve')}
          onReject={() => handleRoleAction(u.id, 'reject')} />;
      });
    }

    if (['RELOJERO','DEALER','FABRICANTE'].includes(activeSection)) {
      const meta   = ROLE_META[activeSection];
      const active = users.filter(u => u.roles?.includes(activeSection));
      if (!active.length) return (
        <EmptyState icon={`${meta.icon}-outline`} title={`Sin ${meta.label.toLowerCase()} aún`}
          subtitle="Aparecerán aquí cuando apruebes solicitudes." color={meta.color} colors={colors} />
      );
      return active.map(u => (
        <ActiveUserCard key={u.id} u={u} roleColor={meta.color} colors={colors}
          onRevoke={() => handleRoleAction(u.id, 'revoke', activeSection)} />
      ));
    }

    if (activeSection === 'users') {
      if (!particulares.length) return (
        <EmptyState icon="people-outline" title="Sin particulares"
          subtitle="No hay usuarios particulares registrados." color={colors.primary} colors={colors} />
      );
      return particulares.map(u => {
        const initials = (u.full_name || u.username || '?')
          .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return (
          <View key={u.id} style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.backgroundAlt,
            borderRadius: 12, borderWidth: 1, borderColor: colors.border,
            padding: 12, marginBottom: 8, gap: 10,
          }}>
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: `${colors.primary}10`, borderWidth: 1.5, borderColor: `${colors.primary}22`,
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{u.full_name || u.username}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>@{u.username} · {u.email}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : ''}
            </Text>
          </View>
        );
      });
    }

  };

  // ── Sidebar izquierdo ──────────────────────────────────────────────────────
  const sidebar = (
    <View style={{ width: isDesktop ? 300 : '100%', gap: 12 }}>

      {/* Perfil */}
      <View style={{
        backgroundColor: colors.backgroundAlt, borderRadius: 16,
        borderWidth: 1, borderColor: colors.border, padding: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: 'rgba(168,85,247,0.12)',
            borderWidth: 2, borderColor: 'rgba(168,85,247,0.3)',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Text style={{ color: '#a855f7', fontWeight: '800', fontSize: 18 }}>
              {(loggedUser?.username?.[0] || 'A').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {loggedUser?.username}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{loggedUser?.email}</Text>
          </View>
          <View style={{
            backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 8,
            paddingHorizontal: 8, paddingVertical: 4,
            borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
          }}>
            <Text style={{ color: '#a855f7', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>ADMIN</Text>
          </View>
        </View>

        {!loggedUser?.wallet_address ? (
          <TouchableOpacity
            onPress={handleConnectWallet} disabled={loadingWallet}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 12, paddingVertical: 10, borderRadius: 10,
              backgroundColor: '#F6851B18',
              borderWidth: 1, borderColor: '#F6851B35',
            }}
          >
            {loadingWallet
              ? <ActivityIndicator color="#F6851B" size="small" />
              : <>
                  <Ionicons name="wallet-outline" size={15} color="#F6851B" />
                  <Text style={{ color: '#F6851B', fontWeight: '700', fontSize: 13 }}>Conectar MetaMask</Text>
                </>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            {/* Dirección */}
            <TouchableOpacity
              onPress={async () => {
                await Clipboard.setStringAsync(loggedUser.wallet_address);
                setWalletCopied(true);
                setTimeout(() => setWalletCopied(false), 2000);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: '#10b98110', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 7,
                borderWidth: 1, borderColor: '#10b98122',
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' }} />
              <Text style={{
                flex: 1, color: colors.textSecondary, fontSize: 10,
                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              }} numberOfLines={1}>{loggedUser.wallet_address}</Text>
              <Ionicons
                name={walletCopied ? 'checkmark' : 'copy-outline'}
                size={12} color={walletCopied ? '#10b981' : colors.textMuted}
              />
            </TouchableOpacity>

            {/* Balances */}
            {(usdcBalance !== null || polBalance !== null) && (
              <View style={{
                flexDirection: 'row', gap: 8,
                backgroundColor: colors.surface, borderRadius: 10,
                borderWidth: 1, borderColor: colors.border,
                padding: 10,
              }}>
                {/* USDC */}
                <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>
                    USDC
                  </Text>
                  <Text style={{ color: '#22c55e', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 }}>
                    {usdcBalance ?? '—'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 9 }}>USD Coin</Text>
                </View>

                <View style={{ width: 1, backgroundColor: colors.border }} />

                {/* POL */}
                <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>
                    POL
                  </Text>
                  <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 }}>
                    {polBalance ?? '—'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 9 }}>Gas · Polygon</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Stats */}
      {!loadingUsers && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatCard icon="people"     value={stats.total}       label="Usuarios"    color={colors.primary}       colors={colors} />
          <StatCard icon="time"       value={stats.pending}     label="Pendientes"  color="#f59e0b"              colors={colors} />
          <StatCard icon="build"      value={stats.relojeros}   label="Relojeros"   color={roleColors.RELOJERO}   colors={colors} />
          <StatCard icon="storefront" value={stats.dealers}     label="Dealers"     color={roleColors.DEALER}     colors={colors} />
          <StatCard icon="business"   value={stats.fabricantes} label="Fab."        color={roleColors.FABRICANTE} colors={colors} />
        </View>
      )}

      {/* Marketplace + Logística */}
      {marketPaused !== null && (
        <MarketplaceCard
          paused={marketPaused}
          loading={loadingPause}
          onToggle={handleToggleMarket}
          logisticsStatus={logisticsStatus}
          copiedLogistics={copiedLogistics}
          onCopyLogistics={async () => {
            if (!logisticsStatus?.address) return;
            try { await Clipboard.setStringAsync(logisticsStatus.address); } catch {}
            setCopiedLogistics(true);
            setTimeout(() => setCopiedLogistics(false), 2000);
          }}
          colors={colors}
          onRefresh={() => fetchAll(false)}
        />
      )}

      {/* Comisiones */}
      <FeesCard colors={colors} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AdminHeader
        user={loggedUser}
        marketPaused={marketPaused}
        onLogout={handleLogout}
        colors={colors}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          maxWidth: isDesktop ? 1100 : undefined,
          alignSelf: 'center', width: '100%',
          padding: isDesktop ? 24 : 16,
          paddingBottom: 80,
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'flex-start' : 'stretch',
          gap: 20,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(false); }}
            tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {sidebar}

        {/* Panel derecho */}
        <View style={{ flex: 1, minWidth: 0 }}>

          {/* ── Contratos desplegados ── */}
          <ContractsPanel colors={colors} />

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {SECTIONS.map(sec => {
              const on = activeSection === sec.id;
              const c  = sec.id === 'pending' ? '#f59e0b'
                : sec.id === 'users' ? colors.primary
                : ROLE_META[sec.id]?.color || colors.primary;
              return (
                <Pressable key={sec.id} onPress={() => setActiveSection(sec.id)}
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5,
                    borderColor: on ? c : colors.border,
                    backgroundColor: on ? `${c}10` : colors.backgroundAlt,
                  }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                >
                  <Ionicons name={sec.icon} size={14} color={on ? c : colors.textSecondary} />
                  <Text style={{ color: on ? c : colors.textSecondary, fontWeight: on ? '700' : '500', fontSize: 13 }}>
                    {sec.label}
                  </Text>
                  {sec.badge > 0 && (
                    <View style={{
                      backgroundColor: sec.id === 'pending' ? '#f59e0b' : ROLE_META[sec.id]?.color || colors.primary,
                      borderRadius: 9, minWidth: 18, height: 18,
                      justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
                    }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{sec.badge}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Título sección */}
          {!loadingUsers && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{
                width: 3, height: 16, borderRadius: 2,
                backgroundColor: activeSection === 'pending' ? '#f59e0b'
                  : activeSection === 'users' ? colors.primary
                  : ROLE_META[activeSection]?.color || colors.primary,
              }} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                {activeSection === 'pending' && `${allPending.length} solicitud${allPending.length !== 1 ? 'es' : ''} pendiente${allPending.length !== 1 ? 's' : ''}`}
                {['RELOJERO','DEALER','FABRICANTE'].includes(activeSection) && `${users.filter(u => u.roles?.includes(activeSection)).length} ${ROLE_META[activeSection].label.toLowerCase()} activos`}
                {activeSection === 'users' && `${particulares.length} particular${particulares.length !== 1 ? 'es' : ''}`}

              </Text>
            </View>
          )}

          {renderContent()}
        </View>
      </ScrollView>

      {/* Modal alerta */}
      <Modal visible={alert.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: colors.backgroundAlt, borderRadius: 20,
            padding: 28, width: '85%', maxWidth: 340,
            alignItems: 'center', borderWidth: 1, borderColor: colors.border,
            ...(Platform.OS === 'web' && { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }),
          }}>
            <View style={{
              width: 60, height: 60, borderRadius: 30, marginBottom: 14,
              backgroundColor: `${alertColors[alert.type] || alertColors.info}12`,
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Ionicons
                name={alert.type === 'success' ? 'checkmark-circle' : alert.type === 'warning' ? 'warning' : alert.type === 'info' ? 'information-circle' : 'alert-circle'}
                size={32} color={alertColors[alert.type] || alertColors.info}
              />
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
              {alert.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 22 }}>
              {alert.message}
            </Text>
            <TouchableOpacity onPress={hideAlert} style={{
              backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 12, width: '100%', alignItems: 'center',
            }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle, color, colors }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: `${color}10`, borderWidth: 1.5, borderColor: `${color}20`,
        justifyContent: 'center', alignItems: 'center', marginBottom: 12,
      }}>
        <Ionicons name={icon} size={28} color={`${color}70`} />
      </View>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 5 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 240 }}>{subtitle}</Text>
    </View>
  );
}
