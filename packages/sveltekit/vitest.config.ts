import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'sveltekit',
		environment: 'node',
		include: ['src/**/*.test.ts'],
		expect: { requireAssertions: true }
	}
});
