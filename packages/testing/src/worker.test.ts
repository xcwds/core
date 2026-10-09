import { definePlugin, descriptor, type App } from '@xcwds/core';
import { describe, expect, it } from 'vitest';
import { buildTestWorker, MemoryCache } from './worker.js';

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

describe('MemoryCache', () => {
	it('stores clones and deletes', async () => {
		const cache = new MemoryCache('http://localhost');
		await cache.put('/x', new Response('x'));
		expect(await (await cache.match('/x'))?.text()).toBe('x');
		expect(await (await cache.match('/x'))?.text()).toBe('x');
		expect(await cache.delete('/x')).toBe(true);
		expect(await cache.match('/x')).toBeUndefined();
		await expect(cache.add('/nothing')).rejects.toThrow(/404/);
	});
});
