import { defineStore } from 'pinia';
import http from '@/utils/http';
import i18n from '@/i18n';
import { ElMessage } from 'element-plus';
import { useAuthStore } from './useAuthStore';
import type { SubscriptionTier } from '@/types/api';

export const useBillingStore = defineStore('billing', {
  state: () => {
    const authStore = useAuthStore();
    const isEnterprise = (authStore.user?.role || '').toLowerCase() === 'admin';
    return {
      currentTier: {
        tier: isEnterprise ? 'enterprise' : (authStore.user?.tier?.toLowerCase() || 'free'),
        credit_balance: authStore.user?.credits ?? 100,
        credit_quota: isEnterprise ? 10000 : 1000,
        features: ['series.create', 'script.generate', 'voice.tts', 'publish.multi'],
        monthly_price_usd: isEnterprise ? 299 : 0,
      } as SubscriptionTier,
      loading: false,
      checkoutLoading: false,
    };
  },

  getters: {
    isCreditsLow(): boolean {
      if (!this.currentTier || !this.currentTier.credit_quota) return false;
      return (this.currentTier.credit_balance / this.currentTier.credit_quota) < 0.1;
    },
  },

  actions: {
    async fetchTierInfo(): Promise<SubscriptionTier | null> {
      this.loading = true;
      const authStore = useAuthStore();
      try {
        const res = await http.get('/billing/tier');
        // The http interceptor already unwraps the axios response: res = { code, data, ... }
        const tierData = (res as any)?.data;
        if (tierData) {
          this.currentTier = tierData;
          if (authStore.user) {
            authStore.user.credits = this.currentTier.credit_balance;
            localStorage.setItem('shine_user', JSON.stringify(authStore.user));
          }
          if (this.isCreditsLow) {
            ElMessage.warning(
              i18n.global.t('toast.creditsLow', { count: this.currentTier.credit_balance })
            );
          }
          return this.currentTier;
        }
        return null;
      } catch (err) {
        console.error('Failed to fetch tier info', err);
        return null;
      } finally {
        this.loading = false;
      }
    },

    async fetchCurrentTier(): Promise<SubscriptionTier | null> {
      return this.fetchTierInfo();
    },

    async startCheckout(tier: 'free' | 'creator' | 'studio' | 'enterprise') {
      if (tier === 'free') return;
      this.checkoutLoading = true;
      try {
        const res = await http.post('/billing/checkout', { tier });
        const url = (res as any)?.data?.url;
        if (!url) throw new Error('Checkout URL missing');
        // The plan is upgraded by the verified Stripe webhook after payment, never locally.
        window.location.href = url;
      } catch (err: any) {
        console.error('Checkout failed', err);
        ElMessage.error(err?.response?.data?.message || 'Failed to initiate checkout process');
      } finally {
        this.checkoutLoading = false;
      }
    },

    async fetchCreditBalance(): Promise<number> {
      try {
        const res = await http.get('/billing/tier');
        // The http interceptor already unwraps the axios response: res = { code, data, ... }
        const tierData = (res as any)?.data;
        if (tierData) {
          this.currentTier = tierData;
          return this.currentTier.credit_balance;
        }
        return this.currentTier.credit_balance;
      } catch (err) {
        console.error('Failed to fetch credit balance', err);
        return this.currentTier.credit_balance;
      }
    },
  },
});
