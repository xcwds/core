/**
 * The route registry (#10): what the shell needs to know about each page (title, emoji, back
 * target, width), replacing xcwds.github.io's hand-written `routeInfo` in `src/lib/nav.ts`.
 * Plugins add their pages with `app.route()` from their build entry, so the paths are known when
 * `svelte.config.js` loads and can be fed to prerender `entries`; the page bundle gets the same
 * list. Paths never include the base path (RFC 0001, decision 9).
 */
import { XcwdsError, codes, type App } from '@xcwds/core';

export type RouteWidth = 'narrow' | 'wide';

export type RouteDefinition = {
	/** The page's path, relative to the adding plugin's `prefix` (`/` is the prefix itself). */
	path: string;
	title: string;
	emoji?: string;
	/** Where the header's back arrow goes (an app path). Top-level pages have none. */
	parent?: string;
	/** Which page container the page uses, so the shell's header lines up with it. */
	width?: RouteWidth;
};

export type RouteInfo = Omit<RouteDefinition, 'path'> & {
	/** The full app path, without the base path. */
	path: string;
	/** The plugin that added it (`''` for the app). */
	plugin: string;
};

export type RouteRegistry = {
	/** The route for a path (without the base path), ignoring a trailing slash. */
	get(path: string): RouteInfo | undefined;
	list(): RouteInfo[];
};

declare module '@xcwds/core' {
	interface App {
		/** Adds a page to the route registry, under this plugin's `prefix`. */
		route(route: RouteDefinition): App;
		readonly routes: RouteRegistry;
	}
}

/** `/a/b/` → `/a/b`, `''` → `/`. */
export function normalizePath(path: string): string {
	const p = `/${path}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
	return p || '/';
}

/** `pathname` without `base` (`/sub/hello` → `/hello`), or null when it isn't under `base`. */
export function stripBase(pathname: string, base: string): string | null {
	if (!base) return pathname;
	if (pathname === base) return '/';
	return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null;
}

const WIDTHS: readonly string[] = ['narrow', 'wide'];

function check(route: RouteDefinition, plugin: string): void {
	const fail = (message: string) => {
		throw new XcwdsError(codes.CONFIG_INVALID, `Route from "${plugin || 'the app'}": ${message}`, {
			plugin: plugin || undefined
		});
	};
	if (typeof route !== 'object' || route === null) fail('must be an object');
	if (typeof route.path !== 'string' || !route.path.startsWith('/'))
		fail(`path must start with "/" (got ${JSON.stringify(route.path)})`);
	if (/[?#]/.test(route.path)) fail(`path "${route.path}" can't have a query or hash`);
	if (typeof route.title !== 'string' || route.title.trim() === '')
		fail(`"${route.path}" needs a title`);
	if (route.emoji !== undefined && typeof route.emoji !== 'string')
		fail(`the emoji of "${route.path}" must be a string`);
	if (
		route.parent !== undefined &&
		(typeof route.parent !== 'string' || !route.parent.startsWith('/'))
	)
		fail(`the parent of "${route.path}" must be a path starting with "/"`);
	if (route.width !== undefined && !WIDTHS.includes(route.width))
		fail(`the width of "${route.path}" must be "narrow" or "wide"`);
}

/** A registry holding `initial` (routes the build collected), with a function that adds more. */
export function createRoutes(initial: readonly RouteInfo[] = []): RouteRegistry & {
	add(route: RouteDefinition, plugin?: string, prefix?: string): RouteInfo;
} {
	const routes = new Map<string, RouteInfo>();
	function add(route: RouteDefinition, plugin = '', prefix = ''): RouteInfo {
		check(route, plugin);
		const path = normalizePath(`${prefix}/${route.path}`);
		const existing = routes.get(path);
		if (existing)
			throw new XcwdsError(
				codes.CONFIG_INVALID,
				`The route "${path}" from "${plugin || 'the app'}" is already added by "${existing.plugin || 'the app'}".`,
				{ plugin: plugin || undefined }
			);
		const info: RouteInfo = { ...route, path, plugin };
		if (info.parent !== undefined) info.parent = normalizePath(info.parent);
		routes.set(path, info);
		return info;
	}
	for (const r of initial) {
		const { plugin, ...route } = r;
		add(route, plugin);
	}
	return {
		add,
		get: (path) => routes.get(normalizePath(path)),
		list: () => [...routes.values()]
	};
}

/**
 * Gives an app `route()` and `routes`. `route()` is called as a method, so `this` is the calling
 * plugin's view of the app, whose name and prefix it records.
 */
export function decorateRoutes(app: App, initial: readonly RouteInfo[] = []): RouteRegistry {
	const registry = createRoutes(initial);
	app.decorate('route', function (this: App, route: RouteDefinition) {
		registry.add(route, this.pluginName, this.prefix);
		return this;
	});
	app.decorate('routes', { get: registry.get, list: registry.list });
	return app.routes;
}
