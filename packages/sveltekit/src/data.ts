import type { NetworkUse } from '@xcwds/core';
import type { RouteInfo } from './routes.js';

/** What the app declares about its network use (#22), for the settings page's Privacy section. */
export type PrivacyInfo = {
	/** Every plugin in the config, in order, with what its build entry declares. */
	plugins: { name: string; network: NetworkUse }[];
	/** `privacy.allowOrigins` from the config. */
	allowOrigins: string[];
};

/** What the build hands the page bundle, as JSON (see `virtual:xcwds/client`). */
export type ClientData = {
	/** `brand.name`: written into backups. */
	name: string;
	/** `brand.tagline`. */
	tagline: string;
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
	privacy: PrivacyInfo;
};

/** What the build hands the service worker (see `.xcwds/worker.js`). */
export type WorkerData = {
	name: string;
	storagePrefix: string;
	routes: RouteInfo[];
	/** Files the build emits outside SvelteKit's lists (manifest, icons), relative to the base. */
	assets: string[];
};
