import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL = 'https://axia-8ivf.onrender.com';
export const WS_URL = 'wss://axia-8ivf.onrender.com';

const api = axios.create({
    baseURL: API_URL, 
});

// --- FUNCIONES PARA GESTIÓN DE TOKENS ---

export const getToken = async () => {
    if (Platform.OS === 'web') return localStorage.getItem('userToken');
    return await SecureStore.getItemAsync('userToken');
};

const getRefreshToken = async () => {
    if (Platform.OS === 'web') return localStorage.getItem('refreshToken');
    return await SecureStore.getItemAsync('refreshToken');
};

const setTokens = async (accessToken, refreshToken) => {
    if (Platform.OS === 'web') {
        localStorage.setItem('userToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
    } else {
        await SecureStore.setItemAsync('userToken', accessToken);
        await SecureStore.setItemAsync('refreshToken', refreshToken);
    }
};

const deleteTokens = async () => {
    if (Platform.OS === 'web') {
        localStorage.removeItem('userToken');
        localStorage.removeItem('refreshToken');
    } else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('refreshToken');
    }
};

// --- INTERCEPTOR DE SALIDA ---
api.interceptors.request.use(
    async (config) => {
        try {
            const token = await getToken();
            if (token) {
                config.headers = config.headers || {};
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.log("Error interceptando el token:", error);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// --- INTERCEPTOR DE ENTRADA (Manejo de Refresh Token) ---
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            
            if (originalRequest.url.includes('/login') || originalRequest.url.includes('/refresh')) {
                await deleteTokens();
                return Promise.reject(error);
            }

            originalRequest._retry = true;

            try {
                const refreshToken = await getRefreshToken();
                if (!refreshToken) {
                    await deleteTokens();
                    return Promise.reject(error);
                }

                const res = await axios.post(`${API_URL}/refresh`, { refresh_token: refreshToken });
                const { access_token, refresh_token: new_refresh_token } = res.data;

                await setTokens(access_token, new_refresh_token);

                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${access_token}`;
                return api(originalRequest);
                
            } catch (refreshError) {
                await deleteTokens();
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default api;