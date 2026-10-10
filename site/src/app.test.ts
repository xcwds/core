import { validateConfig } from '@xcwds/core';
import { expect, it } from 'vitest';
import config from '../xcwds.config.js';

// Unit tests run in Node. To test a plugin of your own, boot it with buildTestApp() from
// @xcwds/testing.
it('has a valid config', () => {
	expect(validateConfig(config)).toMatchObject({ ok: true });
});
