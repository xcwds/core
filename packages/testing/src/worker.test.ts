import { definePlugin, descriptor, type App } from '@xcwds/core';
import { describe, expect, it } from 'vitest';
import { buildTestWorker, MemoryCache, MemoryCacheStorage } from './worker.js';

describe('buildTestWorker', () => {
	it('runs onFetch hooks within their prefix, under the base path', async () => {
		const offline = definePlugin(
			(app) =>
				void app.addHook('onFetch', (request, url) =>
					url.searchParams.has('skip') ? undefined : new Response(`timer ${url.pathname}`)
				),
			{ name: 'offline' }
		);
		const worker = await buildTestWorker(
			{ plugins: [[offline, { prefix: '/utils/timer' }]] },
			{ base: '/sub' }
		);
		expect(await (await worker.fetch('/utils/timer'))?.text()).toBe('timer /sub/utils/timer');
		expect(await worker.fetch('/utils/timer?skip')).toBeUndefined();
		expect(await worker.fetch('/other')).toBeUndefined();
		// Outside the app or another origin: the worker leaves it alone.
		expect(await worker.fetch(new Request('http://localhost/utils/timer'))).toBeUndefined();
		expect(await worker.fetch(new Request('https://example.com/sub/utils/timer'))).toBeUndefined();
		expect(await worker.fetch('/utils/timer', { method: 'POST' })).toBeUndefined();
		await worker.close();
	});

	it('installs into an in-memory cache, and runs activate and message hooks', async () => {
		const seen: unknown[] = [];
		const worker = await buildTestWorker(
			{
				plugins: [
					(app) => {
						app.addHook('onInstall', (cache) =>
							(cache as MemoryCache).addAll(['/a', '/missing']).catch(() => {})
						);
						app.addHook('onInstall', (cache) => (cache as MemoryCache).add('/a'));
						app.addHook('onActivate', () => void seen.push('activate'));
						app.addHook('onMessage', (data) => void seen.push(data));
					}
				]
			},
			{
				network: (request) =>
					new URL(request.url).pathname === '/a'
						? new Response('A')
						: new Response('', { status: 404 })
			}
		);
		const cache = await worker.install();
		expect(cache).toBe(worker.cache);
		expect((await cache.keys()).map((r) => r.url)).toEqual(['http://localhost/a']);
		expect(await (await cache.match('/a'))?.text()).toBe('A');
		expect(await (await cache.match(new Request('http://localhost/a')))?.text()).toBe('A');
		await worker.activate();
		await worker.message({ type: 'ping' });
		expect(seen).toEqual(['activate', { type: 'ping' }]);
		await worker.close();
	});

	it('loads descriptors from their ./worker entry', async () => {
		const fake = descriptor<{ answer: string }>('xcwds-plugin-fake');
		const worker = await buildTestWorker(
			{ plugins: [fake({ answer: 'hi' })] },
			{
				import: async (id) => {
					if (id === 'xcwds-plugin-fake') return {};
					if (id === 'xcwds-plugin-fake/worker')
						return {
							default: (app: App, options: { answer: string }) =>
								void app.addHook('onFetch', () => new Response(options.answer))
						};
					throw new Error(`Missing "./${id.split('/').pop()}" specifier in "xcwds-plugin-fake"`);
				}
			}
		);
		expect(await (await worker.fetch('/'))?.text()).toBe('hi');
		await worker.close();
	});
});

describe('buildTestWorker globals and errors', () => {
	it('gives hooks in-memory caches and a fake network, and puts the real ones back', async () => {
		const realFetch = globalThis.fetch;
		const hadCaches = 'caches' in globalThis;
		const worker = await buildTestWorker(
			{
				plugins: [
					(app) =>
						void app.addHook('onFetch', async (request) => {
							const cache = await caches.open('runtime');
							const cached = await cache.match(request);
							if (cached) return cached;
							const response = await fetch(request);
							await cache.put(request, response.clone());
							return response;
						})
				]
			},
			{ network: (request) => new Response(`net ${new URL(request.url).pathname}`) }
		);
		expect(globalThis.caches).toBe(worker.caches as unknown);
		expect(await (await worker.fetch('/a'))?.text()).toBe('net /a');
		expect(await (await worker.caches.match('/a', { cacheName: 'runtime' }))?.text()).toBe(
			'net /a'
		);
		expect(await (await fetch('/b')).text()).toBe('net /b');
		await expect(buildTestWorker({ plugins: [] })).rejects.toThrow(/Another test worker/);
		await worker.close();
		expect(globalThis.fetch).toBe(realFetch);
		expect('caches' in globalThis).toBe(hadCaches);
	});

	it('fails operations on errors hooks report, unless not strict', async () => {
		const failing = (app: App) => {
			app.addHook('onFetch', () => {
				throw new Error('fetch broke');
			});
			app.addHook('onInstall', () => fetch('/offline').then(() => undefined));
		};
		const strict = await buildTestWorker({ plugins: [failing] });
		await expect(strict.fetch('/')).rejects.toThrow(/fetch broke/);
		// No network by default: the hook's fetch fails as offline.
		await expect(strict.install()).rejects.toThrow(/No network in tests/);
		await strict.close();

		const lenient = await buildTestWorker(
			{ plugins: [failing] },
			{ strict: false, logLevel: 'silent' }
		);
		expect(await lenient.fetch('/')).toBeUndefined();
		expect(lenient.errors).toEqual([
			expect.objectContaining({ message: expect.stringMatching(/fetch broke/) })
		]);
		await lenient.close();
	});
});

describe('MemoryCache', () => {
	it('checks what it stores like the Cache API', async () => {
		let calls = 0;
		const cache = new MemoryCache('http://localhost', (request) => {
			calls++;
			return new URL(request.url).pathname === '/bad'
				? new Response('', { status: 500 })
				: new Response('ok');
		});
		await expect(cache.addAll(['/a', 'http://localhost/a'])).rejects.toMatchObject({
			name: 'InvalidStateError'
		});
		expect(calls).toBe(0);
		// All or nothing.
		await expect(cache.addAll(['/a', '/bad'])).rejects.toThrow(/500/);
		expect(await cache.keys()).toEqual([]);
		await expect(
			cache.put(new Request('http://localhost/p', { method: 'POST' }), new Response('x'))
		).rejects.toThrow(/GET/);
		await expect(cache.put('/partial', new Response('x', { status: 206 }))).rejects.toThrow(
			/partial/
		);
		await expect(
			cache.put('/vary', new Response('x', { headers: { vary: 'Accept, *' } }))
		).rejects.toThrow(/Vary/);
		await cache.put('/ok', new Response('ok'));
		expect(
			await cache.match(new Request('http://localhost/ok', { method: 'POST' }))
		).toBeUndefined();
		expect(
			await cache.match(new Request('http://localhost/ok', { method: 'POST' }), {
				ignoreMethod: true
			})
		).toBeDefined();
	});

	it('keeps named caches in a CacheStorage', async () => {
		const storage = new MemoryCacheStorage('http://localhost');
		expect(await storage.has('v1')).toBe(false);
		await (await storage.open('v1')).put('/x', new Response('x'));
		expect(await storage.keys()).toEqual(['v1']);
		expect(await (await storage.match('/x'))?.text()).toBe('x');
		expect(await storage.match('/x', { cacheName: 'v2' })).toBeUndefined();
		expect(await storage.delete('v1')).toBe(true);
		expect(await storage.match('/x')).toBeUndefined();
	});

	it('stores clones and deletes', async () => {
		const cache = new MemoryCache('http://localhost');
		await cache.put('/x', new Response('x'));
		expect(await (await cache.match('/x'))?.text()).toBe('x');
		expect(await (await cache.match('/x'))?.text()).toBe('x');
		expect(await cache.delete('/x')).toBe(true);
		expect(await cache.match('/x')).toBeUndefined();
		await expect(cache.add('/nothing')).rejects.toThrow(/No network in tests/);
	});
});
