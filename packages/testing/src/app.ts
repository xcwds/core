/**
 * `buildTestApp()`: the page's app without a browser, like Fastify's `inject()` for a server.
 * Plugins load and boot as in `<App>` (load, `onBoot`, `onReady`, the first page's guards and
 * `afterNavigate`), with in-memory storage shared by simulated tabs and an optional fake clock.
 */
import { createApp, type App, type LogLevel, type Route, type StorageAdapter } from '@xcwds/core';
import { decorateRoutes, normalizePath, stripBase } from '@xcwds/sveltekit/routes';
import { fakeClock, type FakeClock } from './clock.js';
import { prepare, type Importer, type Prepared, type TestInput } from './plugins.js';
import { isSharedStorage, sharedStorage, type SharedStorage } from './tabs.js';

export type TestAppOptions = {
	/** The storage behind every tab: a plain adapter (e.g. `memoryStorage()`) or `sharedStorage()`. */
	storage?: StorageAdapter | SharedStorage;
	/** A fake clock (or its start time), installed until the app closes. Omit for real time. */
	now?: FakeClock | number | Date;
	/** SvelteKit's `paths.base`, for the URLs hooks see. Paths you pass never include it. */
	base?: string;
	/** The page the app opens on. Defaults to `/`. */
	path?: string;
	/** Imports plugin entries for descriptors; see `Importer`. */
	import?: Importer;
	logLevel?: LogLevel;
};

export type NavigationResult = {
	/** Where the app ended up (the previous path when cancelled). */
	path: string;
	/** Each redirect the guards made, in order. */
	redirects: string[];
	cancelled: boolean;
};

export type TestHelpers = {
	/** Navigates like a link click: `onNavigate` guards, redirects, then `afterNavigate`. */
	navigate(path: string): Promise<NavigationResult>;
	/** The current path (with any query), without the base path. */
	readonly path: string;
	readonly clock: FakeClock | undefined;
	/** The storage all tabs share. */
	readonly shared: SharedStorage;
	/** Opens another tab of the same app on the same storage (and clock). */
	openTab(options?: { path?: string }): Promise<TestApp>;
	/** Waits until other tabs' `storage` events have arrived. */
	settle(): Promise<void>;
	/** Closes this tab (and, for the first one, every tab it opened, then restores the clock). */
	close(): Promise<void>;
};

export type TestApp = App & TestHelpers;

const ORIGIN = 'http://localhost';
const MAX_REDIRECTS = 5;

type Group = {
	prepared: Prepared;
	shared: SharedStorage;
	clock: FakeClock | undefined;
	base: string;
	logLevel: LogLevel;
	tabs: Set<TestApp>;
	/** Set once the first tab has closed (taking the others and the clock with it). */
	closed: boolean;
};

async function openTab(group: Group, initial: string): Promise<TestApp> {
	if (group.closed) throw new Error('This test app was closed; build a new one.');
	const { prepared, base } = group;
	const tab = new EventTarget();
	const adapter = group.shared.connect(tab);
	const app = createApp({
		storage: adapter,
		storagePrefix: prepared.storagePrefix,
		appName: prepared.name,
		logLevel: group.logLevel
	});
	decorateRoutes(app, prepared.routes);
	for (const [plugin, options] of prepared.plugins) app.register(plugin, { ...options } as never);

	const route = (path: string): Route & { url: URL } => {
		const url = new URL(base + (path.startsWith('/') ? path : `/${path}`), ORIGIN);
		return { path: normalizePath(stripBase(url.pathname, base) ?? url.pathname), url };
	};
	const key = (to: Route & { url: URL }) => to.path + to.url.search;
	let current = key(route(initial));

	/** A navigation and the redirects its guards make (`redirects` holds those made already). */
	async function go(path: string, redirects: string[]): Promise<NavigationResult> {
		let target = path;
		for (;;) {
			const to = route(target);
			const answer = await app.hooks.first('onNavigate', [to, route(current)], { path: to.path });
			if (answer === false) return { path: current, redirects, cancelled: true };
			if (typeof answer !== 'string') break;
			if (redirects.length >= MAX_REDIRECTS) {
				await app.reportError(
					new Error(`onNavigate redirected more than ${MAX_REDIRECTS} times; stopped at ${answer}.`)
				);
				return { path: current, redirects, cancelled: true };
			}
			redirects.push(answer);
			target = answer;
		}
		const to = route(target);
		current = key(to);
		await app.hooks.run('afterNavigate', [to], { path: to.path });
		return { path: current, redirects, cancelled: false };
	}

	/**
	 * The first page was loaded, not navigated to: its guards run once the app is ready, and
	 * `false` can't take it back; a redirect is a navigation of its own.
	 */
	async function enter() {
		const first = route(initial);
		const answer = await app.hooks.first('onNavigate', [first, null], { path: first.path });
		await app.hooks.run('afterNavigate', [first], { path: first.path });
		if (typeof answer === 'string') await go(answer, [answer]);
	}

	const close = app.close.bind(app);
	let closed = false;
	const helpers: TestHelpers = {
		navigate: (path) => go(path, []),
		get path() {
			return current;
		},
		clock: group.clock,
		shared: group.shared,
		openTab: (options = {}) => openTab(group, options.path ?? '/'),
		settle: () => group.shared.settled(),
		async close() {
			if (closed) return;
			closed = true;
			const first = [...group.tabs][0] === testApp;
			if (first) group.closed = true;
			group.tabs.delete(testApp);
			await close();
			adapter.disconnect();
			if (first) for (const other of [...group.tabs]) await other.close();
			if (group.tabs.size === 0) group.clock?.uninstall();
		}
	};
	const testApp = app as TestApp;
	group.tabs.add(testApp);
	// Until the helpers are in place, closing is the kernel's (plus the tab bookkeeping).
	Object.defineProperty(app, 'close', { value: helpers.close, configurable: true });

	try {
		await app.load();
		// Own properties of the root view, beside the plugins' decorators.
		for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(helpers))) {
			if (key !== 'close' && key in app)
				throw new Error(`A plugin's decorator "${key}" clashes with an @xcwds/testing helper.`);
			Object.defineProperty(app, key, { ...descriptor, configurable: true });
		}
		app.storage.startSync(tab);
		await app.hooks.run('onBoot', []);
		await app.ready();
		await enter();
	} catch (error) {
		await testApp.close();
		throw error;
	}
	return testApp;
}

/**
 * Boots an app for a unit test. `input` is a whole config or `{ plugins }`, where a plugin is a
 * function, a `[plugin, options]` pair or a descriptor (loaded from its package's `./client`,
 * with its build entry's routes). Close it when the test ends.
 */
export async function buildTestApp(
	input: TestInput,
	options: TestAppOptions = {}
): Promise<TestApp> {
	const logLevel = options.logLevel ?? 'warn';
	const prepared = await prepare(input, 'client', { importer: options.import, logLevel });
	const clock =
		options.now === undefined
			? undefined
			: typeof options.now === 'object' && 'install' in options.now
				? options.now
				: fakeClock(options.now);
	const group: Group = {
		prepared,
		shared: isSharedStorage(options.storage) ? options.storage : sharedStorage(options.storage),
		clock,
		base: options.base ?? '',
		logLevel,
		tabs: new Set(),
		closed: false
	};
	clock?.install();
	try {
		return await openTab(group, options.path ?? '/');
	} catch (error) {
		clock?.uninstall();
		throw error;
	}
}
