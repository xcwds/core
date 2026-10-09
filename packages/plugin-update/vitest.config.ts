import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'plugin-update',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
