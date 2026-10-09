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
import { serveStatic, type StaticServer } from './static-server.js';

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
	const dir = await mkdtemp(join(tmpdir(), 'xcwds-deploy-'));
	await cp(buildDir, dir, { recursive: true });
	const versionFile = join(dir, appDir, 'version.json');
	let version: string;
	try {
		version = (JSON.parse(await readFile(versionFile, 'utf8')) as { version: string }).version;
	} catch (cause) {
		await rm(dir, { recursive: true, force: true });
		throw new Error(`${buildDir} has no ${appDir}/version.json: is it a SvelteKit build?`, {
			cause
		});
	}
	const server = await serveStatic(dir, { base });
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
					html.replace('</head>', () => `<meta name="test-version" content="${marker}"></head>`)
				);
			}
			// A new build version names the new worker's cache, so it doesn't install into the old
			// one's. The trailing comment makes the file differ even if the version string didn't.
			const next = `${version}-${marker.replace(/\W/g, '')}`;
			const worker = join(dir, 'service-worker.js');
			const source = await readFile(worker, 'utf8').catch(() => {
				throw new Error('The build has no service-worker.js.');
			});
			await writeFile(worker, `${source.replaceAll(version, next)}\n// ${marker}\n`);
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
