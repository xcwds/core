/**
 * Fake deploys, to test what an installed app does when a new version comes out (ported from
 * xcwds.github.io's update test). `serveDeployment()` serves a copy of a build; each
 * `deployNewVersion()` stamps every page and gives the service worker a new version, like a
 * real deploy, so the browser finds a new worker to install.
 */
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { checkBase, serveStatic, type StaticServer } from './static-server.js';

const attribute = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export type Deployment = StaticServer & {
	/** The copy being served. */
	dir: string;
	/** The build version now deployed (`_app/version.json`). */
	readonly version: string;
	/** Deploys a "new version" marked `marker`; resolves to its build version. */
	deployNewVersion(marker?: string): Promise<string>;
	/** Stops the server and deletes the copy. */
	close(): Promise<void>;
};

const META = /<meta name="test-version"[^>]*>/;

export async function serveDeployment(
	buildDir: string,
	{ base = '', appDir = '_app' }: { base?: string; appDir?: string } = {}
): Promise<Deployment> {
	checkBase(base);
	const dir = await mkdtemp(join(tmpdir(), 'xcwds-deploy-'));
	const versionFile = join(dir, appDir, 'version.json');
	let version: string;
	let server: StaticServer;
	try {
		await cp(buildDir, dir, { recursive: true });
		try {
			version = (JSON.parse(await readFile(versionFile, 'utf8')) as { version: string }).version;
		} catch (cause) {
			throw new Error(`${buildDir} has no ${appDir}/version.json: is it a SvelteKit build?`, {
				cause
			});
		}
		server = await serveStatic(dir, { base });
	} catch (error) {
		await rm(dir, { recursive: true, force: true });
		throw error;
	}
	let deploys = 0;

	return {
		...server,
		dir,
		get version() {
			return version;
		},
		async deployNewVersion(marker = `deploy-${++deploys}`) {
			for (const file of await readdir(dir, { recursive: true })) {
				if (!file.endsWith('.html')) continue;
				const path = join(dir, file);
				const html = (await readFile(path, 'utf8')).replace(META, '');
				await writeFile(
					path,
					html.replace(
						'</head>',
						() => `<meta name="test-version" content="${attribute(marker)}"></head>`
					)
				);
			}
			// A new build version names the new worker's cache, so it doesn't install into the old
			// one's. The trailing comment makes the file differ even if the version string didn't.
			const next = `${version}-${marker.replace(/\W/g, '')}`;
			const worker = join(dir, 'service-worker.js');
			const source = await readFile(worker, 'utf8').catch(() => {
				throw new Error('The build has no service-worker.js.');
			});
			await writeFile(
				worker,
				`${source.replaceAll(version, next)}\n// ${marker.replace(/[\r\n\u2028\u2029]/g, ' ')}\n`
			);
			await writeFile(versionFile, JSON.stringify({ version: next }));
			version = next;
			return next;
		},
		async close() {
			await server.close();
			await rm(dir, { recursive: true, force: true });
		}
	};
}

/** The deploy marker of the page being shown, or `'original'` before any deploy. */
export function pageVersion(page: Page): Promise<string> {
	return page.evaluate(
		() => document.querySelector('meta[name="test-version"]')?.getAttribute('content') ?? 'original'
	);
}
