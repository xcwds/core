import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';
import pkg from '../package.json' with { type: 'json' };

describe('@xcwds/core', () => {
	it('exports the package version', () => {
		expect(VERSION).toBe(pkg.version);
	});
});
