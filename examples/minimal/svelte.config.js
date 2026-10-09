import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { withXcwds } from '@xcwds/sveltekit/config';

// The e2e tests also build the app under a base path, as on `user.github.io/repo`.
const base = /** @type {'' | `/${string}`} */ (process.env.BASE_PATH ?? '');
const out = process.env.BUILD_DIR ?? 'build';

/** @type {import('@sveltejs/kit').Config} */
export default await withXcwds(
	{ preprocess: vitePreprocess(), kit: { paths: { base } } },
	{ adapter: { pages: out, assets: out } }
);
