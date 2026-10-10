/**
 * "Never phone home" (#22): what a plugin declares about its network use, checked when it loads.
 * The integration also scans the build for origins nobody declared and puts the declared ones
 * in the page's Content Security Policy.
 */
import { XcwdsError, codes } from './errors.js';
import { isRecord } from './json.js';

/** A plugin's network use: `false` (the default) or the origins it contacts and why. */
export type NetworkUse = false | { origins: string[]; reason: string };

const SCHEMES = new Set(['https:', 'wss:']);

/** Whether `value` is an `https:` or `wss:` origin, written as `URL.origin` writes it. */
export function isOrigin(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const url = new URL(value);
		return SCHEMES.has(url.protocol) && url.origin === value;
	} catch {
		return false;
	}
}

/** Checks a plugin's `network` metadata and returns it with the default filled in. */
export function checkNetwork(value: unknown, plugin: string): NetworkUse {
	if (value === undefined || value === false) return false;
	const fail = (message: string): never => {
		throw new XcwdsError(
			codes.PLUGIN_META,
			`Plugin "${plugin}" has invalid \`network\`: ${message}.`,
			{
				plugin
			}
		);
	};
	if (!isRecord(value)) return fail('use false or { origins, reason }');
	const { origins, reason } = value;
	if (!Array.isArray(origins) || origins.length === 0)
		return fail('`origins` must be a non-empty array');
	for (const origin of origins)
		if (!isOrigin(origin))
			fail(`${JSON.stringify(origin)} isn't an https or wss origin like "https://example.com"`);
	if (typeof reason !== 'string' || reason.trim() === '')
		return fail('`reason` must say why the plugin contacts these origins');
	return { origins: [...new Set(origins as string[])], reason };
}

/** Strings shorter than this are too common to tell saved data from an ordinary query. */
const MIN_LEAK = 4;

function strings(value: unknown, out: Set<string>, depth = 0): Set<string> {
	if (depth > 20) return out;
	if (typeof value === 'string') {
		if (value.trim().length >= MIN_LEAK) out.add(value);
	} else if (Array.isArray(value)) for (const v of value) strings(v, out, depth + 1);
	else if (isRecord(value)) for (const v of Object.values(value)) strings(v, out, depth + 1);
	return out;
}

/**
 * The query parameters of `url` that carry saved data: a parameter whose value contains a string
 * from `saved` (at least 4 characters). A query string reaches the server, and its logs, on
 * every request; keep user data in the fragment (`#url=...`) instead. A development check, not a
 * guarantee: it only knows the values it is given.
 */
export function savedDataInQuery(url: URL, saved: readonly unknown[]): string[] {
	if (!url.search) return [];
	const values = strings(saved, new Set());
	if (!values.size) return [];
	const names = new Set<string>();
	for (const [name, value] of url.searchParams)
		for (const s of values)
			if (value.includes(s)) {
				names.add(name);
				break;
			}
	return [...names];
}
