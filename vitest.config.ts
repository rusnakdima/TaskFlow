import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    globals: true,
  },
});
