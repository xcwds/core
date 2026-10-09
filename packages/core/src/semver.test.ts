import { describe, expect, it } from 'vitest';
import { satisfies } from './semver.js';

describe('satisfies', () => {
	it.each([
		['1.2.3', '^1.0.0', true],
		['2.0.0', '^1.0.0', false],
		['0.2.5', '^0.2.0', true],
		['0.3.0', '^0.2.0', false],
		['0.0.3', '^0.0.3', true],
		['0.0.4', '^0.0.3', false],
		['1.2.9', '~1.2.0', true],
		['1.3.0', '~1.2.0', false],
		['1.5.0', '1.x', true],
		['2.0.0', '1', false],
		['1.2.3', '1.2.3', true],
		['1.2.4', '=1.2.3', false],
		['3.0.0', '>=2.0.0 <4', true],
		['4.0.0', '>=2.0.0 <4', false],
		['5.0.0', '^1.0.0 || ^5.0.0', true],
		['9.9.9', '*', true],
		['0.0.0', '*', true],
		['2.0.0', '>1.x', true],
		['1.9.0', '>1.x', false],
		['1.9.0', '<=1.x', true],
		['2.0.0-beta.1', '^1.0.0', false],
		['2.0.0-beta.1', '^2.0.0-beta.0', true],
		['2.0.0-beta.1', '*', false],
		['1.0.0', 'not a range', false],
		['nope', '*', false]
	])('%s in %s → %s', (version, range, expected) => {
		expect(satisfies(version, range)).toBe(expected);
	});
});
