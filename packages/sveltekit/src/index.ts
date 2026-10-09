/** `@xcwds/sveltekit`: the page side of the integration. */
export { default as App } from './App.svelte';
export { useApp } from './shell.js';
export { getApp, loadApp } from './runtime.svelte.js';
export { persist, type PersistOptions } from './persist.svelte.js';
export { settings, type SettingsValues } from './settings.svelte.js';
export { brand } from './brand.js';
export { appPath, routeInfo } from './route-info.js';
export {
	normalizePath,
	type RouteDefinition,
	type RouteInfo,
	type RouteRegistry,
	type RouteWidth
} from './routes.js';
