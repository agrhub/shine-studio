import axios from 'axios';
import i18n from '@/i18n';
import { toast } from 'vue-sonner';

const http = axios.create({
  baseURL: '/api',
  timeout: 1000 * 60 * 10,// 10 minutes
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach JWT bearer token from localStorage
http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('shine_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Envelope validation & Error handling
http.interceptors.response.use(
  (response) => {
    const res = response.data;
    // Standardized envelope check: { code: 200/201, data, message, error }
    if (res && typeof res.code === 'number' && res.code !== 200 && res.code !== 201) {
      toast.error(res.message || i18n.global.t('toast.serverError'));
      return Promise.reject(new Error(res.message || 'API Error'));
    }
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('shine_token');
      localStorage.removeItem('shine_user');
      toast.error(i18n.global.t('toast.authFailed'));
      if (window.location.pathname !== '/auth/login') {
        window.location.href = '/auth/login';
      }
    } else if (error.response?.status === 422) {
      const details = error.response?.data?.details || error.response?.data?.message || 'Validation failed';
      const msg = typeof details === 'object' ? Object.values(details).join(', ') : details;
      toast.error(msg);
    } else if (error.response?.status === 500) {
      toast.error(error.response?.data?.message || 'Server error occurred. Please try again.');
    } else {
      toast.error(error.response?.data?.message || i18n.global.t('toast.serverError'));
    }
    return Promise.reject(error);
  }
);

export default http;
