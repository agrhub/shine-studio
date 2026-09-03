<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Message, ArrowLeft } from '@element-plus/icons-vue';

const { t } = useI18n();
const email = ref('');
const isLoading = ref(false);
const isSubmitted = ref(false);

function handleSendReset() {
  if (!email.value) {
    ElMessage.error(t('toast.loginRequiredFields'));
    return;
  }
  isLoading.value = true;
  setTimeout(() => {
    isLoading.value = false;
    isSubmitted.value = true;
    ElMessage.success(t('toast.resetSent'));
  }, 1000);
}
</script>

<template>
  <div id="forgot-password-page" class="space-y-8 font-['Outfit',sans-serif]">
    <!-- Header -->
    <div class="space-y-1">
      <h2 class="text-3xl font-extrabold tracking-tight text-[var(--el-text-color-primary)]">
        {{ t('auth.forgotPasswordHeader') }}
      </h2>
      <p class="text-sm text-[var(--el-text-color-secondary)]">
        {{ t('auth.forgotPasswordSubtitle') }}
      </p>
    </div>

    <div v-if="!isSubmitted">
      <form class="space-y-5" @submit.prevent="handleSendReset">
        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
            {{ t('auth.email') }}
          </label>
          <input
            id="forgot-email"
            v-model="email"
            type="email"
            placeholder="jane@shinedrama.com"
            class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
            required
            @keyup.enter="handleSendReset"
          />
        </div>

        <el-button
          id="send-reset-btn"
          type="primary"
          native-type="submit"
          size="large"
          class="!w-full !bg-primary !text-on-primary !border-none !font-extrabold text-sm !h-12 !rounded-full hover:!opacity-95 shadow-md"
          :loading="isLoading"
          @click="handleSendReset"
        >
          {{ t('auth.sendResetBtn') }}
        </el-button>
      </form>
    </div>

    <div v-else class="bg-primary/10 border border-[var(--el-color-primary)]/30 rounded-2xl p-6 text-center space-y-3">
      <div class="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto">
        <el-icon class="text-2xl"><Message /></el-icon>
      </div>
      <h3 class="font-bold text-base text-[var(--el-text-color-primary)]">{{ t('auth.checkInbox') }}</h3>
      <p class="text-xs text-[var(--el-text-color-secondary)]">{{ t('auth.checkInboxDesc', { email }) }}</p>
    </div>

    <div class="text-center pt-2">
      <router-link to="/auth/login" class="text-xs font-extrabold text-primary hover:underline inline-flex items-center gap-1">
        <el-icon><ArrowLeft /></el-icon>
        <span>{{ t('auth.backToLogin') }}</span>
      </router-link>
    </div>
  </div>
</template>
