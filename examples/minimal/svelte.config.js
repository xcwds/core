import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { withXcwds } from './spike/xcwds.js';

/** @type {import('@sveltejs/kit').Config} */
export default await withXcwds({ preprocess: vitePreprocess() });
