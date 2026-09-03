<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

const { t } = useI18n();
const router = useRouter();

const newPassword = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);

function handleResetPassword() {
  if (!newPassword.value || !confirmPassword.value) {
    ElMessage.error(t('toast.loginRequiredFields'));
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.error(t('toast.passwordsMismatch'));
    return;
  }
  isLoading.value = true;
  setTimeout(() => {
    isLoading.value = false;
    ElMessage.success(t('toast.passwordResetSuccess'));
    router.push('/auth/login');
  }, 1000);
}
</script>

<template>
  <div id="reset-password-page" class="space-y-8 font-['Outfit',sans-serif]">
    <!-- Header -->
    <div class="space-y-1">
      <h2 class="text-3xl font-extrabold tracking-tight text-[var(--el-text-color-primary)]">
        {{ t('auth.resetPasswordHeader') }}
      </h2>
      <p class="text-sm text-[var(--el-text-color-secondary)]">
        {{ t('auth.resetPasswordSubtitle') }}
      </p>
    </div>

    <!-- Form -->
    <form class="space-y-5" @submit.prevent="handleResetPassword">
      <div>
        <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
          {{ t('auth.newPassword') }}
        </label>
        <input
          id="reset-new-password"
          v-model="newPassword"
          type="password"
          placeholder="••••••••"
          class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
          required
          @keyup.enter="handleResetPassword"
        />
      </div>

      <div>
        <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
          {{ t('auth.confirmPassword') }}
        </label>
        <input
          id="reset-confirm-password"
          v-model="confirmPassword"
          type="password"
          placeholder="••••••••"
          class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
          required
          @keyup.enter="handleResetPassword"
        />
      </div>

      <el-button
        type="primary"
        native-type="submit"
        size="large"
        class="!w-full !bg-primary !text-on-primary !border-none !font-extrabold text-sm !h-12 !rounded-full hover:!opacity-95 shadow-md"
        :loading="isLoading"
        @click="handleResetPassword"
      >
        {{ t('auth.resetBtn') }}
      </el-button>
    </form>
  </div>
</template>
