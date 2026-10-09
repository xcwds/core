/**
 * `buildTestWorker()`: a service worker's plugins without a browser. Runs `onFetch` hooks
 * against a `Request` (with route prefixes), and `onInstall`, `onActivate` and `onMessage` with
 * an in-memory cache. The integration's default caching strategy isn't included: a response is
 * what the plugins answer, or `undefined` when they leave it to the default.
 */
import { createApp, memoryStorage, type App, type LogLevel } from '@xcwds/core';
import { decorateRoutes, stripBase } from '@xcwds/sveltekit/routes';
import { prepare, type Importer, type TestInput } from './plugins.js';

export type TestWorkerOptions = {
	/** SvelteKit's `paths.base`. String paths you pass never include it. */
	base?: string;
	/** The origin requests are made on. Defaults to `http://localhost`. */
	origin?: string;
	/** Answers `cache.add()` / `addAll()` (there is no network in tests); 404 by default. */
	network?: (request: Request) => Response | Promise<Response>;
	import?: Importer;
	logLevel?: LogLevel;
};

/** The part of the Cache API plugins usually need, kept in memory. */
export class MemoryCache {
	readonly #entries = new Map<string, Response>();
	readonly #network: (request: Request) => Response | Promise<Response>;
	readonly #origin: string;

	constructor(origin: string, network?: TestWorkerOptions['network']) {
		this.#origin = origin;
		this.#network = network ?? (() => new Response('Not found', { status: 404 }));
	}

	#key(request: RequestInfo | URL): string {
		const url = request instanceof Request ? request.url : String(request);
		return new URL(url, this.#origin).href;
	}

	async match(request: RequestInfo | URL): Promise<Response | undefined> {
		return this.#entries.get(this.#key(request))?.clone();
	}
	async put(request: RequestInfo | URL, response: Response): Promise<void> {
		this.#entries.set(this.#key(request), response.clone());
	}
	async add(request: RequestInfo | URL): Promise<void> {
		const req = request instanceof Request ? request : new Request(this.#key(request));
		const response = await this.#network(req);
		if (!response.ok) throw new TypeError(`Request for ${req.url} failed: ${response.status}`);
		await this.put(req, response);
	}
	async addAll(requests: (RequestInfo | URL)[]): Promise<void> {
		for (const r of requests) await this.add(r);
	}
	async delete(request: RequestInfo | URL): Promise<boolean> {
		return this.#entries.delete(this.#key(request));
	}
	async keys(): Promise<Request[]> {
		return [...this.#entries.keys()].map((url) => new Request(url));
	}
}

export type TestWorker = {
	app: App;
	cache: MemoryCache;
	/** Runs `onFetch` hooks (GETs only, as the worker does); a string is an app path (without the base). */
	fetch(input: Request | string, init?: RequestInit): Promise<Response | undefined>;
	/** Runs `onInstall` hooks with `cache`. */
	install(): Promise<MemoryCache>;
	activate(): Promise<void>;
	message(data: unknown): Promise<void>;
	close(): Promise<void>;
};

/** Boots a worker for a unit test: plugin functions, pairs, or descriptors (their `./worker`). */
export async function buildTestWorker(
	input: TestInput,
	options: TestWorkerOptions = {}
): Promise<TestWorker> {
	const base = options.base ?? '';
	const origin = options.origin ?? 'http://localhost';
	const logLevel = options.logLevel ?? 'warn';
	const prepared = await prepare(input, 'worker', { importer: options.import, logLevel });
	const app = createApp({
		storagePrefix: prepared.storagePrefix,
		appName: prepared.name,
		logLevel,
		storage: memoryStorage()
	});
	decorateRoutes(app, prepared.routes);
	for (const [plugin, opts] of prepared.plugins) app.register(plugin, { ...opts } as never);
	await app.ready();
	const cache = new MemoryCache(origin, options.network);
	return {
		app,
		cache,
		async fetch(input, init) {
			const request =
				typeof input === 'string' ? new Request(new URL(base + input, origin), init) : input;
			const url = new URL(request.url);
			const path = url.origin === origin ? stripBase(url.pathname, base) : null;
			// The integration's worker leaves non-GETs, other origins and paths outside the app alone.
			if (request.method !== 'GET' || path === null) return undefined;
			return (await app.hooks.first('onFetch', [request, url], { path })) ?? undefined;
		},
		async install() {
			await app.hooks.run('onInstall', [cache]);
			return cache;
		},
		activate: () => app.hooks.run('onActivate', []),
		message: (data) => app.hooks.run('onMessage', [data]),
		close: () => app.close()
	};
}
