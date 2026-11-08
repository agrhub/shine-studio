<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import http from '@/utils/http';

const { t } = useI18n();

const form = ref({
  name: '',
  email: '',
  subject: '',
  message: '',
  website: '', // honeypot: hidden from people, filled by bots
});
const isSent = ref(false);
const isLoading = ref(false);

const handleSubmit = async () => {
  if (!form.value.name || !form.value.email || !form.value.message) {
    ElMessage.error(t('toast.fillAllRequired'));
    return;
  }
  isLoading.value = true;
  try {
    await http.post('/contact', form.value);
    isSent.value = true;
    ElMessage.success(t('toast.contactMsgSent'));
  } catch {
    // The shared http interceptor already shows the server's error message.
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div id="contact-page" class="min-h-screen bg-background text-foreground py-16 px-4">
    <div class="max-w-xl mx-auto space-y-8">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-foreground">{{ t('contact.title') }}</h1>
        <p class="text-sm text-muted-foreground mt-1">{{ t('contact.subtitle') }}</p>
      </div>

      <el-card v-if="isSent" shadow="never" class="text-center p-8 border border-border bg-card">
        <el-icon class="text-5xl text-foreground mb-4"><CircleCheck /></el-icon>
        <h3 class="text-xl font-bold text-foreground mb-2">{{ t('contact.successTitle') }}</h3>
        <p class="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">{{ t('contact.successMsg') }}</p>
      </el-card>

      <el-form v-else label-position="top" @submit.prevent="handleSubmit" class="space-y-4">
        <el-form-item :label="t('contact.nameLabel')" required>
          <el-input id="contact-name" v-model="form.name" :placeholder="t('contact.namePlaceholder')" prefix-icon="User" />
        </el-form-item>

        <el-form-item :label="t('contact.emailLabel')" required>
          <el-input id="contact-email" v-model="form.email" type="email" :placeholder="t('contact.emailPlaceholder')" prefix-icon="Message" />
        </el-form-item>

        <el-form-item :label="t('contact.subjectLabel')">
          <el-input id="contact-subject" v-model="form.subject" :placeholder="t('contact.subjectPlaceholder')" prefix-icon="PriceTag" />
        </el-form-item>

        <el-form-item :label="t('contact.messageLabel')" required>
          <el-input
            id="contact-message"
            v-model="form.message"
            type="textarea"
            :rows="5"
            :placeholder="t('contact.messagePlaceholder')"
          />
        </el-form-item>

        <!-- Honeypot: off-screen and skipped by keyboard and screen readers -->
        <input
          v-model="form.website"
          type="text"
          name="website"
          tabindex="-1"
          autocomplete="off"
          aria-hidden="true"
          style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
        />

        <el-button
          id="contact-submit-btn"
          type="primary"
          :loading="isLoading"
          class="w-full h-10 font-semibold"
          @click="handleSubmit"
        >
          <el-icon class="mr-1"><Promotion /></el-icon>
          {{ t('contact.sendBtn') }}
        </el-button>
      </el-form>
    </div>
  </div>
</template>
