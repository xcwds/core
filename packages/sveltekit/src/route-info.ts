import { data } from 'virtual:xcwds/client';
import { stripBase, type RouteInfo } from './routes.js';
import { getApp } from './runtime.svelte.js';

/**
 * The registered route for a pathname as the browser shows it (with the base path), e.g.
 * `routeInfo(page.url.pathname)`, or undefined for pages nobody registered.
 */
export function routeInfo(pathname: string): RouteInfo | undefined {
	const path = stripBase(pathname, data.base);
	return path === null ? undefined : getApp().routes.get(path);
}

/**
 * A pathname as the browser shows it, without the base path (what routes, hooks and sections
 * use), or null outside the app. Unlike `$app/paths`, never relative, even while prerendering.
 */
export function appPath(pathname: string): string | null {
	return stripBase(pathname, data.base);
}
