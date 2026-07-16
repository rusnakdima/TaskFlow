import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  plugins: [],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@helpers': resolve(__dirname, './src/app/shared/utils'),
      '@entities': resolve(__dirname, './src/app/entities'),
      '@providers': resolve(__dirname, './src/app/providers'),
      '@resolvers': resolve(__dirname, './src/app/features/tasks/services'),
      '@services': resolve(__dirname, './src/app/services'),
      '@api': resolve(__dirname, './src/app/api'),
      '@core': resolve(__dirname, './src/app/core'),
      '@env': resolve(__dirname, './src/environments'),
      '@components': resolve(__dirname, './src/app/components'),
      '@pages': resolve(__dirname, './src/app/pages'),
      '@controllers': resolve(__dirname, './src/app/controllers'),
      '@app': resolve(__dirname, './src/app'),
      '@guards': resolve(__dirname, './src/app/shared'),
      '@bases': resolve(__dirname, './src/app/bases'),
      '@store': resolve(__dirname, './src/app/store'),
      '@mixins': resolve(__dirname, './src/app/shared'),
      '@constants': resolve(__dirname, './src/app/shared/utils'),
      '@validators': resolve(__dirname, './src/app/shared'),
      '@utils': resolve(__dirname, './src/app/shared/utils'),
      '@shared': resolve(__dirname, './src/app/shared'),
      '@tauri-front/shared': resolve(__dirname, '../tauri-front-shared/projects/shared/dist'),
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
