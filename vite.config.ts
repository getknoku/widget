import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

const target = process.env.KNOKU_BUILD_TARGET || 'loader'
const isSDK = target === 'sdk'

export default defineConfig({
  plugins: [preact()],
  build: {
    emptyOutDir: !isSDK,
    lib: isSDK
      ? {
          entry: 'src/index.ts',
          fileName: () => 'index.js',
          formats: ['es'],
        }
      : {
          entry: 'src/loader.ts',
          name: 'KnokuWidgetLoader',
          fileName: () => 'widget.js',
          formats: ['iife'],
        },
    rollupOptions: {
      external: isSDK ? ['preact', 'preact/hooks', 'preact/jsx-runtime'] : [],
    },
    minify: true,
    cssCodeSplit: false,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
