/**
 * The three hook families (RFC 0001). Build hooks run in the Vite plugin, runtime hooks in the
 * page, worker hooks in the service worker. Plugins add them with `app.addHook(name, fn)`.
 */
export const BUILD_HOOKS = ['onConfig', 'onManifest', 'onHead', 'onWorker', 'onPrerender'] as const;

export const RUNTIME_HOOKS = [
	'onBoot',
	'onReady',
	'onNavigate',
	'afterNavigate',
	'onSettingsChange',
	'onStorageChange',
	'onBeforeReload',
	'onHidden',
	'onVisible',
	'onError',
	'onClose'
] as const;

export const WORKER_HOOKS = ['onInstall', 'onActivate', 'onFetch', 'onMessage'] as const;

/** Hooks that belong to a path: they only run for paths under the adding plugin's `prefix`. */
export const ROUTE_HOOKS = ['onNavigate', 'afterNavigate', 'onFetch'] as const;

export type BuildHookName = (typeof BUILD_HOOKS)[number];
export type RuntimeHookName = (typeof RUNTIME_HOOKS)[number];
export type WorkerHookName = (typeof WORKER_HOOKS)[number];

/** A navigation target as the hooks see it: a path without the app's base path. */
export type Route = { path: string; url?: URL };

/** Where an error reported to `onError` came from. */
export type ErrorSource =
	| { kind: 'hook'; hook: HookName; plugin: string }
	| { kind: 'plugin'; plugin: string }
	| { kind: 'uncaught' };

type Awaitable<T> = T | Promise<T>;

/**
 * Hook signatures. Plugins can add their own hooks' types by merging into this interface:
 *
 *   declare module '@xcwds/core' { interface Hooks { onTimerDone(id: string): void } }
 *
 * Build and worker hooks receive plain data; their exact types are owned by the integration
 * (#10) and plugin-offline (#11), so they are loose here.
 */
export interface Hooks {
	// Build
	onConfig(config: Record<string, unknown>): Awaitable<Record<string, unknown> | void>;
	onManifest(manifest: Record<string, unknown>): Awaitable<Record<string, unknown> | void>;
	/** Returns plain ES5 to run before first paint. */
	onHead(): Awaitable<string | void>;
	/** Returns module specifiers to import into the service worker. */
	onWorker(): Awaitable<string | string[] | void>;
	/** Returns extra paths to prerender. */
	onPrerender(): Awaitable<string[] | void>;

	// Runtime
	onBoot(): Awaitable<void>;
	onReady(): Awaitable<void>;
	/** Return a path to redirect to, or `false` to cancel. */
	onNavigate(to: Route, from: Route | null): Awaitable<string | false | void>;
	afterNavigate(to: Route): Awaitable<void>;
	onSettingsChange(next: Record<string, unknown>, prev: Record<string, unknown>): Awaitable<void>;
	onStorageChange(key: string | null, value: unknown): Awaitable<void>;
	/** Return a reason to postpone a reload (shown to the user), or nothing. */
	onBeforeReload(): Awaitable<string | void>;
	onHidden(): Awaitable<void>;
	onVisible(): Awaitable<void>;
	onError(error: unknown, source: ErrorSource): Awaitable<void>;
	onClose(): Awaitable<void>;

	// Worker
	onInstall(cache: unknown): Awaitable<void>;
	onActivate(): Awaitable<void>;
	/** Return a Response to answer the request; the first one wins. */
	onFetch(request: Request, url: URL): Awaitable<Response | void>;
	onMessage(data: unknown): Awaitable<void>;
}

export type HookName = keyof Hooks;

export const KNOWN_HOOKS: ReadonlySet<string> = new Set([
	...BUILD_HOOKS,
	...RUNTIME_HOOKS,
	...WORKER_HOOKS
]);

/** Whether `path` is `prefix` or below it. An empty prefix matches everything. */
export function underPrefix(path: string, prefix: string): boolean {
	if (!prefix || prefix === '/') return true;
	const p = prefix.replace(/\/+$/, '');
	return path === p || path.startsWith(`${p}/`);
}
