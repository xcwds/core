import { expect, test } from '@playwright/test';
import {
	auditTapTargets,
	gotoHydrated,
	serveStatic,
	waitForServiceWorker,
	type StaticServer
} from '@xcwds/testing/playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The build, served the way GitHub Pages serves it, at the root and under /xcwds (as on
// xcwds.github.io/xcwds).
const build = fileURLToPath(new URL('../build', import.meta.url));
let server: StaticServer;
let sub: StaticServer;
const url = (path: string) => server.url(path);
test.beforeAll(async () => {
	server = await serveStatic(build);
	sub = await serveStatic(fileURLToPath(new URL('../build-base', import.meta.url)), {
		base: '/xcwds'
	});
});
test.afterAll(async () => {
	await server.close();
	await sub.close();
});

const NAME = 'xcwds docs';
/** Every prerendered page. */
const PAGES = readdirSync(build, { recursive: true, encoding: 'utf8' })
	.filter((f) => f.endsWith('.html') && f !== '404.html')
	.map((f) => (f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`))
	.sort();

test('every page opens, with tap targets big enough for a finger', async ({ page }) => {
	expect(PAGES).toEqual(
		expect.arrayContaining(['/docs/plugin-guide', '/reference/plugin-timers', '/tally'])
	);
	for (const path of PAGES) {
		await gotoHydrated(page, url(path));
		await expect(page.locator('h1')).toBeVisible();
		expect(await auditTapTargets(page), path).toEqual([]);
	}
});

test('on a computer, docs pages list their sections, with tap targets big enough', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await gotoHydrated(page, url('/docs/concepts'));
	const toc = page.getByRole('navigation', { name: 'On this page' });
	await expect(toc).toBeVisible();
	await toc.getByRole('link', { name: 'Decorators' }).click();
	await expect(page).toHaveURL(/#decorators$/);
	expect(await auditTapTargets(page)).toEqual([]);
});

test('links between pages stay in the app, under a base path too', async ({ page }) => {
	for (const [serve, prefix] of [
		[url, ''],
		[(path: string) => sub.url(path), '/xcwds']
	] as const) {
		await gotoHydrated(page, serve('/'));
		await page.getByRole('link', { name: /Get started/ }).click();
		await expect(page.locator('h1')).toHaveText(/Getting started/);
		// A link written for GitHub (`concepts.md`) goes to the page here.
		await page
			.locator('.prose')
			.getByRole('link', { name: 'Concepts', exact: true })
			.first()
			.click();
		await expect(page).toHaveURL(`${serve('/docs/concepts')}`);
		await expect(page.locator('h1')).toHaveText(/Concepts/);
		// A package's folder goes to its reference page.
		await gotoHydrated(page, serve('/docs/ecosystem'));
		await page.getByRole('link', { name: '@xcwds/plugin-timers' }).click();
		await expect(page).toHaveURL(new RegExp(`${prefix}/reference/plugin-timers$`));
	}
});

test('reference pages show the API from the types', async ({ page }) => {
	await gotoHydrated(page, url('/reference/plugin-timers'));
	const api = page.locator('.prose');
	await expect(api.getByRole('heading', { name: 'Options (TimersOptions)' })).toBeVisible();
	await expect(api.getByText('app.timers?', { exact: true })).toBeVisible();
	await expect(api.getByText('app.timers.create', { exact: true })).toBeVisible();
	await expect(api.getByText('settings.alarm', { exact: true })).toBeVisible();
});

test('the guide’s plugin works here', async ({ page }) => {
	await gotoHydrated(page, url('/tally'));
	await expect(page.locator('h1')).toHaveText(/Tally/);
	await page.getByRole('button', { name: '+1' }).click();
	await page.getByRole('button', { name: '+1' }).click();
	await expect(page.getByTestId('tally')).toHaveText('2');
	await gotoHydrated(page, url('/tally'));
	await expect(page.getByTestId('tally')).toHaveText('2');
	// Its setting is on the settings page.
	await gotoHydrated(page, url('/settings'));
	await expect(page.getByRole('heading', { name: 'Tally' })).toBeVisible();
	await expect(page.getByText('Tally step')).toBeVisible();
});

test('unknown pages show the error page', async ({ page }) => {
	await gotoHydrated(page, url('/no-such-page'));
	await expect(page.getByTestId('error-page')).toBeVisible();
});

test('the manifest makes it installable', async ({ request }) => {
	const manifest = await (await request.get(url('/manifest.webmanifest'))).json();
	expect(manifest).toMatchObject({ name: NAME, display: 'standalone', start_url: '/' });
	expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
		expect.arrayContaining(['192x192', '512x512'])
	);
});

test.describe('with the service worker', () => {
	test.use({ serviceWorkers: 'allow' });

	test('the docs work offline, and never contact another server', async ({ page, context }) => {
		const origin = new URL(url('/')).origin;
		const away: string[] = [];
		context.on('request', (r) => {
			if (!/^(data|blob):/.test(r.url()) && new URL(r.url()).origin !== origin) away.push(r.url());
		});
		await gotoHydrated(page, url('/'));
		await waitForServiceWorker(page);
		await context.setOffline(true);
		for (const path of PAGES) {
			await gotoHydrated(page, url(path));
			await expect(page.locator('h1')).toBeVisible();
		}
		// Client-side navigation loads page data, which is precached too.
		await gotoHydrated(page, url('/docs'));
		await page.getByRole('link', { name: /Writing a plugin/ }).click();
		await expect(page.locator('h1')).toHaveText(/Writing a plugin/);
		await context.setOffline(false);
		expect(away).toEqual([]);
	});
});
