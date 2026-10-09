/**
 * `@xcwds/sveltekit/worker`: the service worker. `src/service-worker.ts` imports the generated
 * `.xcwds/worker.js` (RFC 0001, decision 3), which calls `startWorker()` with SvelteKit's
 * `$service-worker` lists and every plugin's `./worker` entry.
 *
 * Plugins' `onFetch` hooks answer first. Everything else gets a baseline offline strategy, so
 * every app installs and works offline: the build, static files and prerendered pages are
 * precached on install (bypassing the HTTP cache) and served from this version's cache first;
 * other requests go to the network, then the cache, then `404.html` for navigations. A new
 * version waits until every tab of the old one has closed; it never takes over a running page.
 */
import { createApp, memoryStorage, type App, type Plugin } from '@xcwds/core';
import type { WorkerData } from './data.js';
import { decorateRoutes, stripBase } from './routes.js';

export type WorkerOptions = WorkerData & {
	/** From `$service-worker`. */
	base: string;
	build: string[];
	files: string[];
	prerendered: string[];
	version: string;
	/** Each plugin's `./worker` entry with its options from the config. */
	plugins: [Plugin<never>, Record<string, unknown>][];
};

// The few service-worker types used here (this package also type-checks against the DOM).
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
	request: Request;
	respondWith(response: Response | Promise<Response>): void;
};
type MessageEvent = ExtendableEvent & { data: unknown };
type WorkerScope = {
	location: Location;
	registration: { scope: string };
	clients: { claim(): Promise<void> };
	addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
	addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
	addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

/** Starts the worker. Returns its app (for tests and plugins that need it). */
export function startWorker(options: WorkerOptions): App {
	const sw = globalThis as unknown as WorkerScope;
	const app = createApp({
		storage: memoryStorage(),
		storagePrefix: options.storagePrefix,
		appName: options.name
	});
	decorateRoutes(app, options.routes);
	for (const [plugin, opts] of options.plugins) app.register(plugin, { ...opts } as never);
	// A plugin that fails to load is logged; the worker still serves the app without it.
	const ready = app.ready().then(
		() => true,
		(error: unknown) => {
			app.log.error(error);
			return false;
		}
	);

	const { base } = options;
	// One cache per app (scope) and version, so apps sharing an origin keep their own.
	const prefix = `xcwds:${sw.registration.scope}:`;
	const cacheName = `${prefix}${options.version}`;
	const fallback = `${base}/404.html`;
	const assets = [
		...options.build,
		...options.files,
		...options.prerendered,
		...options.assets.map((a) => `${base}/${a}`)
	];
	const precached = new Set(assets);

	sw.addEventListener('install', (event) => {
		event.waitUntil(
			(async () => {
				const cache = await caches.open(cacheName);
				// Bypass the HTTP cache, so a new version never precaches the previous one's files.
				await cache.addAll(assets.map((a) => new Request(a, { cache: 'reload' })));
				// `vite dev` and `vite preview` don't serve 404.html; only offline not-found pages need it.
				await cache.add(new Request(fallback, { cache: 'reload' })).catch(() => {
					app.log.warn(`Couldn't cache ${fallback}; offline not-found pages won't work.`);
				});
				if (await ready) await app.hooks.run('onInstall', [cache]);
			})()
		);
	});

	sw.addEventListener('activate', (event) => {
		event.waitUntil(
			(async () => {
				for (const key of await caches.keys())
					if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
				// Control pages opened before the worker existed, so they work offline right away.
				await sw.clients.claim();
				if (await ready) await app.hooks.run('onActivate', []);
			})()
		);
	});

	sw.addEventListener('message', (event) => {
		event.waitUntil(
			ready.then((ok) => (ok ? app.hooks.run('onMessage', [event.data]) : undefined))
		);
	});

	sw.addEventListener('fetch', (event) => {
		const { request } = event;
		const url = new URL(request.url);
		if (request.method !== 'GET' || url.origin !== sw.location.origin) return;
		const path = stripBase(url.pathname, base);
		if (path === null) return;
		event.respondWith(
			(async () => {
				const answer = (await ready)
					? await app.hooks.first('onFetch', [request, url], { path })
					: undefined;
				if (answer) return answer;
				const cache = await caches.open(cacheName);
				if (precached.has(url.pathname)) {
					const cached = await cache.match(url.pathname);
					if (cached) return cached;
				}
				try {
					const response = await fetch(request);
					if (response.ok && response.type === 'basic' && !precached.has(url.pathname))
						void cache.put(request, response.clone());
					return response;
				} catch (error) {
					const cached =
						(await cache.match(request)) ??
						(request.mode === 'navigate' ? await cache.match(fallback) : undefined);
					if (cached) return cached;
					throw error;
				}
			})()
		);
	});

	return app;
}
