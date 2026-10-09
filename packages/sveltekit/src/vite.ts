/**
 * `@xcwds/sveltekit/vite`: the Vite plugin. Put it before `sveltekit()`:
 *
 *   export default defineConfig({ plugins: [xcwds(), sveltekit()] });
 *
 * It serves `virtual:xcwds/client` (each plugin's `./client` entry, routes and head data) to the
 * page bundle, and emits `manifest.webmanifest` and the icons. The config itself is read by
 * `withXcwds()` in svelte.config.js, which SvelteKit loads first.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { buildAssets, contentType } from './build/assets.js';
import { clientModule } from './build/codegen.js';
import { recall, type BuildState } from './build/state.js';
import { stripBase } from './routes.js';

const CLIENT = 'virtual:xcwds/client';
const RESOLVED = `\0${CLIENT}`;
const PACKAGE = '@xcwds/sveltekit';

export function xcwds(): Plugin {
	let vite: ResolvedConfig;
	let state: BuildState;
	let assets: Promise<Map<string, string | Uint8Array>> | null = null;
	const getAssets = () => (assets ??= buildAssets(state));

	return {
		name: 'xcwds',
		config: () => ({
			// The package imports `virtual:xcwds/client`, so Vite must process it rather than leave it
			// to Node (SSR) or pre-bundle it with esbuild (dev).
			ssr: { noExternal: [PACKAGE] },
			optimizeDeps: { exclude: [PACKAGE] }
		}),
		configResolved(config) {
			vite = config;
			const found = recall(resolve(config.root));
			if (!found)
				throw new Error(
					'@xcwds/sveltekit: wrap your svelte.config.js in withXcwds() from @xcwds/sveltekit/config: `export default await withXcwds({ ... })`.'
				);
			state = found;
		},
		resolveId: (id) => (id === CLIENT ? RESOLVED : undefined),
		load(id) {
			if (id === RESOLVED) return clientModule(state);
			return undefined;
		},
		async generateBundle() {
			// SvelteKit builds the server first, then the client; the files belong to the client.
			if (vite.command !== 'build' || vite.build.ssr) return;
			for (const [fileName, source] of await getAssets()) {
				if (existsSync(join(state.root, 'static', fileName)))
					this.warn(`static/${fileName} is replaced by the one @xcwds/sveltekit generates.`);
				this.emitFile({ type: 'asset', fileName, source });
			}
		},
		configureServer(server) {
			// A changed config changes generated code: restart, which reloads svelte.config.js.
			const watched = new Set([state.configFile, ...state.dependencies].map((f) => resolve(f)));
			server.watcher.add([...watched]);
			server.watcher.on('change', (file) => {
				if (watched.has(resolve(file))) void server.restart();
			});
			// `vite dev` has no build output: serve the manifest and icons from memory.
			server.middlewares.use((req, res, next) => {
				const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
				const path = stripBase(pathname, state.base);
				if (path === null) return next();
				getAssets().then((files) => {
					const body = files.get(path.slice(1));
					if (body === undefined) return next();
					res.setHeader('content-type', contentType(path));
					res.end(body);
				}, next);
			});
		}
	};
}
