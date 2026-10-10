import { memoryStorage } from '@xcwds/core';
import { buildTestApp, type Importer } from '@xcwds/testing';
import { describe, expect, it } from 'vitest';
import tally from './index.js';
import { resolveOptions } from './options.js';
import { add, parseTally } from './tally.js';

// Test apps load a descriptor's entries by package name. A package can't always import itself
// by name, so point the names at the source files.
const importer: Importer = async (id) => {
	if (id === 'xcwds-plugin-tally') return import('./index.js');
	if (id === 'xcwds-plugin-tally/client') return import('./client.js');
	throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
};

const NOW = new Date('2026-10-01T09:00:00Z');

describe('options', () => {
	it('fills in defaults and refuses mistakes', async () => {
		expect(resolveOptions()).toEqual({ path: '/tally', step: 1 });
		expect(() => resolveOptions({ step: 0 })).toThrow(/`step`/);
		expect(() => resolveOptions({ path: 'tally' })).toThrow(/`path`/);
		expect(() => resolveOptions({ colour: 'red' } as never)).toThrow(/unknown option `colour`/);
		// In an app, the same mistake fails while the config loads.
		await expect(
			buildTestApp({ plugins: [tally({ step: 1.5 })] }, { import: importer })
		).rejects.toThrow(/xcwds-plugin-tally: `step`/);
	});
});

describe('tally', () => {
	it('counts up from a new tally', () => {
		const first = add(undefined, 1, NOW);
		expect(first).toEqual({ count: 1, since: NOW.toISOString() });
		expect(add(first, 5)).toEqual({ count: 6, since: NOW.toISOString() });
	});

	it('ignores saved data that isn’t a tally', () => {
		expect(parseTally({ count: 3, since: NOW.toISOString() })).toEqual({
			count: 3,
			since: NOW.toISOString()
		});
		expect(parseTally({ count: -1, since: NOW.toISOString() })).toBeUndefined();
		expect(parseTally({ count: 3, since: 'yesterday' })).toBeUndefined();
		expect(parseTally(3)).toBeUndefined();
	});
});

describe('in an app', () => {
	it('adds its page, its setting and app.tally', async () => {
		const app = await buildTestApp({ plugins: [tally({ step: 5 })] }, { import: importer });
		expect(app.routes.get('/tally')).toMatchObject({ title: 'Tally', emoji: '🔢' });
		expect(app.settings.get().tallyStep).toBe(5);
		expect(app.tally!.entry.key).toBe('app:tally:tally');
		expect(app.storage.write(app.tally!.entry, add(undefined, 5, NOW))).toBe(true);
		expect(app.storage.read(app.tally!.entry)?.count).toBe(5);
	});

	it('upgrades a count saved by version 0', async () => {
		const app = await buildTestApp(
			{ plugins: [tally()] },
			{ import: importer, now: NOW, storage: memoryStorage({ 'app:tally:tally': '7' }) }
		);
		expect(app.storage.read(app.tally!.entry)).toEqual({ count: 7, since: NOW.toISOString() });
	});

	it('keeps a step the user picked, and ignores one out of range', async () => {
		const storage = memoryStorage({ 'app:settings': JSON.stringify({ tallyStep: 10 }) });
		const app = await buildTestApp({ plugins: [tally()] }, { import: importer, storage });
		expect(app.settings.get().tallyStep).toBe(10);
		storage.data.set('app:settings', JSON.stringify({ tallyStep: 1000 }));
		const other = await buildTestApp({ plugins: [tally()] }, { import: importer, storage });
		expect(other.settings.get().tallyStep).toBe(1);
	});
});
