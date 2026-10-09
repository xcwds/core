import { definePlugin } from '@xcwds/core';
import { buildTestApp, type Importer } from '@xcwds/testing';
import { describe, expect, it } from 'vitest';
import client from './client.js';
import settingsFactory from './index.js';
import { backupFileName, resolveOptions, sectionOrder, sectionTitle } from './options.js';

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-settings': () => import('./index.js'),
		'@xcwds/plugin-settings/client': () => import('./client.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

describe('options', () => {
	it('fills in defaults and refuses mistakes', async () => {
		expect(resolveOptions()).toEqual({
			path: '/settings',
			title: 'Settings',
			emoji: '⚙️',
			sections: {},
			source: null,
			backupName: 'backup'
		});
		expect(() => resolveOptions({ path: 'settings' })).toThrow(/`path`/);
		expect(() => resolveOptions({ title: '' })).toThrow(/`title`/);
		expect(() => resolveOptions({ sections: { tools: 3 } })).toThrow(/`sections`/);
		expect(() => resolveOptions({ source: 'http://example.com' })).toThrow(/`source`/);
		expect(() => resolveOptions({ backupName: 'my backup' })).toThrow(/`backupName`/);
		expect(() => resolveOptions({ about: 'x' })).toThrow(/unknown option `about`/);
		await expect(
			buildTestApp({ plugins: [settingsFactory({ path: '/' })] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-settings: `path`/);
	});

	it('names backups by date and orders sections', () => {
		expect(backupFileName('xcwds-backup', new Date(2026, 0, 5, 23, 59))).toBe(
			'xcwds-backup-2026-01-05.json'
		);
		expect(sectionOrder(['tools', 'timers', 'appearance', 'tools'], {})).toEqual([
			'appearance',
			'timers',
			'tools'
		]);
		expect(sectionOrder(['timers', 'tools'], { tools: 'Tool defaults' })).toEqual([
			'tools',
			'timers'
		]);
		expect(sectionTitle('tools', { tools: 'Tool defaults' })).toBe('Tool defaults');
		expect(sectionTitle('appearance', {})).toBe('Appearance');
		expect(sectionTitle('tool-defaults', {})).toBe('Tool defaults');
	});
});

describe('the plugin', () => {
	it('adds the settings page to the route registry', async () => {
		const app = await buildTestApp(
			{ plugins: [settingsFactory({ path: '/prefs', title: 'Preferences' })] },
			{ import: importer }
		);
		expect(app.routes.get('/prefs')).toMatchObject({
			title: 'Preferences',
			emoji: '⚙️',
			width: 'narrow'
		});
		expect(app.settingsPage!.options.path).toBe('/prefs');
	});

	it('lets plugins add sections in order, and controls for their fields', async () => {
		const A = (() => {}) as never;
		const B = (() => {}) as never;
		const app = await buildTestApp({
			plugins: [
				[client, {}],
				definePlugin((a) => {
					a.addHook('onBoot', () => {
						a.settingsPage!.add(A, { order: 300 });
						a.settingsPage!.add(B, { order: -100, props: { x: 1 } });
					});
				})
			]
		});
		const page = app.settingsPage!;
		expect(page.sections()).toEqual([
			{ component: B, props: { x: 1 }, order: -100 },
			{ component: A, order: 300 }
		]);
		let calls = 0;
		const stop = page.subscribe(() => calls++);
		const remove = page.control('nav', A);
		expect(page.controls().get('nav')).toBe(A);
		page.control('nav', B)();
		remove();
		expect(page.controls().has('nav')).toBe(false);
		stop();
		expect(calls).toBe(4);
	});
});
