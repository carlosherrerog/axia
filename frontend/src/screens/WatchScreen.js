// src/screens/WatchScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
         Image, Platform, Alert, Modal, Switch, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store'; 
import api, { WS_URL } from '../api/api.js';
import { globalStyles, colors, watchScreenStyles, alertColors, roleColors, alertStyles,
         WATCH_STATES} from '../themes/styles.js';

import WatchNFT_ABI from '../contracts/WatchNFT.json';
import Marketplace_ABI from '../contracts/WatchMarketplace.json';
import UserAndWatchCard from '../components/UserAndWatchCard';
import GlobalHeader from '../components/GlobalHeader';
import { resolveImageUri } from '../utils/ipfs';

const NFT_ADDRESS         = process.env.EXPO_PUBLIC_WATCH_NFT_ADDRESS     || '0xbBfCa1b8404Dc43238C4A359E8454632f00c292F';
const MARKETPLACE_ADDRESS = process.env.EXPO_PUBLIC_MARKETPLACE_ADDRESS   || '0xe7Be5Fd0162f7f2fbC5851FB9DC2f5b4b81F63d6';
const AUCTION_ADDRESS     = process.env.EXPO_PUBLIC_AUCTION_ADDRESS        || '0x701EAa91aeB8588694B116C004D1EaAC7f55F2F2';
const USDC_ADDRESS        = process.env.EXPO_PUBLIC_PAYMENT_TOKEN_ADDRESS  || '0x967187957d31d0912aE57cad1B51F764339AaEe6';
const POLYGONSCAN_BASE    = 'https://amoy.polygonscan.com';

// ABI mínimo para aprobar el token USDC
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function balanceOf(address account) public view returns (uint256)"
];

export default function WatchScreen({ route, navigation }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const { watchId, initialTab = 'details', isBuyer = false } = route.params || {};
  const [activeTab, setActiveTab] = useState(initialTab);
  const [watchData, setWatchData] = useState(null);
  const [listingData, setListingData] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [cancellingListing, setCancellingListing] = useState(false);
  const [sellPrice, setSellPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // --- ESTADOS DE SEGURIDAD ---
  const [changingStateId, setChangingStateId] = useState(null);

  // --- OVERLAY METAMASK ---
  const [metaMaskLoading, setMetaMaskLoading] = useState(false);

  // --- ESTADOS DE PRIVACIDAD ---
  const [isPublic, setIsPublic] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [publicWarningModalVisible, setPublicWarningModalVisible] = useState(false);

  // --- ESTADOS DE ADVERTENCIA MARKETPLACE ---
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [dontShowWarningAgain, setDontShowWarningAgain] = useState(false); 
  const [checkboxChecked, setCheckboxChecked] = useState(false); 

  // --- ESTADOS PARA LA TRANSFERENCIA P2P ---
  const [appUsers, setAppUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [transferSuccessVisible, setTransferSuccessVisible] = useState(false);
  const [deliverySuccessVisible, setDeliverySuccessVisible] = useState(false);
  const [loggedUser, setLoggedUser] = useState(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHoveringImg, setIsHoveringImg] = useState(false);
  const [requestingReverification, setRequestingReverification] = useState(false);

  
  const currentStateId = watchData?.security_state || 0;
  const currentStateInfo = WATCH_STATES[currentStateId] || WATCH_STATES[0];
  const isManufacturer  = loggedUser?.roles?.includes('FABRICANTE');
  const isDealer        = loggedUser?.roles?.includes('DEALER');
  const isTrustedSeller = isManufacturer || isDealer; // sin fianza ni comisión relojero

  // 1. EL QUE YA TENÍAS PARA EL AVISO
  useEffect(() => {
    const checkWarningPreference = async () => {
      try {
        let pref;
        if (Platform.OS === 'web') {
          pref = localStorage.getItem('hidePublicWarning');
        } else {
          pref = await SecureStore.getItemAsync('hidePublicWarning');
        }
        if (pref === 'true') {
          setDontShowWarningAgain(true);
        }
      } catch (error) {
        console.error("Error leyendo preferencias", error);
      }
    };
    checkWarningPreference();
  }, []);

  // 2. EL NUEVO PARA CARGAR LOS USUARIOS EN LA TRANSFERENCIA
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        setLoadingUsers(true);
        const res = await api.get('/users'); 
        setAppUsers(res.data);
      } catch (error) {
        console.error("Error obteniendo usuarios para transferencia:", error);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (activeTab === 'transfer' || activeTab === 'history') {
      fetchAllUsers();
    }
  }, [activeTab]);

  useEffect(() => {
  }, [activeTab, watchId]);

  const fetchLoggedUser = async () => {
    try {
      const res = await api.get('/users/me');
      setLoggedUser(res.data);
    } catch (e) {
      console.error("Error obteniendo loggedUser", e);
    }
  };

  const fetchWatchDetails = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      
      // 1. Pedimos los datos base del reloj
      const resNft = await api.get(`/nfts/${watchId}`);
      setWatchData(resNft.data);
      
      // 2. Pedimos SIEMPRE los datos del anuncio. 
      // Si el reloj no está a la venta (falla la petición), lo atrapamos y devolvemos null.
      try {
        const resListing = await api.get(`/nfts/${watchId}/listing`);
        setListingData(resListing.data);
      } catch (err) {
        setListingData(null);
      }
      
      const publicStatus = resNft.data.is_public;
      setIsPublic(publicStatus === 1 || publicStatus === true);
      
    } catch (error) {
      console.error("Error obteniendo datos del reloj:", error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [watchId]);

  useFocusEffect(
    useCallback(() => {
      fetchLoggedUser();
      fetchWatchDetails(); // Carga inicial (con pantalla de carga)
      
      const ws = new WebSocket(`${WS_URL}/ws/admin`);
      ws.onmessage = (event) => {
        if (event.data === "update_users" || event.data === "update_nfts" || event.data === "update_marketplace") {
          // Si el aviso viene del WebSocket, recargamos los datos en SILENCIO (true)
          // Esto actualizará el Switch y los textos mágicamente sin pestañear
          fetchWatchDetails(true); 
        }
      };
      
      return () => { if (ws) ws.close(); };
    }, [fetchWatchDetails])
  );

  const handleToggleSwitch = () => {
    if (listingData?.is_listed && isPublic) {
      Alert.alert("Acción no permitida", "No puedes hacer privado un reloj que está a la venta en el Marketplace.");
      return;
    }
    if (!isPublic) {
      setPublicWarningModalVisible(true);
    } else {
      executeTogglePrivacy(false);
    }
  };

  const executeTogglePrivacy = async (newPublicState) => {
    setPublicWarningModalVisible(false);
    try {
      setTogglingPrivacy(true);
      const response = await api.patch(`/nfts/${watchId}/privacy`, {
        is_public: newPublicState
      });
      // El servidor responde bien, cambiamos el estado local asegurando el booleano
      const serverStatus = response.data.is_public;
      setIsPublic(serverStatus === 1 || serverStatus === true);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo actualizar la privacidad del reloj.");
      setIsPublic(!newPublicState); 
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const handlePreListCheck = () => {
    if (!sellPrice || isNaN(sellPrice) || Number(sellPrice) <= 0) {
      Alert.alert("Atención", "Introduce un precio válido.");
      return;
    }

    if (Platform.OS !== 'web' || !window.ethereum) {
      Alert.alert("MetaMask requerido", "Es necesario firmar la transacción desde un navegador con MetaMask.");
      return;
    }

    if (dontShowWarningAgain) {
      executeListForSale();
    } else {
      setCheckboxChecked(false);
      setWarningModalVisible(true);
    }
  };

  const executeListForSale = async () => {
    setWarningModalVisible(false); 

    if (checkboxChecked) {
      try {
        if (Platform.OS === 'web') {
          localStorage.setItem('hidePublicWarning', 'true');
        } else {
          await SecureStore.setItemAsync('hidePublicWarning', 'true');
        }
        setDontShowWarningAgain(true);
      } catch (e) { console.error("Error guardando preferencia", e); }
    }

    try {
      setActionLoading(true);
      setMetaMaskLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Definimos los 3 contratos necesarios
      const nftContract = new ethers.Contract(NFT_ADDRESS, WatchNFT_ABI.abi, signer);
      const marketplaceContract = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      const priceInWei = ethers.parseUnits(sellPrice, 6); 

      // --- PASO 1: APROBAR EL TOKEN USDC (Fianza del vendedor) — solo para particulares ---
      if (!isManufacturer) {
        const sellerDeposit = (priceInWei * 200n) / 10000n;
        const signerAddress = await signer.getAddress();
        const usdcBalance = await usdcContract.balanceOf(signerAddress);
        if (usdcBalance < sellerDeposit) {
          const needed = (Number(sellerDeposit) / 1e6).toFixed(2);
          throw new Error(`Necesitas al menos ${needed} USDC como fianza para listar. Saldo actual: ${(Number(usdcBalance) / 1e6).toFixed(2)} USDC.`);
        }
        const usdcApproveTx = await usdcContract.approve(MARKETPLACE_ADDRESS, sellerDeposit);
        await usdcApproveTx.wait();
      }

      // --- PASO 2: APROBAR EL NFT ---
      console.log("Aprobando transferencia del NFT...");
      const nftApproveTx = await nftContract.approve(MARKETPLACE_ADDRESS, watchId);
      await nftApproveTx.wait();

      // --- PASO 3: LISTAR EN BLOCKCHAIN ---
      console.log("Enviando listado al Smart Contract...");
      const listTx = await marketplaceContract.listWatch(watchId, priceInWei);
      const receipt = await listTx.wait();

      // --- PASO 4: REGISTRAR EN EL BACKEND ---
      await api.post(`/nfts/${watchId}/list`, {
        price_usdc: parseFloat(sellPrice),
        tx_hash: receipt.hash
      });

      navigation.goBack();
      setSellPrice('');

    } catch (error) {
      console.error("Error en el listado:", error);
      if (error.code === 'ACTION_REJECTED') {
        Alert.alert("Cancelado", "Has rechazado la transacción.");
      } else {
        Alert.alert("Error", "La transacción falló. Asegúrate de tener saldo suficiente para el gas y la fianza.");
      }
      setActionLoading(false);
    } finally {
      setMetaMaskLoading(false);
    }
  };

  const handleCancelListing = async () => {
    try {
      setCancellingListing(true);
      setMetaMaskLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const marketplaceContract = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);

      const tx = await marketplaceContract.cancelListing(watchId);
      await tx.wait();

      await api.post(`/nfts/${watchId}/cancel`, {
        tx_hash: tx.hash
      });
      
      // 1. Navegamos hacia atrás INMEDIATAMENTE para salir de la pantalla de detalles
      // antes de que el WebSocket choque con la interfaz.
      navigation.goBack();

    } catch (error) {
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        Alert.alert("Transacción Cancelada", "Has rechazado la firma de la transacción en MetaMask.");
      } else {
        console.error(error);
        Alert.alert("Error", "No se pudo cancelar el anuncio. Inténtalo de nuevo.");
      }
      setCancellingListing(false);
    } finally {
      setMetaMaskLoading(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!newPrice || isNaN(newPrice) || Number(newPrice) <= 0) {
      Alert.alert("Atención", "Introduce un precio válido.");
      return;
    }

    try {
      setUpdatingPrice(true);
      setMetaMaskLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const marketplaceContract = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      const priceInWei = ethers.parseUnits(newPrice, 6);
      const currentPriceInWei = ethers.parseUnits(
        (listingData?.price ? Number(listingData.price) / 1_000_000 : 0).toString(), 6
      );

      // Si el nuevo precio es mayor y es una venta P2P, hay que re-aprobar el depósito
      // ya que el contrato extrae el 2% del vendedor cuando alguien compra
      if (!isManufacturer && listingData?.is_p2p !== false && priceInWei > currentPriceInWei) {
        const newDeposit = (priceInWei * 200n) / 10000n;
        const approveTx = await usdcContract.approve(MARKETPLACE_ADDRESS, newDeposit);
        await approveTx.wait();
      }

      const tx = await marketplaceContract.updateListingPrice(watchId, priceInWei);
      await tx.wait();

      await api.put(`/nfts/${watchId}/update-price`, { 
        new_price_usdc: parseFloat(newPrice),
        tx_hash: tx.hash
      });

      const priceInEnteros = Math.round(parseFloat(newPrice) * 1000000);
      setListingData(prev => ({ ...prev, price: priceInEnteros }));
      setNewPrice('');
      await fetchWatchDetails();
      
      Alert.alert("Éxito", "Precio actualizado correctamente.", [{ text: "OK", onPress: () => setActiveTab('details') }]);
    } catch (error) {
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        Alert.alert("Transacción Cancelada", "No se ha modificado el precio porque cancelaste la firma.");
      } else {
        console.error(error);
        Alert.alert("Error", "Ocurrió un error al intentar actualizar el precio.");
      }
    } finally {
      setUpdatingPrice(false);
      setMetaMaskLoading(false);
    }
  };

  const handleRequestReverification = async () => {
    setRequestingReverification(true);
    try {
      await api.post(`/marketplace/request-reverification/${watchId}`);
      Alert.alert(
        'Re-verificación solicitada',
        'Se ha asignado un relojero para certificar tu reloj. Recibirás una notificación cuando concluya.'
      );
      fetchWatchDetails();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || 'No se pudo solicitar la re-verificación.');
    } finally {
      setRequestingReverification(false);
    }
  };

  const handleChangeSecurityState = async (newStateId) => {
    // 1. Comprobamos directamente el objeto listingData
    if (listingData?.is_listed) {
      Alert.alert(
        "Acción no permitida", 
        "Debes cancelar el anuncio en la pestaña 'Datos Anuncio' antes de reportar el reloj como robado o perdido."
      );
      return; // Detenemos la ejecución aquí
    }

    if (Platform.OS !== 'web' || !window.ethereum) {
      Alert.alert("MetaMask requerido", "Es necesario firmar la transacción desde un navegador.");
      return;
    }

    setChangingStateId(newStateId);
    setMetaMaskLoading(true);
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const nftContract = new ethers.Contract(NFT_ADDRESS, WatchNFT_ABI.abi, signer);

      const tx = await nftContract.changeSecurityState(watchId, newStateId);
      await tx.wait();

      await api.patch(`/nfts/${watchId}/security-state`, {
        state: newStateId,
        tx_hash: tx.hash,
      });

      Alert.alert("Éxito", "El estado de seguridad ha sido actualizado en la blockchain.");
      fetchWatchDetails();
    } catch (error) {
      if (error.code === 'ACTION_REJECTED' || error.code === 4001 || error.code === 'ACTION_REJECTED') {
        Alert.alert("Cancelado", "Rechazaste la firma de la transacción.");
      } else {
        console.error("Error cambiando estado:", error);
        Alert.alert("Error", error.reason || error.message || "No se pudo actualizar el estado.");
      }
    } finally {
      setChangingStateId(null);
      setMetaMaskLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (Platform.OS !== 'web' || !window.ethereum) {
      Alert.alert("MetaMask requerido", "Necesitas MetaMask conectado para confirmar la entrega.");
      return;
    }
    try {
      setActionLoading(true);
      setMetaMaskLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace_ABI.abi, signer);

      const tx = await marketplace.confirmDelivery(watchId);
      await tx.wait();

      await api.post(`/marketplace/confirm-delivery/${watchId}`);

      setDeliverySuccessVisible(true);
    } catch (error) {
      if (error.code === 'ACTION_REJECTED') {
        Alert.alert("Cancelado", "Operación cancelada en MetaMask.");
      } else {
        Alert.alert("Error", error.response?.data?.detail || error.message || "No se pudo confirmar la entrega.");
      }
    } finally {
      setActionLoading(false);
      setMetaMaskLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[globalStyles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.textSecondary }}>Cargando datos del NFT...</Text>
      </View>
    );
  }

  if (!watchData) {
    return (
      <View style={[globalStyles.container, { justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <Ionicons name="watch-outline" size={48} color={colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Reloj no encontrado</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
          Este reloj no está importado en tu cuenta o no existe en la base de datos.
        </Text>
      </View>
    );
  }

  const handleTransfer = async (recipientWallet) => {
    // 1. AVISO SI NO HAY DESTINATARIO (Para que MetaMask no falle en silencio)
    if (!recipientWallet) {
      if (Platform.OS === 'web') {
        window.alert("Atención: Por favor, selecciona un usuario de la lista.");
      } else {
        Alert.alert("Atención", "Por favor, selecciona un usuario de la lista.");
      }
      return;
    }

    if (isListed) {
      Alert.alert("Acción denegada", "No puedes transferir un reloj que está listado en el Marketplace. Cancela el anuncio primero.");
      return;
    }

    if (currentStateId !== 0) {
      Alert.alert("Acción denegada", `El reloj está marcado como ${currentStateInfo.label.toLowerCase()}. La transferencia está bloqueada.`);
      return;
    }

    if (Platform.OS !== 'web' || !window.ethereum) {
      Alert.alert("MetaMask requerido", "Es necesario firmar la transacción desde un navegador.");
      return;
    }

    try {
      setActionLoading(true);
      setMetaMaskLoading(true);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      const nftContract = new ethers.Contract(NFT_ADDRESS, WatchNFT_ABI.abi, signer);

      const tx = await nftContract.transferFrom(userAddress, recipientWallet, watchId);
      await tx.wait(); 

      await api.post(`/nfts/${watchId}/transfer`, {
        new_owner: recipientWallet,
        tx_hash: tx.hash
      });

      setActionLoading(false);
      
      setTransferSuccessVisible(true);

    } catch (error) {
      setActionLoading(false);
      setMetaMaskLoading(false);
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        if (Platform.OS === 'web') {
          window.alert("Cancelado: Has rechazado la firma de la transacción.");
        } else {
          Alert.alert("Cancelado", "Has rechazado la firma de la transacción.");
        }
      } else {
        console.error("Error en la transferencia:", error);
        if (Platform.OS === 'web') {
          window.alert("Error: No se pudo completar la transferencia.");
        } else {
          Alert.alert("Error", "No se pudo completar la transferencia. Inténtalo de nuevo.");
        }
      }
    } finally {
      setMetaMaskLoading(false);
    }
  };

  const isListed = listingData && (listingData.is_listed === 1 || listingData.is_listed === true);
  const hasWallet = !!loggedUser?.wallet_address;
  const formattedPrice = listingData?.price
    ? (Number(listingData.price) / 1000000).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : '0';

  const isAltered        = currentStateId === 4;
  const isSecurityBlocked = currentStateId === 1 || currentStateId === 2; // robado o perdido

  let currentTab = activeTab;
  if (isListed && activeTab === 'sell') currentTab = 'listing_data';
  if (isAltered && !['details', 'security', 'history'].includes(currentTab)) currentTab = 'security';

  const tabsToRender = isBuyer
    ? ['details', 'confirm_receipt', 'history']
    : isAltered
      ? ['details', 'security', 'history']
      : isListed
        ? ['details', 'listing_data', 'security', 'history']
        : isSecurityBlocked
          ? ['details', 'security', 'history']
          : ['details', 'sell', 'transfer', 'security', 'history'];

  const handleImgMouseMove = Platform.OS === 'web' ? (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientY - rect.top)  / rect.height - 0.5) * -22;
    const y = ((e.clientX - rect.left) / rect.width  - 0.5) *  22;
    setTilt({ x, y });
  } : null;

  const handleImgMouseLeave = Platform.OS === 'web' ? () => {
    setTilt({ x: 0, y: 0 });
    setIsHoveringImg(false);
  } : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlobalHeader
        loggedUser={loggedUser}
        title={watchData ? `${watchData.brand} ${watchData.model}` : `Reloj #${watchId}`}
        navigation={navigation}
        onWalletChange={setLoggedUser}
        onWalletDisconnect={() => navigation.navigate('Perfil')}
      />

      <TouchableOpacity
        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Marketplace')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Volver</Text>
      </TouchableOpacity>

    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ paddingHorizontal: isDesktop ? 24 : 16, paddingVertical: 20, maxWidth: 1100, alignSelf: 'center', width: '100%' }}>
        <View style={[
          watchScreenStyles.contentCard,
          { padding: 0, overflow: 'hidden', marginBottom: 20 },
          (isSecurityBlocked || isAltered) && {
            borderColor: currentStateInfo.color,
            borderWidth: 2,
            shadowColor: currentStateInfo.color,
            shadowOpacity: 0.35,
            shadowRadius: 16,
          },
        ]}>
          {/* Banner de alerta estado de seguridad */}
          {(isSecurityBlocked || isAltered) && (
            <View style={{
              backgroundColor: currentStateInfo.color + '22',
              borderBottomWidth: 1,
              borderBottomColor: currentStateInfo.color + '60',
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Ionicons name={currentStateInfo.icon} size={16} color={currentStateInfo.color} />
              <Text style={{ color: currentStateInfo.color, fontWeight: '700', fontSize: 13, letterSpacing: 0.4 }}>
                {currentStateInfo.label.toUpperCase()}
              </Text>
              <Text style={{ color: currentStateInfo.color + 'cc', fontSize: 12, flex: 1 }}>
                — {currentStateInfo.desc}
              </Text>
            </View>
          )}

          {Platform.OS === 'web' ? (
            <div
              onMouseMove={handleImgMouseMove}
              onMouseEnter={() => setIsHoveringImg(true)}
              onMouseLeave={handleImgMouseLeave}
              style={{
                height: 420, backgroundColor: colors.surface,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                perspective: '900px',
                position: 'relative',
              }}
            >
              <img
                src={resolveImageUri(watchData?.image) || 'https://via.placeholder.com/400?text=Sin+Imagen'}
                style={{
                  width: '55%', height: '100%', objectFit: 'contain',
                  transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHoveringImg ? 1.04 : 1})`,
                  transition: 'transform 0.12s ease-out',
                  willChange: 'transform',
                  filter: (isSecurityBlocked || isAltered)
                    ? `drop-shadow(0 0 24px ${currentStateInfo.color}88)`
                    : isHoveringImg ? 'drop-shadow(0 20px 40px rgba(139,92,246,0.35))' : 'none',
                  opacity: (isSecurityBlocked || isAltered) ? 0.75 : 1,
                }}
                alt="watch"
              />
            </div>
          ) : (
            <View style={{ height: 420, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
              <Image
                source={{ uri: resolveImageUri(watchData?.image) || 'https://via.placeholder.com/400?text=Sin+Imagen' }}
                style={{ width: '55%', height: '100%', opacity: (isSecurityBlocked || isAltered) ? 0.75 : 1 }}
                resizeMode="contain"
              />
            </View>
          )}
          
          <View style={watchScreenStyles.tabRow}>
            {tabsToRender.map((tab) => {
              const tabMeta = {
                details:         { label: 'Detalles',         icon: 'information-circle-outline' },
                listing_data:    { label: 'Anuncio',          icon: 'pricetag-outline' },
                sell:            { label: 'Vender',           icon: 'cash-outline' },
                transfer:        { label: 'Enviar',           icon: 'paper-plane-outline' },
                security:        { label: 'Seguridad',        icon: 'shield-outline' },
                history:         { label: 'Historial',        icon: 'time-outline' },
                confirm_receipt: { label: 'Confirmar recibo', icon: 'checkmark-circle-outline' },
              }[tab] || { label: tab, icon: 'ellipsis-horizontal' };
              const isActive = currentTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    watchScreenStyles.tabButton,
                    {
                      borderBottomWidth: (isActive && !isSecurityBlocked && !isAltered) ? 2 : 0,
                      borderBottomColor: isActive ? colors.primary : 'transparent',
                      backgroundColor: (isActive && (isSecurityBlocked || isAltered)) ? currentStateInfo.color + '18' : 'transparent',
                      alignItems: 'center', gap: 3,
                    }
                  ]}
                >
                  <Ionicons
                    name={isActive ? tabMeta.icon.replace('-outline', '') : tabMeta.icon}
                    size={14}
                    color={isActive ? ((isSecurityBlocked || isAltered) ? currentStateInfo.color : colors.primary) : colors.textMuted}
                  />
                  <Text style={{
                    fontSize: 11, fontWeight: isActive ? '700' : '400',
                    color: isActive ? ((isSecurityBlocked || isAltered) ? currentStateInfo.color : colors.primary) : colors.textSecondary,
                    letterSpacing: 0.3,
                  }}>
                    {tabMeta.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* --- PESTAÑA DETALLES CON EL SWITCH DE PRIVACIDAD --- */}
        {currentTab === 'details' && (
          <View style={watchScreenStyles.contentCard}>
            <Text style={watchScreenStyles.sectionTitle}>
              {watchData?.brand ? `${watchData.brand} ${watchData.model}` : watchData?.model || 'Modelo'}
            </Text>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Marca:</Text>
              <Text style={watchScreenStyles.detailValue}>{watchData?.brand || 'N/A'}</Text>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Modelo:</Text>
              <Text style={watchScreenStyles.detailValue}>{watchData?.model || 'N/A'}</Text>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Número de Serie:</Text>
              <Text style={watchScreenStyles.detailValue}>{watchData?.serialNumber || 'N/A'}</Text>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Año de Fabricación:</Text>
              <Text style={watchScreenStyles.detailValue}>{watchData?.manufacturingYear || 'N/A'}</Text>
            </View>

            {watchData?.mint_date && (
              <View style={watchScreenStyles.detailRow}>
                <Text style={watchScreenStyles.detailLabel}>Última Verificación:</Text>
                <Text style={[watchScreenStyles.detailValue, { color: colors.primaryLight, fontWeight: '600' }]}>
                  {new Date(watchData.mint_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            )}

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Estado Blockchain:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={currentStateInfo.icon} size={14} color={currentStateInfo.color} />
                <Text style={[watchScreenStyles.detailValue, { fontWeight: 'bold', color: currentStateInfo.color }]}>
                  {currentStateId === 0 ? 'En propiedad' : currentStateInfo.label}
                </Text>
              </View>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Estado Marketplace:</Text>
              <Text style={[watchScreenStyles.detailValue, { fontWeight: 'bold', color: isListed ? colors.primaryLight : isPublic ? '#10b981' : colors.textSecondary }]}>
                {isListed ? 'En Venta' : isPublic ? 'Público' : 'Privado'}
              </Text>
            </View>

            {/* --- SECCIÓN PRIVACIDAD --- */}
            <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderColor: colors.border }}>
              {isAltered && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: '#f9731612', borderRadius: 10, borderWidth: 1,
                  borderColor: '#f9731630', padding: 10, marginBottom: 12,
                }}>
                  <Ionicons name="lock-closed" size={14} color="#f97316" />
                  <Text style={{ color: '#f97316', fontSize: 12, flex: 1, lineHeight: 17 }}>
                    Visibilidad bloqueada hasta que el reloj supere la certificación.
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>

                {/* Textos descriptivos */}
                <View style={{ flex: 1, paddingRight: 15 }}>
                  <Text style={[watchScreenStyles.detailLabel, { width: '100%', marginBottom: 4 }]}>Visibilidad Pública:</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                    {isAltered
                      ? 'Privado. Bloqueado por estado de alteración.'
                      : (isPublic || isListed)
                        ? (isListed
                            ? 'Público por estar a la venta en el Marketplace.'
                            : 'Los datos de este reloj son visibles para otros usuarios en la plataforma.')
                        : 'Privado. Solo tú tienes acceso a la información de este activo.'}
                  </Text>
                </View>

                {/* Interruptor Customizado Fluido */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleToggleSwitch}
                  disabled={isListed || togglingPrivacy || isAltered}
                  style={{
                    width: 54,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: isAltered
                      ? 'rgba(249,115,22,0.12)'
                      : (isPublic || isListed)
                        ? (isListed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.25)')
                        : colors.surface,
                    borderWidth: 1,
                    borderColor: isAltered
                      ? 'rgba(249,115,22,0.35)'
                      : (isPublic || isListed)
                        ? (isListed ? 'rgba(56, 189, 248, 0.3)' : '#38bdf8')
                        : colors.border,
                    padding: 2,
                    flexDirection: 'row',
                    justifyContent: (isPublic || isListed || isAltered) ? 'flex-end' : 'flex-start',
                    alignItems: 'center',
                    opacity: (togglingPrivacy || isAltered) ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: isAltered
                        ? 'rgba(249,115,22,0.5)'
                        : (isPublic || isListed)
                          ? (isListed ? 'rgba(56, 189, 248, 0.5)' : '#38bdf8')
                          : colors.textSecondary,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {togglingPrivacy ? (
                      <ActivityIndicator size={12} color="#fff" />
                    ) : (isListed || isAltered) ? (
                      <Ionicons name="lock-closed" size={12} color="#fff" />
                    ) : null}
                  </View>
                </TouchableOpacity>

              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />

            <View style={[watchScreenStyles.detailRow, { alignItems: 'flex-start' }]}>
              <Text style={watchScreenStyles.detailLabel}>Dirección del contrato:</Text>
              <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Text style={{ color: colors.primaryLight, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, textAlign: 'right' }}>
                  {NFT_ADDRESS || '0x...'}
                </Text>
                <Ionicons name="copy-outline" size={14} color={colors.primaryLight} />
              </TouchableOpacity>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>ID del Token:</Text>
              <Text style={watchScreenStyles.detailValue}>{watchId}</Text>
            </View>

            <View style={watchScreenStyles.detailRow}>
              <Text style={watchScreenStyles.detailLabel}>Estándar de token:</Text>
              <Text style={watchScreenStyles.detailValue}>ERC721</Text>
            </View>
          </View>
        )}

        {/* --- PESTAÑA DATOS ANUNCIO --- */}
        {currentTab === 'listing_data' && isListed && (
          <View style={watchScreenStyles.contentCard}>

            {/* Cabecera */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#10b98120', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="storefront" size={18} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Anuncio Activo</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Gestiona tu publicación en el Marketplace</Text>
              </View>
              {(() => {
                const stateMap = { 1: { label: 'Activo', color: '#10b981' }, 2: { label: 'Reservado', color: '#f59e0b' }, 3: { label: 'Enviado', color: '#3b82f6' }, 4: { label: 'Verificado', color: '#8b5cf6' } };
                const s = stateMap[listingData.listing_state] || stateMap[1];
                return (
                  <View style={{ backgroundColor: s.color + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: s.color + '40' }}>
                    <Text style={{ color: s.color, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Tarjeta de precio con input integrado */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: newPrice ? colors.primary : colors.border, marginBottom: 20, overflow: 'hidden' }}>
              {/* Precio actual */}
              <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {newPrice && Number(newPrice) > 0 ? 'Precio actual' : 'Precio publicado'}
                  </Text>
                  <Text style={{ color: newPrice ? colors.textSecondary : colors.text, fontWeight: '800', fontSize: newPrice ? 18 : 26, textDecorationLine: newPrice && Number(newPrice) > 0 ? 'line-through' : 'none' }}>
                    {formattedPrice} <Text style={{ fontSize: newPrice ? 12 : 14, fontWeight: '600' }}>USDC</Text>
                  </Text>
                </View>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: (newPrice ? colors.primary : colors.primary) + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cash-outline" size={20} color={colors.primary} />
                </View>
              </View>

              {/* Input de nuevo precio — solo en state=1 */}
              {listingData.listing_state === 1 && (
                <>
                  <View style={{ height: 1, backgroundColor: newPrice ? colors.primary + '40' : colors.border }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, paddingLeft: 18, fontWeight: '600' }}>Nuevo precio</Text>
                    <TextInput
                      style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 14, textAlign: 'right', ...(Platform.OS === 'web' && { outlineStyle: 'none' }) }}
                      keyboardType="decimal-pad"
                      value={newPrice}
                      onChangeText={v => {
                        const cleaned = v.replace(/[^0-9.]/g, '');
                        const parts = cleaned.split('.');
                        const normalized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
                        setNewPrice(normalized);
                      }}
                      placeholderTextColor={colors.textMuted}
                      placeholder="—"
                    />
                    <Text style={{ color: newPrice ? colors.primary : colors.textMuted, fontWeight: '700', fontSize: 14, paddingRight: 18 }}>USDC</Text>
                  </View>
                </>
              )}
            </View>

            {/* Desglose — se actualiza en tiempo real con el precio activo */}
            {(() => {
              const currentP = listingData?.price ? Number(listingData.price) / 1_000_000 : 0;
              const p = (newPrice && Number(newPrice) > 0) ? Number(newPrice) : currentP;
              const isNewPrice = newPrice && Number(newPrice) > 0 && Number(newPrice) !== currentP;
              const isP2P = listingData?.is_p2p === true;
              const rows = [
                { label: 'Precio publicado', value: `${p.toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC`, color: colors.text },
                isManufacturer && { label: 'Regalías por reventa (1%)', value: `+ ${(p * 0.01).toFixed(2)} USDC`, color: '#10b981', note: 'En cada reventa futura' },
                isP2P && { label: 'Fianza vendedor (2%)', value: `${(p * 0.02).toFixed(2)} USDC`, color: '#f59e0b', note: 'Cobrada al vendedor cuando alguien compre · calculada sobre el precio vigente' },
                { label: 'Comisión plataforma (1%)', value: `− ${(p * 0.01).toFixed(2)} USDC`, color: colors.textSecondary },
                isP2P && { label: 'Comisión relojero (2%)', value: `− ${(p * 0.02).toFixed(2)} USDC`, color: colors.textSecondary, note: 'Solo en ventas P2P' },
                { label: 'Recibirás (estimado)', value: `~${(p * (isP2P ? 0.97 : isManufacturer ? 0.99 : 1.0)).toFixed(2)} USDC`, color: colors.primary, bold: true },
              ].filter(Boolean);
              return (
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: isNewPrice ? colors.primary + '40' : colors.border, padding: 14, marginBottom: 20 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 12 }}>
                    {isNewPrice ? 'Estimación con nuevo precio' : 'Desglose de comisiones'}
                  </Text>
                  {rows.map(row => (
                    <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{row.label}</Text>
                        {row.note && <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>{row.note}</Text>}
                      </View>
                      <Text style={{ color: row.color, fontWeight: row.bold ? '700' : '600', fontSize: row.bold ? 14 : 13 }}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Si está en escrow, aviso de bloqueo + acción según estado */}
            {listingData.listing_state >= 2 && (
              <>
                <View style={{ backgroundColor: '#f59e0b12', borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b40', padding: 14, marginBottom: 12, flexDirection: 'row', gap: 10 }}>
                  <Ionicons name="lock-closed" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                  <Text style={{ color: '#f59e0b', fontSize: 13, flex: 1, lineHeight: 18 }}>
                    Ya hay un comprador en proceso. No puedes modificar ni cancelar el anuncio hasta que la transacción finalice.
                  </Text>
                </View>

                {/* Botón de acción según estado (solo para el vendedor, is_p2p) */}
                {listingData.listing_state === 2 && listingData.is_p2p && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('SaleScreen', { listingId: listingData.id })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: '#38bdf818', borderRadius: 12, borderWidth: 1,
                      borderColor: '#38bdf840', paddingVertical: 13, marginBottom: 20,
                    }}
                  >
                    <Ionicons name="cube-outline" size={18} color="#38bdf8" />
                    <Text style={{ color: '#38bdf8', fontWeight: '700', fontSize: 14 }}>Confirmar envío del reloj</Text>
                    <Ionicons name="chevron-forward" size={15} color="#38bdf8" />
                  </TouchableOpacity>
                )}

                {(listingData.listing_state === 3 || listingData.listing_state === 4) && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('SaleScreen', { listingId: listingData.id })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1,
                      borderColor: colors.border, paddingVertical: 13, marginBottom: 20,
                    }}
                  >
                    <Ionicons name="receipt-outline" size={18} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 14 }}>Ver detalle de venta</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Botones — solo en state=1 */}
            {listingData.listing_state === 1 && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TouchableOpacity
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 13, borderRadius: 12,
                    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: alertColors.error,
                    opacity: (cancellingListing || updatingPrice || !hasWallet) ? 0.45 : 1,
                  }}
                  onPress={hasWallet ? handleCancelListing : undefined}
                  disabled={cancellingListing || updatingPrice || !hasWallet}
                >
                  {cancellingListing
                    ? <ActivityIndicator color={alertColors.error} size="small" />
                    : <>
                        <Ionicons name="close-circle-outline" size={16} color={alertColors.error} />
                        <Text style={{ color: alertColors.error, fontWeight: '700', fontSize: 14 }}>Retirar anuncio</Text>
                      </>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primary,
                    opacity: (updatingPrice || cancellingListing || !newPrice || !Number(newPrice)) ? 0.45 : 1,
                  }}
                  onPress={handleUpdatePrice}
                  disabled={updatingPrice || cancellingListing || !newPrice || !Number(newPrice)}
                >
                  {updatingPrice
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="refresh-outline" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Actualizar precio</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}


        {/* --- PESTAÑA VENDER --- */}
        {currentTab === 'sell' && !isListed && (
            <View style={watchScreenStyles.contentCard}>
              {/* Cabecera */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cash" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Publicar en el Marketplace</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Fija el precio en USDC y firma la transacción</Text>
                </View>
              </View>

              {/* Aviso proceso P2P para particulares */}
              {!isTrustedSeller && currentStateId === 0 && (
                <View style={{ backgroundColor: '#f59e0b10', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b30', marginBottom: 14, flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="information-circle-outline" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 }}>
                    La venta P2P requiere una <Text style={{ color: '#f59e0b', fontWeight: '600' }}>fianza del 2%</Text> y la revisión por un relojero certificado antes de liberar los fondos al comprador.
                  </Text>
                </View>
              )}

              {/* Aviso si bloqueado */}
              {currentStateId !== 0 && (
                <View style={{ backgroundColor: '#f43f5e15', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#f43f5e40', marginBottom: 16, flexDirection: 'row', gap: 10 }}>
                  <Ionicons name="warning" size={18} color="#f43f5e" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#f43f5e', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>Venta bloqueada</Text>
                    <Text style={{ color: '#f43f5e', fontSize: 12, lineHeight: 18 }}>
                      Este reloj está reportado como {currentStateInfo.label.toLowerCase()}. Resuélvelo en la pestaña Seguridad antes de venderlo.
                    </Text>
                  </View>
                </View>
              )}

              {/* Input de precio */}
              <View style={{ marginBottom: 14, opacity: currentStateId !== 0 ? 0.5 : 1 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>Precio de venta</Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: colors.surface, borderRadius: 12,
                  borderWidth: 1.5, borderColor: sellPrice && Number(sellPrice) > 0 ? colors.primary : colors.border,
                  overflow: 'hidden',
                }}>
                  <TextInput
                    style={{ flex: 1, color: colors.text, fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 14, ...(Platform.OS === 'web' && { outlineStyle: 'none' }) }}
                    keyboardType="decimal-pad"
                    value={sellPrice}
                    onChangeText={v => {
                      const cleaned = v.replace(/[^0-9.]/g, '');
                      const parts = cleaned.split('.');
                      setSellPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
                    }}
                    placeholderTextColor={colors.textMuted}
                    placeholder="0.00"
                    editable={currentStateId === 0}
                  />
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.primary + '15', borderLeftWidth: 1, borderLeftColor: colors.border }}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>USDC</Text>
                  </View>
                </View>
              </View>

              {/* Desglose de comisiones — siempre visible */}
              {(() => {
                const p = Number(sellPrice) || 0;
                const hasPrice = p > 0;
                return (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, opacity: currentStateId !== 0 ? 0.5 : 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>Desglose de comisiones</Text>
                    {[
                      { label: 'Precio de venta', value: hasPrice ? `${p.toLocaleString('es-ES')} USDC` : '—', color: colors.text },
                      isManufacturer && { label: 'Regalías por reventa (1%)', value: hasPrice ? `+${(p * 0.01).toFixed(2)} USDC` : '+0.00 USDC', color: '#10b981', note: 'En cada reventa futura' },
                      !isTrustedSeller && { label: 'Fianza vendedor (2%)', value: hasPrice ? `${(p * 0.02).toFixed(2)} USDC` : '0.00 USDC', color: '#f59e0b', note: 'Retenida al vendedor al comprar' },
                      { label: 'Comisión plataforma (1%)', value: hasPrice ? `− ${(p * 0.01).toFixed(2)} USDC` : '− 0.00 USDC', color: colors.textSecondary },
                      !isTrustedSeller && { label: 'Comisión relojero (2%)', value: hasPrice ? `− ${(p * 0.02).toFixed(2)} USDC` : '− 0.00 USDC', color: colors.textSecondary, note: 'Solo en ventas P2P' },
                      { label: 'Recibirás (estimado)', value: hasPrice ? `~${(p * (isTrustedSeller ? (isManufacturer ? 0.99 : 1.0) : 0.97)).toFixed(2)} USDC` : '—', color: hasPrice ? colors.primary : colors.textMuted, bold: true },
                    ].filter(Boolean).map(row => (
                      <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{row.label}</Text>
                          {row.note && <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>{row.note}</Text>}
                        </View>
                        <Text style={{ color: row.color, fontWeight: row.bold ? '700' : '600', fontSize: row.bold ? 14 : 13 }}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              <TouchableOpacity
                style={{
                  backgroundColor: (currentStateId !== 0 || !hasWallet || !sellPrice || Number(sellPrice) <= 0) ? colors.surface : colors.primary,
                  borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                  opacity: (actionLoading || !hasWallet) ? 0.5 : 1,
                  borderWidth: (currentStateId !== 0 || !hasWallet || !sellPrice || Number(sellPrice) <= 0) ? 1 : 0, borderColor: colors.border,
                }}
                onPress={hasWallet ? handlePreListCheck : undefined}
                disabled={actionLoading || currentStateId !== 0 || !hasWallet || !sellPrice || Number(sellPrice) <= 0}
              >
                {actionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="storefront-outline" size={18} color={(currentStateId !== 0 || !sellPrice || Number(sellPrice) <= 0) ? colors.textMuted : '#fff'} />
                      <Text style={{ color: (currentStateId !== 0 || !sellPrice || Number(sellPrice) <= 0) ? colors.textMuted : '#fff', fontWeight: '700', fontSize: 15 }}>
                        Publicar anuncio
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </View>
        )}

        {/* --- PESTAÑA GESTIONAR SEGURIDAD --- */}
        {currentTab === 'security' && (
          <View style={watchScreenStyles.contentCard}>
            {/* Cabecera */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: currentStateInfo.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={currentStateInfo.icon} size={18} color={currentStateInfo.color} />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Estado de Seguridad</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Gestiona el estado blockchain de este activo</Text>
              </View>
            </View>

            {/* Estado actual */}
            <View style={{
              backgroundColor: currentStateInfo.color + '12',
              borderRadius: 14, borderWidth: 1, borderColor: currentStateInfo.color + '40',
              padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: currentStateInfo.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={currentStateInfo.icon} size={22} color={currentStateInfo.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: currentStateInfo.color, fontWeight: '700', fontSize: 16 }}>{currentStateInfo.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 18 }}>{currentStateInfo.desc}</Text>
              </View>
            </View>

            {/* Comentario del relojero (solo cuando está alterado, excluye cert de fabricante) */}
            {currentStateId === 4 && (() => {
              const mfgW = watchData?.manufacturer_wallet?.toLowerCase();
              const verifs = (watchData?.verifications || []).filter(v =>
                !mfgW || v.watchmaker?.toLowerCase() !== mfgW
              );
              const lastVerif = verifs.length > 0 ? verifs[verifs.length - 1] : null;
              if (!lastVerif) return null;
              return (
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: '#ef444430', padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '800', marginBottom: 6 }}>OPINIÓN DEL RELOJERO</Text>
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, fontStyle: 'italic' }}>"{lastVerif.comment}"</Text>
                </View>
              );
            })()}

            {/* Botón de re-verificación (solo cuando alterado y sin verificación en curso) */}
            {currentStateId === 4 && !isListed && (
              <TouchableOpacity
                style={{
                  backgroundColor: '#8b5cf615', borderRadius: 12,
                  borderWidth: 1, borderColor: '#8b5cf640',
                  paddingVertical: 13, paddingHorizontal: 16, marginBottom: 16,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  opacity: requestingReverification ? 0.6 : 1,
                }}
                onPress={handleRequestReverification}
                disabled={requestingReverification}
              >
                {requestingReverification
                  ? <ActivityIndicator color="#8b5cf6" size="small" />
                  : <Ionicons name="refresh-circle-outline" size={20} color="#8b5cf6" />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 14 }}>Solicitar nueva certificación</Text>
                  <Text style={{ color: '#8b5cf680', fontSize: 11, marginTop: 1 }}>Se asignará un relojero al azar. Proceso gratuito.</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#8b5cf680" />
              </TouchableOpacity>
            )}

            {/* Aviso si re-verificación en curso */}
            {currentStateId === 4 && isListed && (
              <View style={{ backgroundColor: '#38bdf812', borderRadius: 12, borderWidth: 1, borderColor: '#38bdf840', padding: 14, marginBottom: 16, flexDirection: 'row', gap: 10 }}>
                <Ionicons name="time-outline" size={16} color="#38bdf8" style={{ marginTop: 1 }} />
                <Text style={{ color: '#38bdf8', fontSize: 12, flex: 1, lineHeight: 18 }}>
                  Re-verificación en curso. Un relojero está revisando el reloj.
                </Text>
              </View>
            )}

            {/* Aviso si está listado (venta activa) */}
            {isListed && currentStateId !== 4 && (
              <View style={{ backgroundColor: '#f59e0b12', borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b40', padding: 14, marginBottom: 16, flexDirection: 'row', gap: 10 }}>
                <Ionicons name="lock-closed" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                <Text style={{ color: '#f59e0b', fontSize: 12, flex: 1, lineHeight: 18 }}>
                  El reloj está en el Marketplace. Cancela el anuncio antes de cambiar el estado de seguridad.
                </Text>
              </View>
            )}

            {/* Botones de acción - ocultos cuando está alterado */}
            {!isAltered && (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                  Las acciones siguientes requieren firma en la blockchain.
                </Text>

                <View style={{ gap: 10 }}>
                  {currentStateId !== 0 && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: alertColors.success + '15', borderRadius: 12,
                        borderWidth: 1, borderColor: alertColors.success + '40',
                        paddingVertical: 13, paddingHorizontal: 16,
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        opacity: changingStateId !== null ? 0.5 : 1,
                      }}
                      onPress={() => handleChangeSecurityState(0)}
                      disabled={changingStateId !== null}
                    >
                      {changingStateId === 0
                        ? <ActivityIndicator color={alertColors.success} size="small" />
                        : <Ionicons name="shield-checkmark" size={18} color={alertColors.success} />}
                      <Text style={{ color: alertColors.success, fontWeight: '600', fontSize: 14, flex: 1 }}>Declarar Seguro</Text>
                      <Ionicons name="chevron-forward" size={14} color={alertColors.success + '80'} />
                    </TouchableOpacity>
                  )}

                  {currentStateId !== 1 && (
                    <>
                      {currentStateId === 0 && (
                        <View style={{ backgroundColor: alertColors.error + '08', borderRadius: 10, borderWidth: 1, borderColor: alertColors.error + '25', padding: 12, flexDirection: 'row', gap: 8 }}>
                          <Ionicons name="alert-circle-outline" size={15} color={alertColors.error} style={{ marginTop: 1 }} />
                          <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1, lineHeight: 16 }}>
                            Reportar un robo <Text style={{ color: alertColors.error, fontWeight: '600' }}>bloquea permanentemente</Text> transferencias y ventas hasta que lo canceles. Esta acción queda registrada en blockchain.
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={{
                          backgroundColor: alertColors.error + '12', borderRadius: 12,
                          borderWidth: 1, borderColor: alertColors.error + '40',
                          paddingVertical: 13, paddingHorizontal: 16,
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          opacity: changingStateId !== null || isListed ? 0.5 : 1,
                        }}
                        onPress={() => handleChangeSecurityState(1)}
                        disabled={changingStateId !== null || isListed}
                      >
                        {changingStateId === 1
                          ? <ActivityIndicator color={alertColors.error} size="small" />
                          : <Ionicons name="warning" size={18} color={alertColors.error} />}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: alertColors.error, fontWeight: '700', fontSize: 14 }}>Reportar Robo</Text>
                          <Text style={{ color: alertColors.error + '90', fontSize: 11, marginTop: 1 }}>Bloquea transferencias y ventas</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={alertColors.error + '80'} />
                      </TouchableOpacity>
                    </>
                  )}

                  {currentStateId !== 2 && !isManufacturer && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#9ca3af12', borderRadius: 12,
                        borderWidth: 1, borderColor: '#9ca3af40',
                        paddingVertical: 13, paddingHorizontal: 16,
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        opacity: changingStateId !== null || isListed ? 0.5 : 1,
                      }}
                      onPress={() => handleChangeSecurityState(2)}
                      disabled={changingStateId !== null || isListed}
                    >
                      {changingStateId === 2
                        ? <ActivityIndicator color="#9ca3af" size="small" />
                        : <Ionicons name="help-circle" size={18} color="#9ca3af" />}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#9ca3af', fontWeight: '600', fontSize: 14 }}>Reportar Pérdida</Text>
                        <Text style={{ color: '#9ca3af80', fontSize: 11, marginTop: 1 }}>Suspende operaciones temporalmente</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#9ca3af80" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* --- PESTAÑA CONFIRMAR RECIBO (solo vista comprador) --- */}
        {currentTab === 'confirm_receipt' && isBuyer && (
          <View style={watchScreenStyles.contentCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#10b98120', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Confirmar Recibo</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Finaliza la compra y libera el pago al vendedor</Text>
              </View>
            </View>

            <View style={{
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)',
              padding: 16, marginBottom: 20, gap: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="information-circle-outline" size={18} color="#10b981" />
                <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 14 }}>¿Has recibido el reloj físico?</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                Al confirmar la recepción, el contrato inteligente liberará el pago al vendedor y el NFT quedará registrado de forma permanente en tu wallet.
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                Esta acción es irreversible. Solo confirma si has recibido el reloj en buen estado.
              </Text>
            </View>

            {watchData && (
              <View style={{
                backgroundColor: colors.surface,
                borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 14, marginBottom: 20, gap: 6,
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Reloj a confirmar</Text>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                  {watchData.brand} {watchData.model}
                </Text>
                {listingData?.price && (
                  <Text style={{ color: '#10b981', fontWeight: '600', fontSize: 14 }}>
                    {(Number(listingData.price) / 1_000_000).toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC
                  </Text>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Token ID: #{watchId}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={hasWallet ? handleConfirmReceipt : undefined}
              disabled={actionLoading || !hasWallet}
              style={{
                backgroundColor: '#10b981',
                borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                shadowColor: '#10b981', shadowOpacity: 0.4, shadowRadius: 10,
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 }}>
                    Confirmar recepción del reloj
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {currentTab === 'history' && (
          <View style={watchScreenStyles.contentCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="time" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Historial On-Chain</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Registro inmutable de transferencias, revisiones y verificaciones</Text>
              </View>
            </View>

            {(() => {
              // Unificar transferencias, revisiones y verificaciones en una timeline ordenada
              const findUserByWallet = (wallet) =>
                wallet ? appUsers.find(u => u.wallet_address?.toLowerCase() === wallet.toLowerCase()) : null;

              const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
              // transferred_at viene de la BD sin indicador de zona → añadir 'Z' para tratarlo como UTC
              const parseUTCDate = s => s ? new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z') : null;
              const fmtDateTime = s => { const d = parseUTCDate(s); return d ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
              const transfers = (watchData?.history || []).map(e => {
                const isMint = !e.previous_owner_wallet || e.previous_owner_wallet.toLowerCase() === ZERO_ADDR;
                const d = parseUTCDate(e.transferred_at);
                const isAuction = !isMint && e.via_contract_wallet &&
                  AUCTION_ADDRESS &&
                  e.via_contract_wallet.toLowerCase() === AUCTION_ADDRESS.toLowerCase();
                // Subasta desierta: el NFT vuelve al mismo propietario (from == to)
                const isAuctionReturn = isAuction &&
                  e.previous_owner_wallet && e.new_owner_wallet &&
                  e.previous_owner_wallet.toLowerCase() === e.new_owner_wallet.toLowerCase();
                return {
                  _type: 'transfer',
                  _ts: d ? d.getTime() / 1000 : 0,
                  icon: isMint ? 'flash-outline' : isAuctionReturn ? 'close-circle-outline' : isAuction ? 'hammer-outline' : 'swap-horizontal',
                  color: isMint ? '#a855f7' : isAuctionReturn ? '#6b7280' : isAuction ? '#f59e0b' : colors.primary,
                  title: isMint ? 'Minteo inicial' : isAuctionReturn ? 'Subasta desierta' : isAuction ? 'Vendido en subasta' : 'Transferencia de propiedad',
                  lines: [
                    e.price_usdc != null ? `${Number(e.price_usdc).toLocaleString('es-ES', { minimumFractionDigits: 2 })} USDC` : null,
                  ].filter(Boolean),
                  isMint,
                  isAuction,
                  isAuctionReturn,
                  fromWallet: isMint
                    ? (watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker || null)
                    : isAuctionReturn ? null : (e.previous_owner_wallet || null),
                  viaWallet: isAuctionReturn ? null : (e.via_contract_wallet || null),
                  toWallet: e.new_owner_wallet || null,
                  fromUser: isMint ? findUserByWallet(watchData?.manufacturer_wallet || watchData?.verifications?.[0]?.watchmaker) : findUserByWallet(e.previous_owner_wallet),
                  toUser: findUserByWallet(e.new_owner_wallet),
                  date: fmtDateTime(e.transferred_at),
                };
              });
              const revisions = (watchData?.revisions || []).map(r => ({
                _type: 'revision', _ts: r.date || 0,
                icon: 'construct-outline', color: '#f59e0b',
                title: 'Revisión técnica',
                lines: [r.description],
                watchmakerWallet: r.watchmaker,
                watchmakerUser: findUserByWallet(r.watchmaker),
                date: r.date ? new Date(r.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
              }));
              const mfgWallet = watchData?.manufacturer_wallet?.toLowerCase();
              const rawVerifs = (watchData?.verifications || []);
              const latestVerifDate = rawVerifs.length > 0
                ? Math.max(...rawVerifs.map(v => v.date || 0))
                : -1;
              const verifications = rawVerifs.map(v => {
                const isManufacturerCert = mfgWallet && v.watchmaker?.toLowerCase() === mfgWallet;
                const isRejectionByComment = typeof v.comment === 'string' && v.comment.startsWith('Peritaje rechazado');
                const isRejection = !isManufacturerCert && (isRejectionByComment || (isAltered && v.date === latestVerifDate));
                // Peritaje realizado en el contexto de una venta P2P (evento del marketplace)
                const isP2PSale = !isRejection && !isManufacturerCert &&
                  typeof v.comment === 'string' && v.comment.startsWith('Peritaje superado en venta P2P');
                return {
                  _type: 'verification', _ts: v.date || 0,
                  icon: isRejection ? 'close-circle-outline'
                      : isManufacturerCert ? 'ribbon-outline'
                      : isP2PSale ? 'shield-half-outline'
                      : 'shield-checkmark-outline',
                  color: isRejection ? '#ef4444'
                       : isManufacturerCert ? '#a855f7'
                       : isP2PSale ? '#38bdf8'
                       : '#10b981',
                  title: isRejection ? 'Peritaje fallido — Alteración detectada'
                       : isManufacturerCert ? 'Certificado de fabricación'
                       : isP2PSale ? 'Peritaje de venta P2P'
                       : 'Peritaje de autenticidad',
                  lines: [v.comment],
                  isRejection,
                  watchmakerWallet: v.watchmaker,
                  watchmakerUser: findUserByWallet(v.watchmaker),
                  date: v.date ? new Date(v.date * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                };
              });

              const all = [...transfers, ...revisions, ...verifications]
                .sort((a, b) => b._ts - a._ts);

              if (all.length === 0) return (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cube-outline" size={26} color={colors.textMuted} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sin historial disponible</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
                    Las transferencias y cambios de estado aparecerán aquí una vez registradas en blockchain.
                  </Text>
                </View>
              );

              return all.map((event, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center', width: 28 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: event.color + '25', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={event.icon} size={13} color={event.color} />
                    </View>
                    {index < all.length - 1 && (
                      <View style={{ width: 1.5, flex: 1, minHeight: 20, backgroundColor: event.isRejection ? '#ef444430' : colors.border, marginTop: 4 }} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 16 }}>
                    <Text style={{ color: event.color, fontWeight: '700', fontSize: 13 }}>{event.title}</Text>

                    {/* Wallets origen/destino en transferencias (copiables) */}
                    {event._type === 'transfer' && (() => {
                      const rows = [
                        { label: event.isMint ? 'Por' : 'De', wallet: event.fromWallet, user: event.fromUser, isEscrow: false },
                        event.viaWallet ? { label: 'Vía', wallet: event.viaWallet, user: null, isEscrow: true, isAuction: event.isAuction } : null,
                        { label: 'A',   wallet: event.toWallet,   user: event.toUser,   isEscrow: false },
                      ].filter(Boolean);
                      return rows.map(({ label, wallet, user, isEscrow, isAuction }) => wallet ? (
                        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11, minWidth: 20 }}>{label}:</Text>
                          <TouchableOpacity onPress={() => Clipboard.setStringAsync(wallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={{ color: isEscrow ? '#f59e0b' : colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                              {wallet.slice(0, 8)}…{wallet.slice(-6)}
                            </Text>
                            <Ionicons name="copy-outline" size={11} color={isEscrow ? '#f59e0b' : colors.primaryLight} />
                          </TouchableOpacity>
                          {isEscrow && (
                            <View style={{ backgroundColor: '#f59e0b22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 }}>
                              <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>{isAuction ? 'Subasta' : 'Escrow'}</Text>
                            </View>
                          )}
                          {user && !isEscrow && (
                            <TouchableOpacity
                              onPress={() => navigation.navigate('PublicProfile', { userId: user.id })}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{user.username}</Text>
                              {(() => { const rk = user.roles?.find(r => ['FABRICANTE','DEALER','RELOJERO'].includes(r)); return rk ? <Ionicons name="checkmark-circle" size={13} color={roleColors[rk]} /> : null; })()}
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null);
                    })()}

                    {/* Precio de la transferencia */}
                    {event._type === 'transfer' && event.lines.map((l, i) => l ? (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <Ionicons name="cash-outline" size={11} color="#10b981" />
                        <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '600' }}>{l}</Text>
                      </View>
                    ) : null)}

                    {/* Texto libre en revisiones/verificaciones */}
                    {event._type !== 'transfer' && event.lines?.map((l, i) => l ? (
                      event.isRejection ? (
                        <View key={i} style={{
                          backgroundColor: '#ef444415', borderRadius: 8, borderWidth: 1,
                          borderColor: '#ef444430', padding: 8, marginTop: 5,
                        }}>
                          <Text style={{ color: '#ef4444', fontSize: 12, fontStyle: 'italic' }}>"{l}"</Text>
                        </View>
                      ) : (
                        <Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{l}</Text>
                      )
                    ) : null)}

                    {/* Wallet relojero en revisiones/verificaciones */}
                    {event.watchmakerWallet && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <TouchableOpacity onPress={() => Clipboard.setStringAsync(event.watchmakerWallet)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                            {event.watchmakerWallet.slice(0, 8)}…{event.watchmakerWallet.slice(-6)}
                          </Text>
                          <Ionicons name="copy-outline" size={11} color={colors.primaryLight} />
                        </TouchableOpacity>
                        {event.watchmakerUser && !isManufacturer && (
                          <TouchableOpacity
                            onPress={() => navigation.navigate('PublicProfile', { userId: event.watchmakerUser.id })}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          >
                            <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{event.watchmakerUser.username}</Text>
                            {(() => { const rk = event.watchmakerUser.roles?.find(r => ['FABRICANTE','DEALER','RELOJERO'].includes(r)); return rk ? <Ionicons name="checkmark-circle" size={13} color={roleColors[rk]} /> : null; })()}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{event.date}</Text>
                  </View>
                </View>
              ));
            })()}

            {/* Datos blockchain */}
            <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Contrato NFT</Text>
                <TouchableOpacity onPress={() => Clipboard.setStringAsync(NFT_ADDRESS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primaryLight, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                    {NFT_ADDRESS ? `${NFT_ADDRESS.slice(0, 10)}…${NFT_ADDRESS.slice(-8)}` : '—'}
                  </Text>
                  <Ionicons name="copy-outline" size={12} color={colors.primaryLight} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Token ID</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>#{watchId}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { const url = `${POLYGONSCAN_BASE}/token/${NFT_ADDRESS}?a=${watchId}`; if (Platform.OS === 'web') window.open(url, '_blank'); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ver en Polygonscan</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* --- PESTAÑA TRANSFERIR --- */}
        {currentTab === 'transfer' && !isListed && (
          <View style={watchScreenStyles.contentCard}>
            {/* Cabecera */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#38bdf820', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="paper-plane" size={18} color="#38bdf8" />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Transferir Propiedad</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Envía este NFT a otro usuario de AXIA</Text>
              </View>
            </View>
            
            <Text style={{ color: colors.textSecondary, marginBottom: 15, lineHeight: 20 }}>
              Selecciona al usuario destinatario de la lista o búscalo por nombre o dirección de wallet.
            </Text>

            {/* BUSCADOR */}
            <View style={[globalStyles.inputContainer, { marginBottom: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }]}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
              <TextInput 
                style={[globalStyles.input, { flex: 1, borderWidth: 0, marginBottom: 0, paddingLeft: 10 }]} 
                placeholder="Buscar por nombre o wallet..." 
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* LISTA DE USUARIOS - AJUSTADA PARA EVITAR DESBORDAMIENTOS */}
            <View style={{ 
              maxHeight: 300, 
              marginBottom: 20, 
              borderRadius: 8, 
              borderWidth: 1, 
              borderColor: colors.border, 
              backgroundColor: colors.background,
              overflow: 'hidden' // Corta el contenido interno, pero el padding del ScrollView da espacio
            }}>
              <ScrollView 
                showsVerticalScrollIndicator={true}
                contentContainerStyle={{ padding: 10 }}
              >
                {loadingUsers ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                ) : (
                  appUsers.filter(u =>
                    !u.is_admin &&
                    !(u.roles?.includes('RELOJERO')) &&
                    u.wallet_address &&
                    u.wallet_address.toLowerCase() !== loggedUser?.wallet_address?.toLowerCase() &&
                    (
                      u.wallet_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                  ) 
                    .map(u => {
                      let userColor = colors.primary; 
                      const isSelected = selectedRecipient?.id === u.id;

                      return (
                        <UserAndWatchCard 
                          key={u.id}
                          item={u}
                          type="user"
                          isSelected={isSelected}
                          onPress={() => setSelectedRecipient(isSelected ? null : u)}
                          customColor={userColor}
                        />
                      );
                    })
                )}
              </ScrollView>
            </View>

            {/* Destinatario seleccionado */}
            {selectedRecipient && (
              <View style={{ backgroundColor: '#38bdf812', borderRadius: 12, borderWidth: 1, borderColor: '#38bdf840', padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color="#38bdf8" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#38bdf8', fontWeight: '600', fontSize: 13 }}>{selectedRecipient.username}</Text>
                  <Text style={{ color: '#38bdf880', fontSize: 11 }}>{selectedRecipient.wallet_address?.slice(0, 14)}…</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedRecipient(null)}>
                  <Ionicons name="close-circle" size={18} color="#38bdf860" />
                </TouchableOpacity>
              </View>
            )}

            {/* BOTÓN DE ACCIÓN */}
            <TouchableOpacity
              style={{
                backgroundColor: selectedRecipient && currentStateId === 0 ? '#38bdf8' : colors.surface,
                borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: selectedRecipient && currentStateId === 0 ? '#38bdf8' : colors.border,
                opacity: actionLoading ? 0.7 : 1,
              }}
              onPress={hasWallet ? () => handleTransfer(selectedRecipient?.wallet_address) : undefined}
              disabled={!selectedRecipient || actionLoading || currentStateId !== 0 || !hasWallet}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="paper-plane" size={17} color={selectedRecipient && currentStateId === 0 ? '#fff' : colors.textMuted} />
                    <Text style={{ color: selectedRecipient && currentStateId === 0 ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 15 }}>
                      Confirmar transferencia
                    </Text>
                  </>
              }
            </TouchableOpacity>

          </View>
        )}

      </View>

      {/* --- MODAL AVISO VENTA --- */}
      <Modal visible={warningModalVisible} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={[globalStyles.card, { padding: 25, width: '85%', maxWidth: 400 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <Ionicons name="warning" size={24} color="#f59e0b" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text }}>Aviso de Venta</Text>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, lineHeight: 22 }}>
              Ten en cuenta que al subir el anuncio, datos como los antiguos propietarios, revisiones y verificaciones de este reloj pasarán a ser <Text style={{fontWeight: 'bold', color: colors.textPrimary}}>públicos</Text> en el Marketplace.
            </Text>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 25 }} onPress={() => setCheckboxChecked(!checkboxChecked)} activeOpacity={0.7}>
              <Ionicons name={checkboxChecked ? "checkbox" : "square-outline"} size={22} color={checkboxChecked ? colors.primary : colors.textSecondary} />
              <Text style={{ marginLeft: 8, color: colors.textSecondary }}>No volver a mostrar</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setWarningModalVisible(false)} style={{ marginRight: 20, alignSelf: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[globalStyles.primaryButton, { marginTop: 0, paddingHorizontal: 20, paddingVertical: 10 }]} onPress={executeListForSale}>
                <Text style={globalStyles.buttonText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- NUEVO: MODAL AVISO HACER PÚBLICO --- */}
      <Modal visible={publicWarningModalVisible} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={[globalStyles.card, { padding: 25, width: '85%', maxWidth: 400 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <Ionicons name="eye" size={24} color={colors.primaryLight} style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text }}>Hacer Público</Text>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 25, lineHeight: 22 }}>
              Al activar esto, los datos como propietarios pasados, el propietario actual y el historial en la blockchain serán <Text style={{fontWeight: 'bold', color: colors.text}}>visibles para todos</Text> en tu perfil y galerías públicas.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setPublicWarningModalVisible(false)} style={{ marginRight: 20, alignSelf: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[globalStyles.primaryButton, { marginTop: 0, paddingHorizontal: 20, paddingVertical: 10 }]} onPress={() => executeTogglePrivacy(true)}>
                <Text style={globalStyles.buttonText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- MODAL ÉXITO DE TRANSFERENCIA --- */}
      <Modal visible={transferSuccessVisible} transparent={true} animationType="fade">
        <View style={alertStyles.overlay}>
          <View style={alertStyles.alertBox}>
            <Ionicons name="checkmark-circle" size={55} color={alertColors.success} />
            <Text style={alertStyles.title}>¡Completado!</Text>
            <Text style={alertStyles.message}>
              El reloj ha sido transferido. Ya puedes volver a tu perfil manualmente.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setTransferSuccessVisible(false);
                navigation.goBack();
              }}
              style={[globalStyles.primaryButton, alertStyles.singleButton]}
            >
              <Text style={[globalStyles.buttonText, { fontSize: 16 }]}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL ENTREGA CONFIRMADA --- */}
      <Modal visible={deliverySuccessVisible} transparent={true} animationType="fade">
        <View style={alertStyles.overlay}>
          <View style={alertStyles.alertBox}>
            <Ionicons name="checkmark-circle" size={55} color={alertColors.success} />
            <Text style={alertStyles.title}>¡Entrega confirmada!</Text>
            <Text style={alertStyles.message}>
              El reloj ya es tuyo y el pago se ha liberado al vendedor. Puedes verlo en tu colección.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setDeliverySuccessVisible(false);
                navigation.navigate('Perfil');
              }}
              style={[globalStyles.primaryButton, alertStyles.singleButton]}
            >
              <Text style={[globalStyles.buttonText, { fontSize: 16 }]}>Ver mi colección</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- OVERLAY FIRMANDO CON METAMASK --- */}
      <Modal visible={metaMaskLoading} transparent animationType="fade">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.78)',
          justifyContent: 'center',
          alignItems: 'center',
          ...(Platform.OS === 'web' && { backdropFilter: 'blur(6px)' }),
        }}>
          <View style={{
            backgroundColor: colors.backgroundAlt,
            borderRadius: 20,
            padding: 32,
            alignItems: 'center',
            gap: 16,
            borderWidth: 1,
            borderColor: colors.border,
            minWidth: 260,
            maxWidth: 320,
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, textAlign: 'center' }}>
              Esperando MetaMask
            </Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
              Confirma la transacción en tu wallet para continuar.
            </Text>
          </View>
        </View>
      </Modal>

    </ScrollView>
    </View>
  );
}