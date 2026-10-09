import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'plugin-offline',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
