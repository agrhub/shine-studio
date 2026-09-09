// Suppress repetitive frame dimension warnings from engine-pixi during render loops
const origWarn = console.warn;
console.warn = function (...args: any[]) {
  if (typeof args[0] === 'string' && (
    args[0].includes('PixiSpriteRenderer: Invalid frame dimensions') ||
    args[0].includes('PixiSpriteRenderer: Texture has zero dimensions') ||
    args[0].includes('WebGL: INVALID_VALUE: texSubImage2D: The source data has been detached.')
  )) {
    return;
  }
  origWarn.apply(console, args);
};

// const origLog = console.log;
// console.log = function (...args: any[]) {
//   if (typeof args[0] === 'string' && (
//     args[0].includes('visibilitychange: hidden') ||
//     args[0].includes('visibilitychange: visible')
//   )) {
//     return;
//   }
//   origLog.apply(console, args);
// };

import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import ElementPlus from 'element-plus';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';

import App from './App.vue';
import i18n from './i18n';
import router from './router';
import './style.css';
import 'flag-icons/css/flag-icons.min.css';
import { Toaster } from 'vue-sonner';
import 'vue-color/style.css'
import 'vue-sonner/style.css'

const app = createApp(App);

// Register Element Plus icons globally
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

import VueApexCharts from 'vue3-apexcharts';

app.use(createPinia());
app.use(router);
app.use(i18n);
app.component('Toaster', Toaster);
app.use(ElementPlus);
app.use(VueApexCharts);

app.mount('#app');

