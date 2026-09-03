import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import VueRouter from 'unplugin-vue-router/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
      '@/': `${path.resolve(__dirname, 'src')}/`,
    },
  },

  css: {
    // preprocessorOptions: {
    //   scss: {
    //     additionalData: `@use "~/styles/element/index.scss" as *;`,
    //   },
    // },
  },

  plugins: [
    Vue(),

    tailwindcss(),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      exclude: ['**/components/**'],
      dts: 'src/typed-router.d.ts',
    }),

    Components({
      // allow auto load markdown components under `./src/components/`
      extensions: ['vue', 'md'],
      // allow auto import and register components used in markdown
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      resolvers: [
        ElementPlusResolver({
          importStyle: 'sass',
        }),
      ],
      dts: 'src/components.d.ts',
    }),
  ] as any[],

  ssr: {
    // TODO: workaround until they support native ESM
    noExternal: ['element-plus'],
  },
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      ignored: [
        '**/.git/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
