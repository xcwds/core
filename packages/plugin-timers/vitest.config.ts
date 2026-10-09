import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'plugin-timers',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
