import type { ResolvedConfig } from '@xcwds/core';
import type { RouteInfo } from '../routes.js';

/** A plugin from the config, with the entries its package exports. */
export type PluginInfo = {
	name: string;
	options: Record<string, unknown>;
	/** Whether the package exports `./client` (the page) and `./worker` (the service worker). */
	client: boolean;
	worker: boolean;
};

/** Everything the build learnt from `xcwds.config.*` and the plugins' build hooks. */
export type BuildState = {
	root: string;
	/** SvelteKit's `paths.base`. */
	base: string;
	configFile: string;
	/** Files the config imports (watched by `vite dev`). */
	dependencies: string[];
	config: ResolvedConfig;
	plugins: PluginInfo[];
	/** `onHead` snippets. */
	head: string[];
	/** `onWorker` module specifiers. */
	worker: string[];
	/** `onPrerender` paths. */
	prerender: string[];
	routes: RouteInfo[];
	/** The Web App Manifest, after `onManifest` hooks and `config.manifest`. */
	manifest: Record<string, unknown>;
};

// `withXcwds()` (in svelte.config.js) and `xcwds()` (in vite.config.ts) are separate modules
// loaded in the same process, SvelteKit's config first. The state passes between them here.
const KEY = Symbol.for('xcwds.sveltekit.builds');
const registry = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map()) as Map<
	string,
	BuildState
>;

export function remember(state: BuildState): void {
	registry.set(state.root, state);
}

export function recall(root: string): BuildState | undefined {
	return registry.get(root);
}
