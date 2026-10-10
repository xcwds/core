import { defineProject } from 'vitest/config';

// Unit tests run in Node, without SvelteKit: src/**/*.test.ts.
export default defineProject({
	test: {
		name: 'site',
		include: ['src/**/*.test.ts'],
		environment: 'node',
		expect: { requireAssertions: true }
	}
});
