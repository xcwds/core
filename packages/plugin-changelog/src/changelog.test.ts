import { definePlugin } from '@xcwds/core';
import { buildTestApp, memoryStorage, type Importer } from '@xcwds/testing';
import { describe, expect, it, vi } from 'vitest';
import client from './client.js';
import changelog from './index.js';
import { resolveOptions, type ChangelogEntry } from './options.js';

vi.mock('./WhatsNew.svelte', () => ({ default: () => {} }));

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-changelog': () => import('./index.js'),
		'@xcwds/plugin-changelog/client': () => import('./client.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

const notes = (...ids: number[]): ChangelogEntry[] =>
	ids.map((id) => ({ id, date: '2026-10-09', items: [`Change ${id}`] }));

/** Stands in for plugin-update, plugin-shell's toast and plugin-settings' page. */
const neighbours = ({ justUpdated = false } = {}) => {
	const toasts: unknown[][] = [];
	const sections: unknown[] = [];
	const plugin = definePlugin(
		(app) => {
			app.decorate('update', { state: { justUpdated } } as never);
			app.decorate('toast', ((...args: unknown[]) => void toasts.push(args)) as never);
			app.decorate('settingsPage', {
				options: { path: '/settings' },
				add(component: unknown, options: unknown) {
					const section = { component, options };
					sections.push(section);
					return () => void sections.splice(sections.indexOf(section), 1);
				}
			} as never);
		},
		{ name: 'neighbours', encapsulate: false }
	);
	return { plugin, toasts, sections };
};

describe('options', () => {
	it('fills in defaults and refuses mistakes', async () => {
		expect(resolveOptions()).toEqual({ entries: [], show: 10, storageKey: undefined });
		expect(resolveOptions({ entries: notes(2, 1), show: 1 }).entries).toEqual(notes(2, 1));
		expect(() => resolveOptions({ entries: notes(1, 2) })).toThrow(/newest first/);
		expect(() => resolveOptions({ entries: notes(1, 1) })).toThrow(/unique ids/);
		expect(() => resolveOptions({ entries: notes(0) })).toThrow(/`id`/);
		expect(() => resolveOptions({ entries: [{ id: 1, date: '9 Oct', items: ['x'] }] })).toThrow(
			/`date`/
		);
		expect(() => resolveOptions({ entries: [{ id: 1, date: '2026-10-09', items: [] }] })).toThrow(
			/`items`/
		);
		expect(() => resolveOptions({ show: 0 })).toThrow(/`show`/);
		expect(() => resolveOptions({ storageKey: 'seen' })).toThrow(/`storageKey`/);
		await expect(
			buildTestApp({ plugins: [changelog({ nope: 1 } as never)] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-changelog: unknown option `nope`/);
	});
});

describe('the page', () => {
	it('sees everything on a fresh install, and lists the newest `show`', async () => {
		const app = await buildTestApp({ plugins: [[client, { entries: notes(3, 2, 1), show: 2 }]] });
		expect(app.changelog!.seen()).toBe(3);
		expect(app.changelog!.entries.map((e) => e.id)).toEqual([3, 2]);
		expect(app.sharedStorage.backing.get('app:changelog:seen')).toBe('3');
	});

	it('keeps what was seen, and marks the rest seen when asked', async () => {
		const storage = memoryStorage({ 'app:changelog:seen': '1' });
		const app = await buildTestApp(
			{ plugins: [[client, { entries: notes(3, 2, 1) }]] },
			{ storage }
		);
		const seen: number[] = [];
		app.changelog!.subscribe((s) => void seen.push(s));
		app.changelog!.markSeen();
		expect(seen).toEqual([1, 3]);
		expect(storage.get('app:changelog:seen')).toBe('3');
	});

	it('follows another tab marking them seen', async () => {
		const app = await buildTestApp(
			{ plugins: [[client, { entries: notes(2, 1), storageKey: 'app:settings:whats-new-seen' }]] },
			{ storage: memoryStorage({ 'app:settings:whats-new-seen': '1' }) }
		);
		const other = await app.openTab();
		other.changelog!.markSeen();
		await app.settle();
		expect(app.changelog!.seen()).toBe(2);
	});

	it('after an update with new notes, toasts a link to What’s new', async () => {
		const { plugin, toasts, sections } = neighbours({ justUpdated: true });
		const app = await buildTestApp(
			{ plugins: [plugin, [client, { entries: notes(2, 1) }]] },
			{ storage: memoryStorage({ 'app:changelog:seen': '1' }) }
		);
		expect(toasts).toEqual([
			[
				'App updated.',
				{ action: { label: "See what's new", path: '/settings', hash: '#whats-new' } }
			]
		]);
		await vi.waitFor(() => expect(sections).toHaveLength(1));
		expect(sections[0]).toMatchObject({ options: { order: 300 } });
		await app.close();
		expect(sections).toEqual([]);
	});

	it('says nothing after an update without new notes, or without an update', async () => {
		const updated = neighbours({ justUpdated: true });
		await buildTestApp(
			{ plugins: [updated.plugin, [client, { entries: notes(2, 1) }]] },
			{ storage: memoryStorage({ 'app:changelog:seen': '2' }) }
		);
		expect(updated.toasts).toEqual([]);
		const plain = neighbours();
		await buildTestApp(
			{ plugins: [plain.plugin, [client, { entries: notes(2, 1) }]] },
			{ storage: memoryStorage({ 'app:changelog:seen': '1' }) }
		);
		expect(plain.toasts).toEqual([]);
	});
});
