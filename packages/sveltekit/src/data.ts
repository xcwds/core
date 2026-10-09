import type { RouteInfo } from './routes.js';

/** What the build hands the page bundle, as JSON (see `virtual:xcwds/client`). */
export type ClientData = {
	/** `brand.name`: written into backups. */
	name: string;
	/**
	 * SvelteKit's `paths.base`, always absolute (`$app/paths` gives a relative one while
	 * prerendering when `paths.relative` is on).
	 */
	base: string;
	storagePrefix: string;
	routes: RouteInfo[];
	/** Plugins' `onHead` snippets. */
	head: string[];
	/** Manifest, icon and iOS tags, with the base path. */
	tags: string;
};

/** What the build hands the service worker (see `.xcwds/worker.js`). */
export type WorkerData = {
	name: string;
	storagePrefix: string;
	routes: RouteInfo[];
	/** Files the build emits outside SvelteKit's lists (manifest, icons), relative to the base. */
	assets: string[];
};
