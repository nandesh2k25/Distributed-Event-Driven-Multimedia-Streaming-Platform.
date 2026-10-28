import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suites share one Postgres database (and create/delete rows), so files run one at a time.
    fileParallelism: false
  }
});
