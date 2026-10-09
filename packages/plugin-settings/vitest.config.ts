import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'plugin-settings',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
