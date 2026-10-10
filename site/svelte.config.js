import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { withXcwds } from '@xcwds/sveltekit/config';

// A GitHub Pages project site is served under /<repo>: the deploy workflow sets BASE_PATH. The
// e2e tests build under a base path too, into BUILD_DIR.
const base = /** @type {'' | `/${string}`} */ (process.env.BASE_PATH ?? '');
const out = process.env.BUILD_DIR ?? 'build';

/** @type {import('@sveltejs/kit').Config} */
export default await withXcwds(
	{ preprocess: vitePreprocess(), kit: { paths: { base } } },
	{ adapter: { pages: out, assets: out } }
);
