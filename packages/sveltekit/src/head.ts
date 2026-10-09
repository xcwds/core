/**
 * The pre-paint script and head tags (RFC 0001, decision 4). Plugins' `onHead` snippets and the
 * settings' `prePaint` fields become one inline `<script>`, which `handle` puts where app.html
 * has `%xcwds.head%`. Its hash is added to the page's CSP, so the policy stays strict.
 */

export const PLACEHOLDER = '%xcwds.head%';

/** Joins ES5 snippets into one script, each in its own `try` so one failure can't stop the rest. */
export function headScript(snippets: readonly string[]): string {
	return snippets
		.filter((s) => s.trim() !== '')
		.map((s) => `try{${s.replace(/<\/(script)/gi, '<\\/$1')}}catch(e){}`)
		.join('');
}

/** The CSP source for `script` (`'sha256-…'`), hashed with Web Crypto (Node and browsers). */
export async function scriptHash(script: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
	let binary = '';
	for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
	return `'sha256-${btoa(binary)}'`;
}

/**
 * Adds `source` to a policy's `script-src`. A policy without one gets `script-src` copied from
 * `default-src` (which it would otherwise fall back to) plus the source. A policy that already
 * allows every inline script (`'unsafe-inline'` with no hash or nonce, which a hash would turn
 * off) or has neither directive is returned as is.
 */
export function allowScript(policy: string, source: string): string {
	const directives = policy
		.split(';')
		.map((d) => d.trim())
		.filter(Boolean);
	const index = directives.findIndex((d) => /^script-src(\s|$)/i.test(d));
	const fallback = directives.find((d) => /^default-src(\s|$)/i.test(d));
	const current = index >= 0 ? directives[index]! : fallback;
	if (current === undefined) return policy;
	const sources = current.split(/\s+/).slice(1);
	if (sources.includes(source)) return policy;
	if (sources.includes("'unsafe-inline'") && !sources.some((s) => /^'(sha\d+|nonce)-/.test(s)))
		return policy;
	const next = `script-src ${[...sources, source].join(' ')}`;
	if (index >= 0) directives[index] = next;
	else directives.push(next);
	return directives.join('; ');
}

const META = /(<meta\s+http-equiv=["']content-security-policy["']\s+content=")([^"]*)(")/i;

/**
 * Puts `head` in place of `%xcwds.head%` (or before `</head>` when app.html has no placeholder)
 * and adds `hash` to the CSP `<meta>` SvelteKit writes into prerendered pages. Returns `html`
 * unchanged when it isn't the chunk holding the head.
 */
export function injectHead(html: string, head: string, hash: string | null): string {
	let out: string;
	if (html.includes(PLACEHOLDER)) out = html.replace(PLACEHOLDER, () => head);
	else if (html.includes('</head>')) out = html.replace('</head>', () => `${head}\n</head>`);
	else return html;
	if (hash)
		out = out.replace(META, (_, start, policy, end) => start + allowScript(policy, hash) + end);
	return out;
}
