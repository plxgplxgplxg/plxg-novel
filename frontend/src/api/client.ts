import axios from 'axios';

export const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const TOKEN_STORAGE_KEY = 'plxg_novel_access_token';

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
