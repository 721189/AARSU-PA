import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // The API contract suite boots the real Express app on an ephemeral port.
    // Running test files in a single fork keeps memory bounded in constrained
    // sandboxes (the server pulls in firebase-admin, googleapis and three).
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
