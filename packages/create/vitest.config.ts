import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'create',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
