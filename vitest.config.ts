import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Several test files drive the same example manifests, which use shared .sandbox-tmp/<name>
    // workspaces. Run test files serially so concurrent rm/create of those dirs can't race
    // (deterministic across OSes, especially Windows file locking).
    fileParallelism: false,
  },
});
