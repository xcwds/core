import { describe, expect, it } from 'vitest';
import { notJson } from './json.js';

describe('notJson', () => {
	it('accepts JSON values', () => {
		expect(notJson({ a: [1, 'x', true, null, { b: 2.5 }] })).toBeNull();
		expect(notJson(Object.create(null))).toBeNull();
	});

	it('names the first value JSON would drop or change', () => {
		expect(notJson({ a: [1, () => 1] }, 'options')).toBe('options.a[1]');
		expect(notJson({ a: undefined }, 'options')).toBe('options.a');
		expect(notJson({ when: new Date() }, 'o')).toBe('o.when');
		expect(notJson({ n: NaN }, 'o')).toBe('o.n');
		expect(notJson({ n: 1n }, 'o')).toBe('o.n');
		// eslint-disable-next-line no-sparse-arrays
		expect(notJson([1, , 3], 'o')).toBe('o[1]');
		const loop: Record<string, unknown> = {};
		loop.self = loop;
		expect(notJson(loop, 'o')).toBe('o.self');
	});

	it('allows the same object twice when it is not a cycle', () => {
		const shared = { x: 1 };
		expect(notJson({ a: shared, b: shared })).toBeNull();
	});
});
