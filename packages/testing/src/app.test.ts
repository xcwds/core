import { definePlugin, descriptor, type App } from '@xcwds/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, type TestApp } from './app.js';
import { fakeClock } from './clock.js';
import type { Importer } from './plugins.js';
import { sharedStorage } from './tabs.js';

const open: TestApp[] = [];
async function build(...args: Parameters<typeof buildTestApp>) {
	const app = await buildTestApp(...args);
	open.push(app);
	return app;
}
afterEach(async () => {
	for (const app of open.splice(0)) await app.close();
	vi.useRealTimers();
});

/** A plugin that saves a counter and records other tabs' changes. */
const counter = definePlugin(
	(app: App) => {
		const entry = app.storage.entry('count', { label: 'Count', parse: Number });
		const seen: unknown[] = [];
		app.decorate('counter', {
			entry,
			seen,
			bump: () => app.storage.write(entry, (app.storage.read(entry) ?? 0) + 1)
		});
		app.addHook('onStorageChange', (key, value) => void seen.push([key, value]));
	},
	{ name: 'counter', encapsulate: false }
);
type Counter = { bump(): boolean; seen: unknown[] };
const counterOf = (app: TestApp) => (app as unknown as { counter: Counter }).counter;

describe('buildTestApp', () => {
	it('boots plugins like <App>: load, onBoot, onReady, the first page', async () => {
		const order: string[] = [];
		const app = await build({
			plugins: [
				(a) => {
					a.addHook('onBoot', () => void order.push('boot'));
					a.addHook('onReady', () => void order.push('ready'));
					a.addHook('onNavigate', (to, from) => void order.push(`guard ${to.path} ${from}`));
					a.addHook('afterNavigate', (to) => void order.push(`after ${to.url?.href}`));
				}
			]
		});
		expect(order).toEqual(['boot', 'ready', 'guard / null', 'after http://localhost/']);
		expect(app.path).toBe('/');
	});

	it('runs guards, redirects and afterNavigate on navigate(), within route prefixes', async () => {
		const seen: string[] = [];
		const timer = definePlugin(
			(a) => {
				a.addHook('onNavigate', (to) =>
					to.path === '/utils/timer/old' ? '/utils/timer' : undefined
				);
				a.addHook('afterNavigate', (to) => void seen.push(`timer ${to.path}`));
			},
			{ name: 'timer' }
		);
		const app = await build(
			{
				plugins: [
					[timer, { prefix: '/utils/timer' }],
					(a) => void a.addHook('onNavigate', (to) => (to.path === '/locked' ? false : undefined))
				]
			},
			{ base: '/sub' }
		);
		expect(await app.navigate('/utils/timer/old?x=1')).toEqual({
			path: '/utils/timer',
			redirects: ['/utils/timer'],
			cancelled: false
		});
		expect(await app.navigate('/locked')).toEqual({
			path: '/utils/timer',
			redirects: [],
			cancelled: true
		});
		await app.navigate('/about');
		expect(app.path).toBe('/about');
		expect(seen).toEqual(['timer /utils/timer']);
	});

	it('passes URLs with the base path and the query to hooks', async () => {
		const urls: string[] = [];
		const app = await build(
			{ plugins: [(a) => void a.addHook('afterNavigate', (to) => void urls.push(String(to.url)))] },
			{ base: '/sub', path: '/a/' }
		);
		await app.navigate('b?q=1');
		expect(urls).toEqual(['http://localhost/sub/a/', 'http://localhost/sub/b?q=1']);
		expect(app.path).toBe('/b?q=1');
	});

	it('ignores false on the first page and stops redirect loops', async () => {
		const errors: unknown[] = [];
		const app = await build(
			{
				plugins: [
					(a) => {
						a.addHook('onError', (e) => void errors.push(e));
						a.addHook('onNavigate', (to) => {
							if (to.path === '/') return false;
							if (to.path === '/ping') return '/pong';
							if (to.path === '/pong') return '/ping';
						});
					}
				]
			},
			{ logLevel: 'silent' }
		);
		expect(app.path).toBe('/');
		const result = await app.navigate('/ping');
		expect(result).toMatchObject({ path: '/', cancelled: true });
		expect(result.redirects).toHaveLength(5);
		expect(errors).toEqual([
			expect.objectContaining({ message: expect.stringMatching(/more than 5/) })
		]);
	});

	it('follows a redirect from the first page, after it was shown', async () => {
		const seen: string[] = [];
		const app = await build({
			plugins: [
				(a) => {
					a.addHook('onNavigate', (to, from) => {
						seen.push(`guard ${to.path} ${from?.path}`);
						return to.path === '/' ? '/home' : undefined;
					});
					a.addHook('afterNavigate', (to) => void seen.push(`after ${to.path}`));
				}
			]
		});
		expect(app.path).toBe('/home');
		expect(seen).toEqual(['guard / undefined', 'after /', 'guard /home /', 'after /home']);
	});

	it('shares storage between tabs, with storage events', async () => {
		const shared = sharedStorage();
		const first = await build({ plugins: [counter] }, { storage: shared });
		const second = await first.openTab();
		expect(second.shared).toBe(shared);
		counterOf(first).bump();
		counterOf(first).bump();
		await first.settle();
		// Like localStorage, the kernel reads the value when an event arrives: the latest one.
		expect(counterOf(second).seen).toEqual([
			['app:counter:count', 2],
			['app:counter:count', 2]
		]);
		expect(counterOf(first).seen).toEqual([]);
		expect(shared.backing.get('app:counter:count')).toBe('2');
	});

	it('reloads settings another tab saves', async () => {
		const theme = definePlugin(
			(a) =>
				void a.settings.field('theme', {
					default: 'system',
					parse: (v) => (typeof v === 'string' ? v : undefined)
				}),
			{ name: 'theme' }
		);
		const first = await build({ plugins: [theme] });
		const second = await first.openTab({ path: '/settings' });
		expect(second.path).toBe('/settings');
		first.settings.set({ theme: 'dark' });
		await first.settle();
		expect(second.settings.get().theme).toBe('dark');
	});

	it('closes every tab with the first, then restores the real clock', async () => {
		const clock = fakeClock(0);
		const first = await buildTestApp({ plugins: [] }, { now: clock });
		const second = await first.openTab();
		expect(first.clock).toBe(clock);
		expect(Date.now()).toBe(0);
		await second.close();
		expect(clock.installed).toBe(true);
		const third = await first.openTab();
		await first.close();
		expect(third.hooks.plugins('onReady')).toEqual([]);
		expect(clock.installed).toBe(false);
		expect(Date.now()).toBeGreaterThan(1e12);
		await first.close(); // Twice is fine.
		await expect(first.openTab()).rejects.toThrow(/closed/);
	});

	it('runs timers that count against wall-clock end times', async () => {
		const timer = definePlugin(
			(a) => {
				const state = { end: 0, rang: false };
				a.decorate('timer', state);
				a.addHook('onReady', () => {
					state.end = Date.now() + 60_000;
					const tick = () => {
						if (Date.now() >= state.end) state.rang = true;
						else setTimeout(tick, 1000);
					};
					setTimeout(tick, 1000);
				});
			},
			{ name: 'timer', encapsulate: false }
		);
		const app = await build({ plugins: [timer] }, { now: new Date('2026-03-01T12:00:00Z') });
		const state = (app as unknown as { timer: { end: number; rang: boolean } }).timer;
		expect(state.end).toBe(Date.parse('2026-03-01T12:01:00Z'));
		app.clock!.jump(5 * 60_000);
		expect(state.rang).toBe(false);
		await app.clock!.advance(1000);
		expect(state.rang).toBe(true);
	});

	it('restores the clock when booting fails', async () => {
		const clock = fakeClock();
		await expect(
			buildTestApp(
				{
					plugins: [
						() => {
							throw new Error('boom');
						}
					]
				},
				{ now: clock, logLevel: 'silent' }
			)
		).rejects.toThrow('boom');
		expect(clock.installed).toBe(false);
	});

	it('refuses a decorator that clashes with a helper', async () => {
		await expect(
			buildTestApp(
				{
					plugins: [
						definePlugin((a) => void a.decorate('navigate', 1), {
							name: 'nav',
							encapsulate: false
						})
					]
				},
				{ logLevel: 'silent' }
			)
		).rejects.toThrow(/"navigate" clashes/);
	});

	it('loads descriptors from their package entries, with build routes and the config', async () => {
		const timers = descriptor<{ prefix: string; minutes: number }>('xcwds-plugin-fake');
		const seen: unknown[] = [];
		const modules: Record<string, Record<string, unknown>> = {
			'xcwds-plugin-fake': {
				build: (app: App) => void app.route({ path: '/', title: 'Timer' })
			},
			'xcwds-plugin-fake/client': {
				default: definePlugin(
					(app: App, options: unknown) => {
						seen.push(options, app.storage.entry('x', { label: 'x', parse: String }).key);
					},
					{ name: 'xcwds-plugin-fake' }
				)
			}
		};
		const importer: Importer = async (id) => {
			if (modules[id]) return modules[id];
			throw Object.assign(new Error('nope'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
		};
		const app = await build(
			{
				brand: { name: 'Pocketbox' },
				storage: { prefix: 'pb:' },
				plugins: [timers({ prefix: '/utils/timer', minutes: 3 })]
			},
			{ import: importer }
		);
		expect(app.routes.get('/utils/timer/')).toMatchObject({
			path: '/utils/timer',
			title: 'Timer',
			plugin: 'xcwds-plugin-fake'
		});
		// `prefix` is the kernel's register option, not the plugin's.
		expect(seen).toEqual([{ minutes: 3 }, 'pb:fake:x']);
	});

	it('explains how to fix a descriptor that fails to import', async () => {
		await expect(
			buildTestApp(
				{ plugins: [descriptor('xcwds-plugin-missing')()] },
				{
					import: async () => {
						throw new Error('Cannot find package');
					}
				}
			)
		).rejects.toThrow(/import: \(id\) => import\(id\)/);
	});
});
