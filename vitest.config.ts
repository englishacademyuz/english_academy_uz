import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
    fileParallelism: false,
  },
})
