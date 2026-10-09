import { createApp, definePlugin, memoryStorage, type StorageAdapter } from '@xcwds/core';
import shellClient from '@xcwds/plugin-shell/client';
import { decorateRoutes } from '@xcwds/sveltekit/routes';
import { buildTestApp, type Importer } from '@xcwds/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import client from './client.js';
import {
	MAX_RECENT,
	emptyShortcuts,
	parseShortcuts,
	withPinMoved,
	withPinToggled,
	withVisit,
	type ShortcutTool
} from './home.js';
import toolsFactory, { build } from './index.js';
import { resolveOptions, type Tool } from './options.js';

// The block needs SvelteKit's runtime; e2e tests cover it.
vi.mock('./HomeShortcuts.svelte', () => ({ default: function HomeShortcuts() {} }));

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-tools': () => import('./index.js'),
		'@xcwds/plugin-tools/client': () => import('./client.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

const tool = (name: string, extra: Partial<Tool> = {}): Tool => ({
	path: `/utils/${name}`,
	name: name.toUpperCase(),
	emoji: '🔧',
	blurb: `The ${name} tool.`,
	...extra
});

const items = [
	tool('a'),
	tool('b', { shortcut: true }),
	tool('c'),
	tool('d'),
	tool('private', { private: true })
];
const options = { path: '/utils', title: 'Utils', items };

describe('options', () => {
	it('fills in defaults and refuses mistakes', async () => {
		expect(resolveOptions()).toEqual({
			path: '/tools',
			title: 'Tools',
			emoji: undefined,
			items: []
		});
		expect(resolveOptions(options).items).toEqual(items);
		expect(() => resolveOptions({ path: '/' })).toThrow(/`path`/);
		expect(() => resolveOptions({ path: '/utils/' })).toThrow(/`path`/);
		expect(() => resolveOptions({ title: ' ' })).toThrow(/`title`/);
		expect(() => resolveOptions({ items: {} })).toThrow(/`items`/);
		expect(() => resolveOptions({ items: [{ ...tool('a'), path: 'a' }] })).toThrow(/`items\[0\]`/);
		expect(() => resolveOptions({ items: [{ ...tool('a'), blurb: '' }] })).toThrow(
			/"\/utils\/a" needs a `blurb`/
		);
		expect(() => resolveOptions({ items: [{ ...tool('a'), private: 'yes' }] })).toThrow(
			/`private`/
		);
		expect(() => resolveOptions({ items: [tool('a', { private: true, shortcut: true })] })).toThrow(
			/private, so it can't be a manifest shortcut/
		);
		expect(() => resolveOptions({ items: [tool('a'), tool('a')] })).toThrow(/two tools/);
		expect(() => resolveOptions({ path: '/utils/a', items: [tool('a')] })).toThrow(
			/index page's path/
		);
		expect(() => resolveOptions({ items: [{ ...tool('a'), recents: false }] })).toThrow(
			/unknown key `recents`/
		);
		expect(() => resolveOptions({ tools: [] })).toThrow(/unknown option `tools`/);
		await expect(
			buildTestApp({ plugins: [toolsFactory({ path: 'utils' })] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-tools: `path`/);
	});
});

// Ported from xcwds.github.io's home.spec.ts.
describe('the Home rules', () => {
	const rules: ShortcutTool[] = [
		{ path: '/utils/a' },
		{ path: '/utils/b' },
		{ path: '/utils/c' },
		{ path: '/utils/d' },
		{ path: '/utils/private', private: true }
	];

	it('keep the most recent tools first, without duplicates, at most MAX_RECENT', () => {
		let s = emptyShortcuts();
		for (const p of ['/utils/a', '/utils/b', '/utils/a', '/utils/c', '/utils/d'])
			s = withVisit(s, p, rules);
		expect(s.recent).toEqual(['/utils/d', '/utils/c', '/utils/a']);
		expect(s.recent).toHaveLength(MAX_RECENT);
	});

	it('ignore pages that are not tools, and private tools', () => {
		const s = emptyShortcuts();
		expect(withVisit(s, '/recipes/brownies', rules)).toBe(s);
		expect(withVisit(s, '/utils/private', rules)).toBe(s);
	});

	it('toggle and move pins within bounds', () => {
		let s = withPinToggled(withPinToggled(emptyShortcuts(), '/utils/a'), '/utils/b');
		expect(s.pins).toEqual(['/utils/a', '/utils/b']);
		s = withPinMoved(s, '/utils/b', -1);
		expect(s.pins).toEqual(['/utils/b', '/utils/a']);
		expect(withPinMoved(s, '/utils/b', -1)).toBe(s);
		expect(withPinMoved(s, '/utils/a', 1)).toBe(s);
		expect(withPinToggled(s, '/utils/b').pins).toEqual(['/utils/a']);
	});

	it('drop removed tools, private recents, duplicates and junk from what was saved', () => {
		expect(
			parseShortcuts(
				{
					pins: ['/utils/gone', '/utils/b', '/utils/b', 3, '/utils/private'],
					recent: ['/utils/private', '/utils/gone', '/utils/a', '/utils/b', '/utils/c', '/utils/d']
				},
				rules
			)
		).toEqual({
			pins: ['/utils/b', '/utils/private'],
			recent: ['/utils/a', '/utils/b', '/utils/c']
		});
		expect(parseShortcuts('nope', rules)).toBeUndefined();
		expect(parseShortcuts({}, rules)).toEqual(emptyShortcuts());
	});
});

describe('the build', () => {
	it('adds the index page and each tool to the route registry, and shortcuts to the manifest', async () => {
		const app = await buildTestApp(
			{
				plugins: [
					toolsFactory({ ...options, emoji: '🧰' }),
					// Another plugin adds its own tool, in its build entry and its page entry.
					definePlugin((a) => a.tools!.add(tool('extra', { shortcut: true })))
				]
			},
			{ import: importer }
		);
		expect(app.routes.get('/utils')).toMatchObject({ title: 'Utils', emoji: '🧰', width: 'wide' });
		expect(app.routes.get('/utils/a')).toMatchObject({
			title: 'A',
			emoji: '🔧',
			parent: '/utils',
			width: 'narrow'
		});
		expect(app.routes.get('/utils/a')?.private).toBeUndefined();
		expect(app.routes.get('/utils/private')?.private).toBe(true);
		expect(app.tools!.list().map((t) => t.path)).toEqual([
			...items.map((t) => t.path),
			'/utils/extra'
		]);

		const builder = createApp();
		decorateRoutes(builder);
		builder.register(build, options);
		builder.register(definePlugin((a) => a.tools!.add(tool('extra', { shortcut: true }))));
		await builder.ready();
		expect(builder.routes.get('/utils/extra')?.parent).toBe('/utils');
		expect(
			await builder.hooks.reduce('onManifest', {
				name: 'A',
				scope: '/sub/',
				shortcuts: [{ name: 'X', url: '/sub/x' }]
			})
		).toEqual({
			name: 'A',
			scope: '/sub/',
			shortcuts: [
				{ name: 'X', url: '/sub/x' },
				{ name: 'B', description: 'The b tool.', url: '/sub/utils/b' },
				{ name: 'EXTRA', description: 'The extra tool.', url: '/sub/utils/extra' }
			]
		});
		expect(() => builder.tools!.add({ ...tool('bad'), path: 'bad' })).toThrow(/`path`/);

		const plain = createApp();
		decorateRoutes(plain);
		plain.register(build, { items: [tool('a')] });
		await plain.ready();
		expect(await plain.hooks.reduce('onManifest', { name: 'A' })).toEqual({ name: 'A' });
	});
});

describe('the page', () => {
	// The shell applies its nav setting to <html> on boot.
	beforeEach(() => void vi.stubGlobal('document', { documentElement: { setAttribute() {} } }));
	afterEach(() => void vi.unstubAllGlobals());

	it('pins, reorders and unpins tools, with toasts, and keeps them across tabs', async () => {
		const app = await buildTestApp({
			plugins: [
				[shellClient, {}],
				[client, options]
			]
		});
		const toasts: string[] = [];
		app.shell!.toasts.subscribe((list) =>
			list.forEach((t) => toasts.includes(t.message) || toasts.push(t.message))
		);
		const shortcuts = app.tools!.shortcuts!;
		expect(shortcuts.togglePin('/utils/c')).toBe(true);
		expect(shortcuts.togglePin('/utils/a')).toBe(true);
		expect(shortcuts.state.pins).toEqual(['/utils/c', '/utils/a']);
		expect(toasts).toEqual(['Pinned to Home.']);
		expect(shortcuts.movePin('/utils/a', -1)).toBe(true);
		expect(shortcuts.state.pins).toEqual(['/utils/a', '/utils/c']);

		const other = await app.openTab();
		expect(other.tools!.shortcuts!.state.pins).toEqual(['/utils/a', '/utils/c']);
		other.tools!.shortcuts!.togglePin('/utils/a');
		await app.settle();
		expect(shortcuts.state.pins).toEqual(['/utils/c']);
		expect(other.shell!.toasts.list().map((t) => t.message)).toEqual(['Removed from Home.']);
		// Not a tool: nothing happens.
		expect(shortcuts.togglePin('/hello')).toBe(false);
		expect(shortcuts.state.pins).toEqual(['/utils/c']);
	});

	it('records recently used tools on navigation, never private ones', async () => {
		const app = await buildTestApp({ plugins: [[client, options]] }, { path: '/utils/a' });
		for (const path of ['/hello', '/utils/b', '/utils/private', '/utils/c/', '/utils/d'])
			await app.navigate(path);
		expect(app.tools!.shortcuts!.state.recent).toEqual(['/utils/d', '/utils/c', '/utils/b']);
		const saved = app.sharedStorage.backing.get('app:tools:shortcuts');
		expect(JSON.parse(saved!)).toEqual({ pins: [], recent: ['/utils/d', '/utils/c', '/utils/b'] });
	});

	it('only writes when something changes', async () => {
		const storage = memoryStorage();
		const set = vi.spyOn(storage, 'set');
		const app = await buildTestApp({ plugins: [[client, options]] }, { storage });
		await app.navigate('/hello');
		expect(set).not.toHaveBeenCalled();
		await app.navigate('/utils/a');
		await app.navigate('/utils/a');
		expect(set).toHaveBeenCalledOnce();
	});

	it('ignores saved tools that no longer exist', async () => {
		const storage = memoryStorage({
			'app:tools:shortcuts': JSON.stringify({
				pins: ['/utils/retired', '/utils/a'],
				recent: ['/utils/retired', '/utils/b', '/utils/private']
			})
		});
		const app = await buildTestApp({ plugins: [[client, options]] }, { storage });
		expect(app.tools!.shortcuts!.state).toEqual({ pins: ['/utils/a'], recent: ['/utils/b'] });
	});

	it("with storage blocked, reports a pin that couldn't be saved but not a visit", async () => {
		const blocked: StorageAdapter = {
			get: () => {
				throw new DOMException('blocked', 'SecurityError');
			},
			set: () => {
				throw new DOMException('blocked', 'SecurityError');
			},
			remove: () => {},
			keys: () => []
		};
		const app = await buildTestApp(
			{
				plugins: [
					[shellClient, {}],
					[client, options]
				]
			},
			{ storage: blocked }
		);
		const messages = () => app.shell!.toasts.list().map((t) => t.message);
		await app.navigate('/utils/a');
		expect(messages()).toEqual([]);
		// Still listed in this tab.
		expect(app.tools!.shortcuts!.state.recent).toEqual(['/utils/a']);
		expect(app.tools!.shortcuts!.togglePin('/utils/b')).toBe(false);
		expect(messages()).toEqual([expect.stringContaining("Couldn't save")]);
		expect(app.tools!.shortcuts!.state.pins).toEqual(['/utils/b']);
	});

	it('adds its block to Home with the shell, and takes it away on close', async () => {
		const app = await buildTestApp({
			plugins: [
				[shellClient, {}],
				[client, options]
			]
		});
		await vi.waitFor(() => expect(app.shell!.home.list()).toHaveLength(1));
		const home = app.shell!.home;
		await app.close();
		expect(home.list()).toHaveLength(0);
		// Without the shell there is no Home to add to.
		const bare = await buildTestApp({ plugins: [[client, options]] });
		expect(bare.shell).toBeUndefined();
	});
});
