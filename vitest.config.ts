import { defineConfig } from 'vitest/config';

// Unit tests for every package. The examples are covered by Playwright (`pnpm test:e2e`).
export default defineConfig({
	test: {
		projects: ['packages/*']
	}
});
