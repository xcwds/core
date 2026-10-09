import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Rollup } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withXcwds } from '../config.js';
import { xcwds } from '../vite.js';
import { clientModule } from './codegen.js';
import { generate } from './generate.js';
import { recall } from './state.js';

let root: string;

async function write(file: string, content: string) {
	await mkdir(dirname(join(root, file)), { recursive: true });
	await writeFile(join(root, file), content);
}

/** A plugin package in the app's node_modules, with a build entry using every build hook. */
async function plugin(name: string, exports: Record<string, string>, index: string) {
	await write(
		`node_modules/${name}/package.json`,
		JSON.stringify({ name, type: 'module', exports })
	);
	await write(`node_modules/${name}/index.js`, index);
}

const BUILD = `
export const build = (app, options) => {
	app.route({ path: '/', title: 'Timer', parent: '/' });
	app.addHook('onConfig', (config) => ({ ...config, brand: { ...config.brand, shortName: 'Short' } }));
	app.addHook('onHead', () => 'document.documentElement.dataset.x=' + JSON.stringify(options.x) + ';');
	app.addHook('onWorker', () => ['side-effect']);
	app.addHook('onPrerender', () => ['/utils/timer/extra']);
	app.addHook('onManifest', (m) => ({ ...m, categories: ['utilities'] }));
};
`;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'xcwds-sveltekit-'));
	await plugin(
		'xcwds-plugin-timers',
		{ '.': './index.js', './client': './client.js', './worker': './worker.js' },
		BUILD
	);
	await plugin('plain', { '.': './index.js' }, 'export default {};');
	await write(
		'xcwds.config.ts',
		`const name: string = 'Test';
export default {
	brand: { name },
	manifest: { display: 'minimal-ui' },
	plugins: [{ name: 'xcwds-plugin-timers', options: { x: 1, prefix: '/utils/timer' } }, { name: 'plain', options: {} }]
};`
	);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('generate', () => {
	it('loads a TypeScript config, runs build hooks and writes the worker module', async () => {
		const state = await generate({ root, base: '/sub' });
		expect(state.config.brand.shortName).toBe('Short');
		expect(state.plugins).toEqual([
			{
				name: 'xcwds-plugin-timers',
				options: { x: 1, prefix: '/utils/timer' },
				client: true,
				worker: true
			},
			{ name: 'plain', options: {}, client: false, worker: false }
		]);
		expect(state.routes).toEqual([
			{ path: '/utils/timer', title: 'Timer', parent: '/', plugin: 'xcwds-plugin-timers' }
		]);
		expect(state.head).toEqual(['document.documentElement.dataset.x=1;']);
		expect(state.worker).toEqual(['side-effect']);
		expect(state.prerender).toEqual(['/utils/timer/extra']);
		expect(state.manifest).toMatchObject({
			short_name: 'Short',
			start_url: '/sub/',
			categories: ['utilities'],
			display: 'minimal-ui'
		});

		const worker = await readFile(join(root, '.xcwds/worker.js'), 'utf8');
		expect(worker).toContain(`import p0 from "xcwds-plugin-timers/worker";`);
		expect(worker).toContain(`import "side-effect";`);
		expect(worker).not.toContain('plain/worker');
		expect(worker).toContain('"assets":["manifest.webmanifest"]');
		expect(await readFile(join(root, '.xcwds/.gitignore'), 'utf8')).toBe('*\n');

		const client = clientModule(state);
		expect(client).toContain(`import p0 from "xcwds-plugin-timers/client";`);
		expect(client).toContain(`export const plugins = [[p0, {"x":1,"prefix":"/utils/timer"}]];`);
		expect(client).toContain('href=\\"/sub/manifest.webmanifest\\"');
	});

	it('refuses static files that collide with generated ones, naming them', async () => {
		await write('static/manifest.webmanifest', '{}');
		await write('assets/favicon.ico', '');
		await expect(generate({ root })).rejects.toThrow(
			'@xcwds/sveltekit generates manifest.webmanifest, which your static files also have. Remove it from static/'
		);
		await rm(join(root, 'static'), { recursive: true });
		await write('xcwds.config.js', `export default { brand: { name: 'T', icon: 'i.svg' } };`);
		await write('i.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
		await rm(join(root, 'xcwds.config.ts'));
		await expect(generate({ root, assets: 'assets' })).rejects.toThrow(
			'generates favicon.ico, which'
		);
		await expect(generate({ root })).resolves.toMatchObject({ assetsDir: join(root, 'static') });
	});

	it('explains a missing config, a missing plugin and options that are not JSON', async () => {
		await rm(join(root, 'xcwds.config.ts'));
		await expect(generate({ root })).rejects.toThrow('No xcwds config');
		await write(
			'xcwds.config.js',
			`export default { brand: { name: 'T' }, plugins: [{ name: 'missing', options: {} }] };`
		);
		await expect(generate({ root })).rejects.toThrow(`The plugin "missing" isn't installed`);
		await write(
			'xcwds.config.js',
			`export default { brand: { name: 'T' }, plugins: [{ name: 'plain', options: { f() {} } }] };`
		);
		await expect(generate({ root })).rejects.toThrow('plugins[0].options.f');
	});
});

describe('withXcwds', () => {
	it('sets the adapter, prerender entries and a hash-mode CSP, and remembers the build', async () => {
		const config = await withXcwds(
			{
				kit: {
					paths: { base: '/sub' },
					prerender: { entries: ['*', '/more'] },
					csp: {
						directives: {
							'img-src': ['https://img.example'],
							'upgrade-insecure-requests': true
						}
					}
				}
			},
			{ root }
		);
		expect(config.kit?.adapter?.name).toBe('@sveltejs/adapter-static');
		expect(config.kit?.prerender?.entries).toEqual([
			'*',
			'/more',
			'/utils/timer',
			'/utils/timer/extra'
		]);
		expect(config.kit?.csp?.mode).toBe('hash');
		expect(config.kit?.csp?.directives?.['img-src']).toEqual([
			'self',
			'data:',
			'blob:',
			'https://img.example'
		]);
		expect(config.kit?.csp?.directives?.['script-src']).toEqual(['self']);
		expect(config.kit?.csp?.directives?.['upgrade-insecure-requests']).toBe(true);
		expect(recall(root)?.base).toBe('/sub');
	});
});

describe('the Vite plugin', () => {
	it('serves the client module and emits the manifest in the client build only', async () => {
		await withXcwds({}, { root });
		const plugin = xcwds();
		const hook = <T>(h: unknown): T =>
			(typeof h === 'function' ? h : (h as { handler: unknown }).handler) as T;
		expect(hook<() => unknown>(plugin.config).call({})).toMatchObject({
			ssr: { noExternal: ['@xcwds/sveltekit'] }
		});
		const resolved = (ssr: boolean) =>
			({ root, command: 'build', build: { ssr } }) as unknown as Parameters<
				Extract<typeof plugin.configResolved, (...a: never[]) => unknown>
			>[0];
		hook<(c: unknown) => void>(plugin.configResolved)(resolved(true));
		const id = hook<(id: string) => string>(plugin.resolveId).call({}, 'virtual:xcwds/client');
		expect(hook<(id: string) => string>(plugin.load).call({}, id)).toContain(
			'xcwds-plugin-timers/client'
		);

		const emitted: Rollup.EmittedAsset[] = [];
		const context = {
			emitFile: (f: Rollup.EmittedAsset) => emitted.push(f),
			error: (message: string) => {
				throw new Error(message);
			}
		};
		const generateBundle = hook<(this: typeof context) => Promise<void>>(plugin.generateBundle);
		await generateBundle.call(context);
		expect(emitted).toEqual([]);
		hook<(c: unknown) => void>(plugin.configResolved)(resolved(false));
		await generateBundle.call(context);
		expect(emitted.map((f) => f.fileName)).toEqual(['manifest.webmanifest']);
		expect(JSON.parse(String(emitted[0]!.source))).toMatchObject({ name: 'Test' });
		// A static file added after svelte.config.js loaded still fails the build.
		await write('static/manifest.webmanifest', '{}');
		await expect(generateBundle.call(context)).rejects.toThrow('generates manifest.webmanifest');
	});

	it('asks for withXcwds() when svelte.config.js has not run it', () => {
		const plugin = xcwds();
		const configResolved = plugin.configResolved as (c: unknown) => void;
		expect(() => configResolved({ root: join(root, 'other') })).toThrow('withXcwds()');
		expect(existsSync(join(root, 'other'))).toBe(false);
	});
});
