/**
 * "Never phone home" at build time (#22). Scans the built site (page bundle, service worker,
 * prerendered HTML and CSS) for URLs on other origins in the places that load or send something,
 * and fails the build on any origin that its plugins don't declare (`network` metadata) and
 * `privacy.allowOrigins` doesn't list.
 *
 * A static scan can't see URLs built at runtime, so it is a guard rail; the CSP is the
 * enforcement.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { NetworkUse } from '@xcwds/core';

/** What a found URL would do: load code (never allowed off-origin) or anything else. */
export type UseKind = 'script' | 'other';

export type Finding = {
	/** The URL's origin (`https://example.com`), lowercased as `URL.origin` writes it. */
	origin: string;
	/** The code that uses it, shortened (`fetch("https://example.com/x")`). */
	snippet: string;
	kind: UseKind;
};

// A URL on another origin in a string: absolute (http, https, ws, wss) or protocol-relative.
// A template literal is read up to its first `${`.
const URL_IN_QUOTES = String.raw`\\?(["'\x60])((?:(?:https?|wss?):)?\/\/[^"'\x60\s\\]+)`;

/** JavaScript calls that send or load the URL in their first string argument. */
const JS: [RegExp, UseKind][] = [
	[new RegExp(String.raw`\bfetch\(\s*${URL_IN_QUOTES}`, 'g'), 'other'],
	[new RegExp(String.raw`\bnew\s+Request\(\s*${URL_IN_QUOTES}`, 'g'), 'other'],
	[new RegExp(String.raw`\bnew\s+(?:WebSocket|EventSource)\(\s*${URL_IN_QUOTES}`, 'g'), 'other'],
	[new RegExp(String.raw`\bsendBeacon\(\s*${URL_IN_QUOTES}`, 'g'), 'other'],
	// XMLHttpRequest: `.open("GET", "https://...")`.
	[
		new RegExp(
			String.raw`\.open\(\s*(?:["'\x60])[A-Za-z]+(?:["'\x60])\s*,\s*${URL_IN_QUOTES}`,
			'g'
		),
		'other'
	],
	[new RegExp(String.raw`\bnew\s+(?:Shared)?Worker\(\s*${URL_IN_QUOTES}`, 'g'), 'script'],
	[new RegExp(String.raw`\bimportScripts\(\s*${URL_IN_QUOTES}`, 'g'), 'script'],
	[new RegExp(String.raw`\bimport\(\s*${URL_IN_QUOTES}`, 'g'), 'script'],
	[new RegExp(String.raw`(?:\bfrom|\bimport)\s*${URL_IN_QUOTES}`, 'g'), 'script']
];

/** CSS `url(...)` and `@import "..."` (web fonts are the usual leak). */
const CSS: RegExp[] = [
	/\burl\(\s*\\?(["']?)((?:(?:https?|wss?):)?\/\/[^"'\s)\\]+)/g,
	/@import\s+\\?(["'])((?:(?:https?|wss?):)?\/\/[^"'\s\\]+)/g
];

/** `<link rel>` values that make the browser fetch the `href`. */
const LOADING_RELS = new Set([
	'stylesheet',
	'preload',
	'modulepreload',
	'prefetch',
	'preconnect',
	'dns-prefetch',
	'icon',
	'apple-touch-icon',
	'apple-touch-startup-image',
	'mask-icon',
	'manifest'
]);

/** Elements whose `src` (or `srcset`, `poster`, `data`) the browser loads. */
const SRC_TAG =
	/<(script|img|iframe|frame|source|video|audio|track|embed|object|input)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const LINK_TAG = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function attribute(attrs: string, name: string): string | undefined {
	const match = new RegExp(
		String.raw`(?:^|\s)${name}\s*=\s*(?:\\?"(.*?)\\?"|\\?'(.*?)\\?'|([^\s"'>]+))`,
		'i'
	).exec(attrs);
	return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/** The origin of an absolute or protocol-relative URL, or null for anything on this origin. */
export function externalOrigin(url: string): string | null {
	const text = url.split('${')[0]!.trim();
	if (!/^((https?|wss?):)?\/\//i.test(text)) return null;
	try {
		// Protocol-relative URLs load over the page's scheme, which is https in production.
		const parsed = new URL(text.startsWith('//') ? `https:${text}` : text);
		// A template literal can end mid-host (`https://${region}.example.com`): unknown.
		if (!parsed.hostname || /[${}]/.test(parsed.host)) return null;
		return parsed.origin;
	} catch {
		return null;
	}
}

function short(text: string): string {
	const line = text.replace(/\s+/g, ' ').trim();
	return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function push(out: Finding[], url: string, snippet: string, kind: UseKind) {
	const origin = externalOrigin(url);
	if (origin) out.push({ origin, snippet: short(snippet), kind });
}

function scanCss(text: string, out: Finding[]) {
	for (const pattern of CSS)
		for (const m of text.matchAll(pattern)) push(out, m[2]!, m[0], 'other');
}

function scanHtml(text: string, out: Finding[]) {
	for (const m of text.matchAll(SRC_TAG)) {
		const tag = m[1]!.toLowerCase();
		const attrs = m[2]!;
		for (const name of ['src', 'poster', 'data']) {
			const value = attribute(attrs, name);
			if (value) push(out, value, m[0], tag === 'script' ? 'script' : 'other');
		}
		// `srcset="a.png 1x, https://cdn.example/b.png 2x"`.
		const srcset = attribute(attrs, 'srcset');
		for (const candidate of srcset?.split(',') ?? [])
			push(out, candidate.trim().split(/\s+/)[0] ?? '', m[0], 'other');
	}
	for (const m of text.matchAll(LINK_TAG)) {
		const rels = (attribute(m[1]!, 'rel') ?? '').toLowerCase().split(/\s+/);
		const href = attribute(m[1]!, 'href');
		if (!href || !rels.some((r) => LOADING_RELS.has(r))) continue;
		const script = rels.includes('modulepreload') || /\bas\s*=\s*\\?["']?script/i.test(m[1]!);
		push(out, href, m[0], script ? 'script' : 'other');
	}
	// Inline styles: `<style>` blocks and `style="..."` attributes.
	scanCss(text, out);
}

function scanJs(text: string, out: Finding[]) {
	for (const [pattern, kind] of JS)
		for (const m of text.matchAll(pattern)) push(out, m[2]!, m[0], kind);
	// Svelte compiles markup into HTML strings, and CSS can live in JavaScript.
	scanHtml(text, out);
}

// Sources too (`.ts`, `.svelte`), so packages can check their own code.
const JS_FILES = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.svelte']);

/** The external URLs a file's text sends or loads, by its extension. */
export function scanText(text: string, extension: string): Finding[] {
	const out: Finding[] = [];
	const ext = extension.toLowerCase();
	if (ext === '.css') scanCss(text, out);
	else if (ext === '.html' || ext === '.htm') {
		scanHtml(text, out);
		// Inline scripts.
		for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
			for (const [pattern, kind] of JS)
				for (const j of m[1]!.matchAll(pattern)) push(out, j[2]!, j[0], kind);
	} else if (JS_FILES.has(ext)) scanJs(text, out);
	return out;
}

const SCANNED = new Set([...JS_FILES, '.css', '.html', '.htm']);

function* files(dir: string, skip: (name: string) => boolean): Generator<string> {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (skip(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* files(path, skip);
		else if (entry.isFile()) yield path;
	}
}

export type FileFinding = Finding & { file: string };

/** Scans every JavaScript, CSS and HTML file under `dirs`. Paths are relative to their dir. */
export function scanDirectories(dirs: string[]): FileFinding[] {
	const out: FileFinding[] = [];
	for (const dir of dirs)
		for (const file of files(dir, (name) => name === '.vite' || name === 'node_modules')) {
			if (!SCANNED.has(extname(file).toLowerCase())) continue;
			for (const finding of scanText(readFileSync(file, 'utf8'), extname(file)))
				out.push({ ...finding, file: relative(dir, file) });
		}
	return out;
}

export type PluginNetwork = { name: string; dir?: string; network: NetworkUse };

/** Plugins whose package files mention `origin`'s host: the likely source of a finding. */
function suspects(origin: string, plugins: PluginNetwork[]): PluginNetwork[] {
	const host = new URL(origin).host;
	const source = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.svelte', '.css', '.html']);
	return plugins.filter(({ dir }) => {
		if (!dir) return false;
		for (const file of files(dir, (name) => name === 'node_modules' || name.startsWith('.'))) {
			if (!source.has(extname(file)) || /\.(test|spec)\./.test(file)) continue;
			if (statSync(file).size > 2_000_000) continue;
			if (readFileSync(file, 'utf8').includes(host)) return true;
		}
		return false;
	});
}

/** The origins plugins declare and the config allows, by origin, with who allows each. */
export function allowedOrigins(
	plugins: PluginNetwork[],
	allowOrigins: string[]
): Map<string, string[]> {
	const allowed = new Map<string, string[]>();
	const add = (origin: string, by: string) =>
		allowed.set(origin, [...(allowed.get(origin) ?? []), by]);
	for (const { name, network } of plugins)
		if (network) for (const o of network.origins) add(o, name);
	for (const o of allowOrigins) add(o, 'privacy.allowOrigins');
	return allowed;
}

/**
 * The build's problems, as one message per origin, or `[]` when every external URL is declared.
 * An origin a plugin declares is only that plugin's: another plugin whose sources use it must
 * declare it too, so the settings page names everyone who contacts it. Scripts never load from
 * other origins, declared or not: the CSP only allows the app's own.
 */
export function checkFindings(
	findings: FileFinding[],
	plugins: PluginNetwork[],
	allowOrigins: string[]
): string[] {
	const allowed = allowedOrigins(plugins, allowOrigins);
	const byOrigin = new Map<string, FileFinding[]>();
	for (const f of findings) byOrigin.set(f.origin, [...(byOrigin.get(f.origin) ?? []), f]);
	const problems: string[] = [];
	for (const [origin, list] of byOrigin) {
		const scripts = list.some((f) => f.kind === 'script');
		if (!scripts && allowOrigins.includes(origin)) continue;
		const blame = suspects(origin, plugins).filter(
			({ network }) => !network || !network.origins.includes(origin)
		);
		if (!scripts && allowed.has(origin) && !blame.length) continue;
		const where = [...new Set(list.map((f) => `    ${f.snippet}  (${f.file})`))].slice(0, 5);
		const who = blame.length
			? `from ${blame
					.map(({ name, network }) =>
						network
							? `plugin "${name}" (it declares ${network.origins.join(', ')}, not this)`
							: `plugin "${name}" (it declares no network use)`
					)
					.join(', ')}`
			: 'from the app or one of its dependencies';
		const fix = scripts
			? `Scripts only load from the app's own origin (the CSP blocks others): bundle it instead.`
			: blame.length
				? `If it's meant to, declare it in the metadata of the plugin's build entry (the \`build\` export of its package's "." entry): network: { origins: ['${origin}'], reason: '...' }.`
				: `If it's meant to, add '${origin}' to privacy.allowOrigins in the xcwds config.`;
		problems.push(`${origin}, ${who}:\n${where.join('\n')}\n  ${fix}`);
	}
	return problems;
}

/** Scans the build output and throws when it contacts an origin nobody declared. */
export function enforcePrivacy(
	dirs: string[],
	plugins: PluginNetwork[],
	allowOrigins: string[]
): void {
	const problems = checkFindings(scanDirectories(dirs), plugins, allowOrigins);
	if (!problems.length) return;
	throw new Error(
		`@xcwds/sveltekit: the build contacts ${problems.length === 1 ? 'an origin' : 'origins'} that its plugins don't declare:\n\n${problems.join('\n\n')}\n`
	);
}
