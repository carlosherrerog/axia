// src/screens/ProfessionalRequestScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Platform, Pressable, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEthProvider } from '../wallet/useEthProvider';
import api from '../api/api'; 
import { globalStyles, colors, roleColors, professionalRequestStyles as styles, alertStyles, alertColors } from '../themes/styles'; 
import GlobalHeader from '../components/GlobalHeader'; 

export default function ProfessionalRequestScreen({ navigation }) {
  const { ethProvider } = useEthProvider();
  const [selectedType, setSelectedType] = useState(null);
  const [hoveredType, setHoveredType] = useState(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [loggedUser, setLoggedUser] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'success',
    onConfirm: null
  });

  const accountTypes = [
    {
      id: 'DEALER', label: 'DEALER',
      description: 'Para compra-venta profesional de activos.',
      icon: 'cart-outline', color: roleColors.DEALER || '#f59e0b'
    },
    {
      id: 'RELOJERO', label: 'RELOJERO',
      description: 'Para certificar autenticidad y mantenimientos.',
      icon: 'build-outline', color: roleColors.RELOJERO || '#38bdf8'
    },
    {
      id: 'FABRICANTE', label: 'FABRICANTE',
      description: 'Para casas oficiales y creación de nuevos NFTs.',
      icon: 'business-outline', color: roleColors.FABRICANTE || '#e879f9'
    }
  ];

  const fetchUserData = async () => {
    try {
      const res = await api.get('/users/me');
      setLoggedUser(res.data);
      setUserRoles(res.data.roles || []);
    } catch (error) {
      console.error("Error obteniendo los datos del usuario:", error);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleConnectWallet = async () => {
    if (Platform.OS !== 'web' || !ethProvider) {
      showAlert("Atención", "Por favor, conecta tu wallet para continuar.", "warning");
      return;
    }
    try {
      const accounts = await ethProvider.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      const challengeRes = await api.post('/auth/challenge', { address });
      const { nonce } = challengeRes.data;
      const provider = new ethers.BrowserProvider(ethProvider);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(nonce);
      
      const verifyRes = await api.post('/auth/verify', { address, signature, nonce });
      if (verifyRes.status === 200) {
        setLoggedUser(verifyRes.data);
        showAlert("Wallet Vinculada", "Tu cuenta Web3 está lista.", "success");
      }
    } catch (error) {
      showAlert("Error", "No se pudo conectar la wallet.", "error");
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      const res = await api.post('/auth/disconnect');
      if (res.status === 200) {
        setLoggedUser({ ...loggedUser, wallet_address: null });
      }
    } catch (error) {
      console.error("Error al desvincular wallet:", error);
    }
  };

  const showAlert = (title, message, type, onConfirm = null) => {
    setAlertConfig({ visible: true, title, message, type, onConfirm });
  };

  const closeAlert = () => {
    const callback = alertConfig.onConfirm;
    setAlertConfig({ ...alertConfig, visible: false });
    if (callback) callback();
  };

  const handleSubmit = async () => {
    if (!selectedType) return;

    try {
      setLoading(true);
      await api.post('/users/request-role', {
        role: selectedType,
        message: requestMessage
      });

      showAlert(
        "¡Solicitud Enviada!", 
        "Los administradores revisarán tu caso pronto.", 
        "success", 
        () => navigation.navigate('Marketplace')
      );
      
    } catch (error) {
      let errorMsg = error.response?.data?.detail || error.message || "Error desconocido";
      showAlert("Error de Envío", String(errorMsg), "error");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader 
        loggedUser={loggedUser}
        onConnect={handleConnectWallet}
        onDisconnect={handleDisconnectWallet}
        title="Solicitud Profesional"
        navigation={navigation}
      />

      <View style={[styles.header, { borderBottomWidth: 0 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Formulario de Aplicación</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        
        <Text style={styles.instructions}>
          Selecciona el perfil que mejor se adapte a tu actividad profesional en la plataforma.
        </Text>

        {accountTypes.map(type => {
          const alreadyHasRole = userRoles.includes(type.id);
          const isSelected = selectedType === type.id;
          
          // Solo se bloquea si el usuario ya tiene ese rol
          const isDisabled = alreadyHasRole; 
          const isHovered = hoveredType === type.id && !isDisabled;

          return (
            <Pressable
              key={type.id}
              disabled={isDisabled}
              onPress={() => setSelectedType(prev => prev === type.id ? null : type.id)}
              onHoverIn={() => Platform.OS === 'web' && setHoveredType(type.id)}
              onHoverOut={() => Platform.OS === 'web' && setHoveredType(null)}
              style={[
                styles.card,
                isDisabled && { 
                  opacity: 0.4, 
                  backgroundColor: colors.background, 
                  borderColor: colors.border 
                },
                !isDisabled && {
                  borderColor: isSelected ? type.color : isHovered ? `${type.color}80` : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                  backgroundColor: isSelected ? `${type.color}15` : isHovered ? `${type.color}25` : colors.backgroundAlt,
                  transform: [
                    { scale: (isHovered && !isSelected) ? 1.02 : 1 },
                    { translateY: (isHovered && !isSelected) ? -3 : 0 }
                  ],
                  ...(Platform.OS === 'web' && isHovered && !isSelected && {
                    boxShadow: `0 10px 25px -5px ${type.color}40`,
                  })
                }
              ]}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.iconContainer, { backgroundColor: isDisabled ? colors.surface : `${type.color}20` }]}>
                  <Ionicons name={type.icon} size={24} color={isDisabled ? colors.textSecondary : type.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, isHovered && {color: type.color}]}>
                    {type.label}
                  </Text>
                  <Text style={styles.cardDescription}>{type.description}</Text>
                </View>

                <View style={[styles.checkCircle, { 
                  borderColor: isSelected ? type.color : (alreadyHasRole ? 'transparent' : colors.border),
                  backgroundColor: isSelected ? type.color : 'transparent',
                }]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  {alreadyHasRole && <Ionicons name="checkmark-done" size={18} color={colors.textSecondary} />}
                </View>
              </View>
              
              {alreadyHasRole && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8, fontStyle: 'italic', textAlign: 'right' }}>
                  Rol ya activo en tu cuenta
                </Text>
              )}
            </Pressable>
          );
        })}

        <Text style={styles.textAreaTitle}>Describe tu actividad profesional</Text>
        <TextInput
          multiline
          numberOfLines={6}
          placeholder="Escribe aquí los detalles de tu solicitud..."
          placeholderTextColor={colors.textSecondary}
          style={styles.textArea}
          value={requestMessage}
          onChangeText={setRequestMessage}
        />

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[
              globalStyles.primaryButton, 
              { marginTop: 0 }, 
              (!selectedType || loading) && { backgroundColor: colors.border, opacity: 0.5, shadowOpacity: 0, elevation: 0 }
            ]}
            disabled={!selectedType || loading}
            onPress={handleSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={globalStyles.buttonText}>Enviar Solicitud</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={alertConfig.visible} transparent animationType="fade">
        <View style={alertStyles.overlay}>
          <View style={alertStyles.alertBox}>
            <Ionicons 
              name={alertConfig.type === 'success' ? "checkmark-circle" : (alertConfig.type === 'warning' ? "warning" : "alert-circle")} 
              size={55} 
              color={alertConfig.type === 'success' ? alertColors.success : (alertConfig.type === 'warning' ? alertColors.warning : alertColors.error)} 
            />
            <Text style={alertStyles.title}>{alertConfig.title}</Text>
            <Text style={alertStyles.message}>{alertConfig.message}</Text>
            
            <TouchableOpacity 
              onPress={closeAlert} 
              style={[
                globalStyles.primaryButton, 
                alertStyles.singleButton,
                alertConfig.type === 'error' && { backgroundColor: alertColors.error },
                alertConfig.type === 'warning' && { backgroundColor: alertColors.warning }
              ]}
            >
              <Text style={globalStyles.buttonText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}