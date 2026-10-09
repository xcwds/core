/**
 * What the shell shows for a path: title, emoji, back target and page width, and the active
 * section. Pure, so the header and tests agree. Paths are app paths, without the base path.
 */
import type { RouteInfo, RouteWidth } from '@xcwds/sveltekit/routes';
import type { Section } from './options.js';

export type PageInfo = {
	title: string;
	emoji?: string;
	/** Where the back arrow goes; top-level pages have none. */
	parent?: string;
	/** What the back arrow says it goes back to. */
	parentLabel?: string;
	width: RouteWidth;
};

const normalize = (path: string) => path.replace(/\/+$/, '') || '/';
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The section a path belongs to: its own, one whose `also` claims it, else Home (`/`). */
export function activeSection(sections: readonly Section[], pathname: string): string {
	const path = normalize(pathname);
	let best: { path: string; length: number } | undefined;
	for (const section of sections) {
		for (const prefix of [section.path, ...(section.also ?? [])]) {
			if (prefix === '/' || !under(path, prefix)) continue;
			// The longest claim wins, so `/a/b` can belong to another section than `/a`.
			if (!best || prefix.length > best.length)
				best = { path: section.path, length: prefix.length };
		}
	}
	return best?.path ?? '/';
}

type Lookup = (path: string) => RouteInfo | undefined;

/** A path's label for a back arrow: its section's label, its route's title, or Home. */
function labelOf(path: string, sections: readonly Section[], route: Lookup, home: string) {
	return sections.find((s) => s.path === path)?.label ?? route(path)?.title ?? home;
}

/**
 * The header for a page: from the route registry when the page is registered, else its section,
 * else the app's name with a way home. Error pages say what went wrong and lead home.
 */
export function pageInfo(
	pathname: string,
	{
		sections,
		route,
		appName,
		error
	}: { sections: readonly Section[]; route: Lookup; appName: string; error?: number }
): PageInfo {
	const path = normalize(pathname);
	const home = sections.find((s) => s.path === '/')?.label ?? 'Home';
	if (error !== undefined)
		return {
			title: error === 404 ? 'Page not found' : 'Something went wrong',
			parent: '/',
			parentLabel: home,
			width: 'narrow'
		};
	const registered = route(path);
	const section = sections.find((s) => s.path === path);
	if (registered) {
		const { title, emoji, parent, width } = registered;
		return {
			title,
			...(emoji === undefined ? {} : { emoji }),
			...(parent === undefined
				? {}
				: { parent, parentLabel: labelOf(parent, sections, route, home) }),
			width: width ?? 'wide'
		};
	}
	if (path === '/') return { title: appName, width: 'wide' };
	if (section)
		return {
			title: section.label,
			...(section.emoji === undefined ? {} : { emoji: section.emoji }),
			width: 'wide'
		};
	return { title: appName, parent: '/', parentLabel: home, width: 'wide' };
}
