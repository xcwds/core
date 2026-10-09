/**
 * `@xcwds/sveltekit/config`: wraps svelte.config.js, since a Vite plugin can't set SvelteKit's
 * adapter or CSP.
 *
 *   export default await withXcwds({ kit: { paths: { base: '/repo' } } });
 *
 * It reads `xcwds.config.*` (writing `.xcwds/`), and sets adapter-static with a `404.html`
 * fallback (unknown URLs boot the app, on GitHub Pages and offline), prerender entries for every
 * registered route, and a hash-mode CSP. The root layout still needs `export const prerender = true`.
 */
import { resolve } from 'node:path';
import adapter from '@sveltejs/adapter-static';
import type { Config } from '@sveltejs/kit';
import { generate } from './build/generate.js';
import { remember } from './build/state.js';

type KitConfig = NonNullable<Config['kit']>;
type Csp = NonNullable<KitConfig['csp']>;
type Directives = NonNullable<Csp['directives']>;
type Entry = NonNullable<NonNullable<KitConfig['prerender']>['entries']>[number];

export type XcwdsKitOptions = {
	/** The app's root. Defaults to the working directory, where SvelteKit looks for its config. */
	root?: string;
	/** Options for adapter-static (ignored when `kit.adapter` is set). */
	adapter?: Parameters<typeof adapter>[0];
};

/**
 * A strict policy: same-origin only, plus `privacy.allowOrigins` for `connect-src` (#22).
 * Styles allow inline ones (Svelte transitions set them). The `<meta>` CSP of a static site
 * can't use `frame-ancestors` or reporting.
 */
function csp(user: Csp | undefined, allowOrigins: string[]): Csp {
	const directives: Record<string, string[]> = {
		'default-src': ['self'],
		'script-src': ['self'],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'data:', 'blob:'],
		'font-src': ['self', 'data:'],
		'connect-src': ['self', ...allowOrigins],
		'manifest-src': ['self'],
		'worker-src': ['self'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	};
	for (const [name, sources] of Object.entries(user?.directives ?? {})) {
		if (!Array.isArray(sources)) continue;
		directives[name] = [...new Set([...(directives[name] ?? []), ...(sources as string[])])];
	}
	return { ...user, mode: user?.mode ?? 'hash', directives: directives as Directives };
}

export async function withXcwds(
	svelteConfig: Config = {},
	options: XcwdsKitOptions = {}
): Promise<Config> {
	const kit: KitConfig = svelteConfig.kit ?? {};
	const state = await generate({
		root: resolve(options.root ?? process.cwd()),
		base: kit.paths?.base ?? ''
	});
	remember(state);
	const entries = [
		...(kit.prerender?.entries ?? ['*']),
		...state.routes.map((r) => r.path),
		...state.prerender
	] as Entry[];
	return {
		...svelteConfig,
		kit: {
			...kit,
			adapter: kit.adapter ?? adapter({ fallback: '404.html', ...options.adapter }),
			prerender: { ...kit.prerender, entries: [...new Set(entries)] },
			csp: csp(kit.csp, state.config.privacy.allowOrigins)
		}
	};
}
