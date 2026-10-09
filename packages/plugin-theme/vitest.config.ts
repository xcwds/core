import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'plugin-theme',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
