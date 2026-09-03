import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useDark, useToggle } from '@vueuse/core';
import http from '@/utils/http';
import i18n from '@/i18n';
import { useChatStore } from '@/stores/chatStore';
import { User } from '../types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(
    JSON.parse(localStorage.getItem('shine_user') || 'null')
  );
  const token = ref<string | null>(localStorage.getItem('shine_token'));
  const isLoading = ref(false);

  // VueUse standard theme management
  const isDark = useDark({
    storageKey: 'shine_theme',
    valueDark: 'dark',
    valueLight: 'light',
  });
  
  const toggleDark = useToggle(isDark);

  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => {
    const r = (user.value?.role || '').toLowerCase();
    return r === 'admin' || r === 'owner' || r === 'superadmin';
  });

  function applyUserPreferences(usr: User | null) {
    const theme = usr?.theme || localStorage.getItem('shine_theme') || 'dark';
    const language = usr?.language || localStorage.getItem('shine_language') || 'en';

    isDark.value = theme === 'dark';
    localStorage.setItem('shine_language', language);

    try {
      if (i18n && i18n.global && i18n.global.locale) {
        if (typeof i18n.global.locale === 'object' && 'value' in i18n.global.locale) {
          (i18n.global.locale as any).value = language;
        } else {
          (i18n.global as any).locale = language;
        }
      }
    } catch {
      // safe fallback
    }
  }

  // Initial call
  applyUserPreferences(user.value);

  async function fetchCurrentUser() {
    if (!token.value) return null;
    try {
      const res: any = await http.get('/auth/profile');
      const data = res?.data || res;
      if (data?.user) {
        user.value = data.user;
        localStorage.setItem('shine_user', JSON.stringify(data.user));
        applyUserPreferences(data.user);
      }
      return data?.user || null;
    } catch {
      return null;
    }
  }

  async function login(credentials: { email: string; password: string }) {
    isLoading.value = true;
    try {
      const res: any = await http.post('/auth/login', credentials);
      const data = res?.data || res;
      if (data?.require_2fa) {
        return data;
      }
      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('shine_token', data.token);
      localStorage.setItem('shine_user', JSON.stringify(data.user));
      applyUserPreferences(data.user);
      useChatStore().loadHistory();
      return data;
    } finally {
      isLoading.value = false;
    }
  }

  async function verifyLogin2FA(payload: { temp_token: string; otp: string }) {
    isLoading.value = true;
    try {
      const res: any = await http.post('/auth/login/verify-2fa', payload);
      const data = res?.data || res;
      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('shine_token', data.token);
      localStorage.setItem('shine_user', JSON.stringify(data.user));
      applyUserPreferences(data.user);
      useChatStore().loadHistory();
      return data;
    } finally {
      isLoading.value = false;
    }
  }

  async function resendLogin2FA(temp_token: string) {
    const res: any = await http.post('/auth/login/resend-2fa-otp', { temp_token });
    return res?.data || res;
  }

  async function signup(payload: { email: string; password: string; name: string }) {
    isLoading.value = true;
    try {
      const res: any = await http.post('/auth/signup', payload);
      return res?.data || res;
    } finally {
      isLoading.value = false;
    }
  }

  async function verifySignupOTP(payload: { temp_token: string; otp: string }) {
    isLoading.value = true;
    try {
      const res: any = await http.post('/auth/signup/verify-otp', payload);
      const data = res?.data || res;
      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('shine_token', data.token);
      localStorage.setItem('shine_user', JSON.stringify(data.user));
      applyUserPreferences(data.user);
      useChatStore().loadHistory();
      return data;
    } finally {
      isLoading.value = false;
    }
  }

  async function resendSignupOTP(temp_token: string) {
    const res: any = await http.post('/auth/signup/resend-otp', { temp_token });
    return res?.data || res;
  }

  async function updatePreferences(prefs: { theme?: string; language?: string }) {
    if (prefs.theme) localStorage.setItem('shine_theme', prefs.theme);
    if (prefs.language) {
      localStorage.setItem('shine_language', prefs.language);
    }

    if (user.value) {
      if (prefs.theme) user.value.theme = prefs.theme;
      if (prefs.language) user.value.language = prefs.language;
      localStorage.setItem('shine_user', JSON.stringify(user.value));
      applyUserPreferences(user.value);
    } else {
      applyUserPreferences({ theme: prefs.theme, language: prefs.language } as any);
    }

    if (token.value) {
      try {
        const res: any = await http.patch('/auth/preferences', prefs);
        const data = res?.data || res;
        if (data?.user) {
          user.value = { ...user.value, ...data.user };
          localStorage.setItem('shine_user', JSON.stringify(user.value));
          applyUserPreferences(user.value);
        }
      } catch {
        // silent fallback
      }
    }
  }

  async function forgotPassword(email: string) {
    isLoading.value = true;
    try {
      const res: any = await http.post('/auth/forgot-password', { email });
      return res?.data || res;
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('shine_token');
    localStorage.removeItem('shine_user');
    useChatStore().clearUserSession();
  }

  return {
    user,
    token,
    isDark,
    toggleDark,
    isLoading,
    isAuthenticated,
    isAdmin,
    fetchCurrentUser,
    login,
    verifyLogin2FA,
    resendLogin2FA,
    signup,
    verifySignupOTP,
    resendSignupOTP,
    updatePreferences,
    forgotPassword,
    logout,
  };
});
