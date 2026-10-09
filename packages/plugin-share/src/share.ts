/** What the Share button sends, and how. Pure apart from `share()`, so tests can check it. */
import { under } from './options.js';

export type ShareData = { title: string; text: string; url: string };

/**
 * What the header's Share button sends for a page, or null when it shouldn't be shared (an
 * excluded path, or a private page in the route registry). The link is the origin, base path and path only: never the query or hash,
 * which can hold what you typed (a link pasted into a tool, a share received as `#url=…`).
 */
export function shareData(
	path: string,
	{
		origin,
		base,
		title,
		private: personal = false,
		appName,
		tagline,
		exclude
	}: {
		origin: string;
		base: string;
		/** The page's title from the route registry, if it has one. */
		title: string | undefined;
		/** The route is private (e.g. a personal tool). */
		private?: boolean;
		appName: string;
		tagline: string;
		exclude: readonly string[];
	}
): ShareData | null {
	const clean = path.replace(/\/+$/, '') || '/';
	if (personal || exclude.some((prefix) => under(clean, prefix))) return null;
	if (clean === '/')
		return {
			title: appName,
			text: tagline ? `${appName}: ${tagline}` : appName,
			url: `${origin}${base}/`
		};
	const name = title ?? appName;
	return { title: name, text: `${name} on ${appName}`, url: `${origin}${base}${clean}` };
}

/** What `share()` did. */
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

/**
 * Opens the system share sheet, or copies the link where there isn't one (or sharing isn't
 * allowed). Call it from a tap: browsers only allow sharing from one.
 */
export async function share(
	data: ShareData,
	nav: Pick<Navigator, 'share' | 'clipboard'> = navigator
): Promise<ShareResult> {
	if (typeof nav.share === 'function') {
		try {
			await nav.share(data);
			return 'shared';
		} catch (error) {
			// Closing the share sheet isn't an error.
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
			// Not allowed here (e.g. some desktop installs): copy the link instead.
		}
	}
	try {
		await nav.clipboard.writeText(data.url);
		return 'copied';
	} catch {
		return 'failed';
	}
}
