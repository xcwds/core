import { buildTestApp, buildTestWorker, type Importer } from '@xcwds/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import client from './client.js';
import offline from './index.js';
import { resolveOptions } from './options.js';
import worker from './worker.js';

afterEach(() => void vi.unstubAllGlobals());

/** Resolves the plugin's own entries, as an app's test would resolve the installed package. */
const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-offline': () => import('./index.js'),
		'@xcwds/plugin-offline/client': () => import('./client.js'),
		'@xcwds/plugin-offline/worker': () => import('./worker.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

describe('options', () => {
	it('fills in defaults and refuses mistakes', () => {
		expect(resolveOptions()).toEqual({
			precache: [],
			exclude: [],
			fallback: '/404.html',
			runtimeCaching: true
		});
		expect(() => resolveOptions({ fallback: '404.html' })).toThrow(/`fallback`/);
		expect(() => resolveOptions({ precache: ['/a?b'] })).toThrow(/`precache`/);
		expect(() => resolveOptions({ exclude: 'videos' })).toThrow(/`exclude`/);
		expect(() => resolveOptions({ runtimeCaching: 'yes' })).toThrow(/`runtimeCaching`/);
		expect(() => resolveOptions({ fallbak: '/x' })).toThrow(/unknown option `fallbak`/);
	});

	it('fails the build for bad options', async () => {
		await expect(
			buildTestApp({ plugins: [offline({ fallback: 'nope' })] }, { import: importer })
		).rejects.toThrow(/@xcwds\/plugin-offline: `fallback`/);
	});
});

describe('the worker', () => {
	/** A network that serves `version` for every path, until it goes away. */
	function network() {
		const state = { online: true, version: 'v1', status: 200, requests: [] as string[] };
		return {
			state,
			answer: (request: Request) => {
				const url = new URL(request.url);
				state.requests.push(url.pathname + url.search);
				if (!state.online) throw new TypeError('Failed to fetch');
				return new Response(`${state.version} ${url.pathname}${url.search}`, {
					status: state.status
				});
			}
		};
	}

	async function boot(options: Parameters<typeof offline>[0] = {}, net = network()) {
		const sw = await buildTestWorker(
			{ plugins: [offline(options)] },
			{
				import: importer,
				base: '/sub',
				prerendered: ['/sub/', '/sub/hello'],
				build: ['/sub/_app/app.js'],
				files: ['/sub/videos/intro.mp4', '/sub/robots.txt'],
				version: '1',
				network: net.answer
			}
		);
		await sw.install();
		await sw.activate();
		return { sw, net: net.state };
	}
	const text = async (response: Promise<Response | undefined>) => (await response)?.text();
	const cached = async (sw: Awaited<ReturnType<typeof boot>>['sw']) =>
		(await sw.cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search).sort();

	it('precaches the build and serves it from its own version, never the network', async () => {
		const { sw, net } = await boot({ precache: ['/data.json'], exclude: ['/videos/**'] });
		expect(await cached(sw)).toEqual([
			'/sub/',
			'/sub/404.html',
			'/sub/_app/app.js',
			'/sub/data.json',
			'/sub/hello',
			'/sub/robots.txt'
		]);
		net.version = 'v2';
		net.requests.length = 0;
		expect(await text(sw.fetch('/hello'))).toBe('v1 /sub/hello');
		expect(await text(sw.fetch('/data.json'))).toBe('v1 /sub/data.json');
		expect(net.requests).toEqual([]);
		// A new version waits: nothing here makes it take over.
		expect(sw.skippedWaiting).toBe(false);
	});

	it('keeps other pages and files for offline use, but not query strings or failures', async () => {
		const { sw, net } = await boot();
		expect(await text(sw.fetch('/notes/1'))).toBe('v1 /sub/notes/1');
		expect(await text(sw.fetch('/search?q=secret'))).toBe('v1 /sub/search?q=secret');
		net.status = 500;
		expect((await sw.fetch('/broken'))?.status).toBe(500);
		expect(await cached(sw)).toContain('/sub/notes/1');
		expect((await cached(sw)).filter((p) => p.includes('search') || p.includes('broken'))).toEqual(
			[]
		);

		net.online = false;
		// Cached at runtime: still there offline.
		expect(await text(sw.fetch('/notes/1'))).toBe('v1 /sub/notes/1');
		// Never cached: navigations get the fallback page (which boots the app's error page).
		expect(await text(sw.fetch('/search?q=secret', { mode: 'navigate' }))).toBe('v1 /sub/404.html');
		await expect(sw.fetch('/broken')).rejects.toThrow('Failed to fetch');
	});

	it('never caches excluded paths, and uses the fallback page it is given', async () => {
		const { sw, net } = await boot({ exclude: ['/videos/**', '/private'], fallback: '/offline' });
		expect(await cached(sw)).toContain('/sub/offline');
		expect(await cached(sw)).not.toContain('/sub/videos/intro.mp4');
		expect(await text(sw.fetch('/videos/intro.mp4'))).toBe('v1 /sub/videos/intro.mp4');
		expect(await text(sw.fetch('/private'))).toBe('v1 /sub/private');
		expect(await cached(sw)).not.toContain('/sub/private');
		net.online = false;
		await expect(sw.fetch('/videos/intro.mp4')).rejects.toThrow('Failed to fetch');
		expect(await text(sw.fetch('/private', { mode: 'navigate' }))).toBe('v1 /sub/offline');
	});

	it("doesn't cache at runtime when told not to", async () => {
		const { sw, net } = await boot({ runtimeCaching: false });
		await sw.fetch('/notes/1');
		net.online = false;
		expect(await text(sw.fetch('/notes/1', { mode: 'navigate' }))).toBe('v1 /sub/404.html');
	});

	it('serves the response even when caching it fails', async () => {
		const sw = await buildTestWorker(
			{ plugins: [[worker, {}]] },
			{
				logLevel: 'silent',
				network: () => new Response('varies', { headers: { vary: '*' } })
			}
		);
		expect(await text(sw.fetch('/x'))).toBe('varies');
		expect(await sw.cache.keys()).toEqual([]);
	});

	it("deletes the previous versions' caches when it activates, and only its app's", async () => {
		const sw = await buildTestWorker({ plugins: [[worker, {}]] }, { version: '2' });
		const own = sw.app.worker!.cacheName;
		const previous = own.replace(/2$/, '1');
		await sw.caches.open(previous);
		await sw.caches.open('another-app');
		await sw.install();
		await sw.activate();
		expect((await sw.caches.keys()).sort()).toEqual([own, 'another-app'].sort());
	});
});

describe('the network status', () => {
	it('follows the browser once the app boots', async () => {
		const events = new EventTarget();
		vi.stubGlobal('window', events);
		vi.stubGlobal('navigator', { onLine: false });
		const app = await buildTestApp({ plugins: [[client, {}]] });
		const seen: boolean[] = [];
		app.network!.subscribe((online) => seen.push(online));
		expect(app.network!.online).toBe(false);
		events.dispatchEvent(new Event('online'));
		events.dispatchEvent(new Event('offline'));
		await app.close();
		events.dispatchEvent(new Event('online'));
		expect(seen).toEqual([false, true, false]);
	});

	it('loads from the config with its build entry', async () => {
		vi.stubGlobal('window', new EventTarget());
		vi.stubGlobal('navigator', { onLine: true });
		const app = await buildTestApp(
			{ brand: { name: 'Offline' }, plugins: [offline()] },
			{ import: importer }
		);
		expect(app.network!.online).toBe(true);
	});
});
