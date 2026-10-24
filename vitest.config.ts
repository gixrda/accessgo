import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The cloud edition has its own dependencies, config and test command.
export default defineConfig({
  plugins: [react()],
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
});
