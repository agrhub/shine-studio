<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { ElMessage } from 'element-plus';
import { Message, Back, Share } from '@element-plus/icons-vue';
import http from '@/utils/http';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  agree: true,
});

// SSO Providers State
const ssoProviders = ref({
  google: true,
  facebook: false,
  github: true,
});
const hasAnySSO = computed(() => Object.values(ssoProviders.value).some(Boolean));

async function loadSSOProviders() {
  try {
    const res: any = await http.get('/auth/sso-providers');
    if (res?.data) {
      ssoProviders.value = res.data;
    }
  } catch {}
}

function handleSSOSignup(provider: string) {
  window.open(
    `/api/auth/sso/${provider}`,
    'SSOAuthPopup',
    'width=500,height=620,status=no,toolbar=no,menubar=no,location=no'
  );
}

function handleSSOMessage(event: MessageEvent) {
  if (event.data?.type === 'SSO_AUTH_SUCCESS' && event.data.token) {
    authStore.token = event.data.token;
    authStore.user = event.data.user;
    localStorage.setItem('shine_token', event.data.token);
    localStorage.setItem('shine_user', JSON.stringify(event.data.user));
    ElMessage.success(t('toast.signupSuccess') || 'Welcome to Shine Studio!');
    router.push('/dashboard');
  }
}

// Email OTP Verification Step State
const isOtpStep = ref(false);
const tempToken = ref('');
const maskedEmail = ref('');
const otpCode = ref('');
const resendCountdown = ref(0);
let countdownTimer: any = null;
const isVerifying = ref(false);
const isResending = ref(false);

function startCountdown() {
  resendCountdown.value = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (resendCountdown.value > 0) {
      resendCountdown.value--;
    } else {
      clearInterval(countdownTimer);
    }
  }, 1000);
}

onMounted(() => {
  loadSSOProviders();
  window.addEventListener('message', handleSSOMessage);
});

onUnmounted(() => {
  window.removeEventListener('message', handleSSOMessage);
  if (countdownTimer) clearInterval(countdownTimer);
});

const handleSignup = async () => {
  const fullName = `${form.value.firstName} ${form.value.lastName}`.trim();
  if (!form.value.email || !form.value.password || !fullName) {
    ElMessage.error(t('toast.loginRequiredFields'));
    return;
  }
  if (form.value.password.length < 6) {
    ElMessage.error(t('toast.passMinLength'));
    return;
  }
  if (!form.value.agree) {
    ElMessage.error(t('toast.termsRequired'));
    return;
  }
  try {
    const res: any = await authStore.signup({
      name: fullName,
      email: form.value.email,
      password: form.value.password,
    });
    if (res?.require_otp) {
      isOtpStep.value = true;
      tempToken.value = res.temp_token;
      maskedEmail.value = res.email || form.value.email;
      otpCode.value = '';
      startCountdown();
      ElMessage.info(t('toast.otpSentEmail'));
      return;
    }
    ElMessage.success(t('toast.signupSuccess'));
    router.push('/dashboard');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || t('toast.signupFailed'));
  }
};

const handleVerifyOtp = async () => {
  if (!otpCode.value || otpCode.value.trim().length !== 6) {
    ElMessage.error(t('toast.enterValidOtp'));
    return;
  }
  isVerifying.value = true;
  try {
    await authStore.verifySignupOTP({
      temp_token: tempToken.value,
      otp: otpCode.value.trim(),
    });
    ElMessage.success(t('toast.signupSuccess'));
    router.push('/dashboard');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || 'Verification failed');
  } finally {
    isVerifying.value = false;
  }
};

const handleResendOtp = async () => {
  isResending.value = true;
  try {
    await authStore.resendSignupOTP(tempToken.value);
    ElMessage.success(t('toast.otpSentEmail'));
    startCountdown();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || 'Failed to resend code');
  } finally {
    isResending.value = false;
  }
};

const handleBackToSignup = () => {
  isOtpStep.value = false;
  otpCode.value = '';
};
</script>

<template>
  <div id="signup-page" class="space-y-8 font-['Outfit',sans-serif]">
    <!-- OTP Verification Step -->
    <div v-if="isOtpStep" class="space-y-6">
      <div class="space-y-1">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl mb-4">
          <el-icon :size="24"><Message /></el-icon>
        </div>
        <h2 class="text-2xl font-extrabold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('auth.emailVerification') }}
        </h2>
        <p class="text-sm text-[var(--el-text-color-secondary)]">
          {{ t('auth.emailVerificationDesc') }} <strong class="text-primary">{{ maskedEmail }}</strong>
        </p>
      </div>

      <form class="space-y-5" @submit.prevent="handleVerifyOtp">
        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-2">
            {{ t('settings.verificationCode') }}
          </label>
          <input
            v-model="otpCode"
            type="text"
            maxlength="6"
            placeholder="••••••"
            class="w-full text-center tracking-[14px] font-mono text-2xl font-bold bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
            autofocus
            required
            @keyup.enter="handleVerifyOtp"
          />
        </div>

        <el-button
          type="primary"
          native-type="submit"
          size="large"
          class="!w-full !bg-primary !text-on-primary !border-none !font-extrabold text-sm !h-12 !rounded-full hover:!opacity-95 shadow-md"
          :loading="isVerifying"
          :disabled="otpCode.length !== 6"
          @click="handleVerifyOtp"
        >
          {{ t('auth.verifyAndActivate') }}
        </el-button>

        <div class="flex items-center justify-between text-xs pt-2">
          <button
            type="button"
            class="text-[var(--el-text-color-secondary)] hover:text-primary font-semibold flex items-center gap-1.5 transition"
            @click="handleBackToSignup"
          >
            <el-icon class="text-[10px]"><Back /></el-icon> {{ t('common.back') }}
          </button>

          <button
            type="button"
            class="text-primary hover:underline font-semibold disabled:opacity-50 disabled:hover:no-underline"
            :disabled="resendCountdown > 0 || isResending"
            @click="handleResendOtp"
          >
            {{ resendCountdown > 0 ? `${t('settings.resendIn')} ${resendCountdown}s` : t('settings.resendCode') }}
          </button>
        </div>
      </form>
    </div>

    <!-- Normal Signup Step -->
    <div v-else class="space-y-8">
      <!-- Header -->
      <div class="space-y-1">
        <h2 class="text-3xl font-extrabold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('auth.createAccount') }}
        </h2>
        <p class="text-sm text-[var(--el-text-color-secondary)]">
          {{ t('auth.createAccountSubtitle') }}
        </p>
      </div>

      <!-- Form -->
      <form class="space-y-5" @submit.prevent="handleSignup">
        <!-- First Name & Last Name Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
              {{ t('auth.firstName') }}
            </label>
            <input
              id="signup-first-name"
              v-model="form.firstName"
              type="text"
              placeholder="Jane"
              class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
              required
              @keyup.enter="handleSignup"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
              {{ t('auth.lastName') }}
            </label>
            <input
              id="signup-last-name"
              v-model="form.lastName"
              type="text"
              placeholder="Doe"
              class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
              @keyup.enter="handleSignup"
            />
          </div>
        </div>

        <!-- Email -->
        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
            {{ t('auth.email') }}
          </label>
          <input
            id="signup-email"
            v-model="form.email"
            type="email"
            placeholder="jane@drama.com"
            class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all shadow-sm"
            required
            @keyup.enter="handleSignup"
          />
        </div>

        <!-- Password -->
        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1.5">
            {{ t('auth.password') }}
          </label>
          <input
            id="signup-password"
            v-model="form.password"
            type="password"
            placeholder="••••••••"
            class="w-full bg-[var(--el-fill-color-blank)] border border-[var(--el-border-color)] rounded-xl px-4 py-3 text-sm text-[var(--el-text-color-primary)] placeholder-[var(--el-text-color-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--el-color-primary)] transition-all mb-2 shadow-sm"
            required
            @keyup.enter="handleSignup"
          />
          <!-- 4-Segment Password Strength Bar -->
          <div class="flex gap-1.5 mb-1.5">
            <div class="h-1.5 flex-1 bg-primary rounded-full"></div>
            <div class="h-1.5 flex-1 bg-[var(--el-border-color)] rounded-full"></div>
            <div class="h-1.5 flex-1 bg-[var(--el-border-color)] rounded-full"></div>
            <div class="h-1.5 flex-1 bg-[var(--el-border-color)] rounded-full"></div>
          </div>
          <p class="text-[11px] text-[var(--el-text-color-secondary)]">
            {{ t('auth.passwordHint') }}
          </p>
        </div>

        <!-- Terms Checkbox -->
        <div id="signup-terms-checkbox" class="flex items-center gap-2 pt-1">
          <el-checkbox v-model="form.agree" class="!mr-1">
            <span class="text-xs text-[var(--el-text-color-regular)]">
              {{ t('auth.agreeTo') }}
              <router-link to="/terms" class="text-primary font-semibold hover:underline">
                {{ t('auth.termsOfService') }}
              </router-link>
              {{ t('auth.and') }}
              <router-link to="/privacy" class="text-primary font-semibold hover:underline">
                {{ t('auth.privacyPolicy') }}
              </router-link>.
            </span>
          </el-checkbox>
        </div>

        <!-- Create Account Button -->
        <el-button
          id="signup-submit-btn"
          type="primary"
          native-type="submit"
          size="large"
          class="!w-full !bg-primary !text-on-primary !border-none !font-extrabold text-sm !h-12 !rounded-full hover:!opacity-95 shadow-md"
          :loading="authStore.isLoading"
          @click="handleSignup"
        >
          {{ t('auth.createAccount') }}
        </el-button>
      </form>

      <!-- Social Divider -->
      <div v-if="hasAnySSO" class="my-6 flex items-center justify-center relative">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-[var(--el-border-color)]"></div>
        </div>
        <span class="relative bg-[var(--el-bg-color-page)] px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)]">
          {{ t('auth.orSignUpWith') }}
        </span>
      </div>

      <!-- Social Signup Buttons -->
      <div v-if="hasAnySSO" class="flex flex-wrap items-center justify-center gap-3">
        <!-- Google SSO -->
        <button
          v-if="ssoProviders.google"
          type="button"
          class="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 px-4 border border-[var(--el-border-color)] rounded-full bg-[var(--el-card-bg-color)] hover:bg-[var(--el-fill-color-light)] transition-colors text-xs font-semibold text-[var(--el-text-color-primary)] shadow-sm"
          @click="handleSSOSignup('google')"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>

        <!-- GitHub SSO -->
        <button
          v-if="ssoProviders.github"
          type="button"
          class="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 px-4 border border-[var(--el-border-color)] rounded-full bg-[var(--el-card-bg-color)] hover:bg-[var(--el-fill-color-light)] transition-colors text-xs font-semibold text-[var(--el-text-color-primary)] shadow-sm"
          @click="handleSSOSignup('github')"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
          GitHub
        </button>

        <!-- Facebook SSO -->
        <button
          v-if="ssoProviders.facebook"
          type="button"
          class="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 px-4 border border-[var(--el-border-color)] rounded-full bg-[var(--el-card-bg-color)] hover:bg-[var(--el-fill-color-light)] transition-colors text-xs font-semibold text-[var(--el-text-color-primary)] shadow-sm"
          @click="handleSSOSignup('facebook')"
        >
          <el-icon class="text-blue-500 text-sm"><Share /></el-icon>
          Facebook
        </button>
      </div>

      <!-- Footer Switch to Login -->
      <div class="text-center text-xs text-[var(--el-text-color-secondary)] pt-2">
        <span>{{ t('auth.hasAccount') }} </span>
        <router-link to="/auth/login" class="text-primary font-extrabold hover:underline">
          {{ t('auth.signIn') }}
        </router-link>
      </div>
    </div>
  </div>
</template>
