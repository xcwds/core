// RFC 0001 spike (docs/rfc/0001-architecture.md): a throwaway prototype of what
// @xcwds/sveltekit will do (#10), to prove decisions 1 to 4 on SvelteKit 2. Not an API.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import adapter from '@sveltejs/adapter-static';

/** @typedef {{ name: string, options: Record<string, unknown> }} Descriptor */

/** The app's root: this file lives in `<root>/spike/`, wherever the tool loading it runs. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The path to the first value in `value` that JSON can't carry unchanged, or null.
 * @param {unknown} value
 * @param {string} path
 * @returns {string | null}
 */
function notJson(value, path) {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
	if (typeof value === 'number') return Number.isFinite(value) ? null : path;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const bad = notJson(value[i], `${path}[${i}]`);
			if (bad) return bad;
		}
		return null;
	}
	if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		for (const [key, v] of Object.entries(value)) {
			const bad = notJson(v, `${path}.${key}`);
			if (bad) return bad;
		}
		return null;
	}
	return path;
}

/** @param {string} root */
async function loadConfig(root) {
	const url = pathToFileURL(join(root, 'xcwds.config.js'));
	/** @type {{ plugins: Descriptor[] }} */
	const config = (await import(`${url.href}?t=${Date.now()}`)).default;
	for (const p of config.plugins) {
		// Decision 1: options cross from Node into the page and the worker as JSON.
		const bad = notJson(p.options, 'options');
		if (bad) throw new Error(`${p.name}: ${bad} must be JSON (no functions, classes or undefined)`);
	}
	return config;
}

/**
 * `import pN from '<plugin>/<entry>'` for every plugin, plus a `plugins` array of
 * [hooks, options] pairs.
 * @param {Descriptor[]} plugins
 * @param {'client' | 'worker'} entry
 */
function imports(plugins, entry) {
	const lines = plugins.map((p, i) => `import p${i} from ${JSON.stringify(`${p.name}/${entry}`)};`);
	const list = plugins.map((p, i) => `[p${i}, ${JSON.stringify(p.options)}]`).join(', ');
	return `${lines.join('\n')}\nexport const plugins = [${list}];\n`;
}

/**
 * The inline pre-paint script from every plugin's `onHead`, each in its own try so one
 * plugin's failure (or blocked storage) can't stop the others.
 * @param {Descriptor[]} plugins
 */
async function prePaint(plugins) {
	const parts = [];
	for (const p of plugins) {
		const { build } = await import(p.name);
		const code = build?.onHead?.(p.options);
		if (code) parts.push(`try{${code}}catch(e){}`);
	}
	return parts.join('');
}

/**
 * Decision 3: SvelteKit 2 builds the service worker in its own Vite build with
 * `configFile: false`, so a Vite plugin's virtual modules don't exist there. Write real files
 * the worker (and the server hook) import instead. Called from svelte.config.js, which both
 * `svelte-kit sync` and Vite load before anything is built.
 * @param {string} root
 */
async function generate(root) {
	const config = await loadConfig(root);
	const dir = join(root, '.xcwds');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'worker.js'), imports(config.plugins, 'worker'));
	const script = await prePaint(config.plugins);
	const hash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
	writeFileSync(
		join(dir, 'head.js'),
		`export const head = ${JSON.stringify(`<script>${script}</script>`)};\n`
	);
	return { config, hash };
}

/**
 * Prototype of `withXcwds()` for svelte.config.js: generates files, sets adapter-static with
 * the 404.html fallback, and a hash-mode CSP that also allows the pre-paint script.
 * @param {import('@sveltejs/kit').Config} svelteConfig
 */
export async function withXcwds(svelteConfig = {}) {
	const { hash } = await generate(ROOT);
	return {
		...svelteConfig,
		kit: {
			...svelteConfig.kit,
			adapter: adapter({ fallback: '404.html' }),
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', /** @type {any} */ (hash)],
					'connect-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:']
				}
			}
		}
	};
}

/**
 * Decision 1: the page bundle (client and prerender) gets plugins from a virtual module. This
 * works because Vite plugins apply to SvelteKit's client and server builds, unlike its worker
 * build.
 * @returns {import('vite').Plugin}
 */
export function xcwds() {
	const id = 'virtual:xcwds/client';
	return {
		name: 'xcwds-spike',
		resolveId: (source) => (source === id ? `\0${id}` : undefined),
		async load(resolved) {
			if (resolved !== `\0${id}`) return undefined;
			const config = await loadConfig(ROOT);
			return imports(config.plugins, 'client');
		}
	};
}
