// examples/minimal on @xcwds/sveltekit (#10): static builds served the way GitHub Pages serves
// them, at the root (`build/`) and under a base path (`build-sub/`, built with BASE_PATH=/sub).
import { expect, test, type Page } from '@playwright/test';
import {
	auditTapTargets,
	gotoHydrated,
	pageVersion,
	serveDeployment,
	serveStatic,
	updateServiceWorker,
	waitForServiceWorker,
	type StaticServer
} from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';

const targets = [
	{ name: 'at the root', dir: 'build', base: '' },
	{ name: 'under a base path', dir: 'build-sub', base: '/sub' }
];

/** Waits until the app has booted: the example plugin's `onBoot` hook sets `data-hello`. */
async function booted(page: Page) {
	await expect(page.locator('html')).toHaveAttribute('data-hello', 'hi');
}

for (const { name, dir, base } of targets) {
	test.describe(name, () => {
		const build = fileURLToPath(new URL(`../${dir}`, import.meta.url));
		let server: StaticServer;
		const url = (path: string) => server.url(path);

		test.beforeAll(async () => {
			server = await serveStatic(build, { base });
		});
		test.afterAll(() => server.close());

		test('a client plugin from the config boots in the page', async ({ page }) => {
			await page.goto(url('/'));
			await booted(page);
			await expect(page.locator('html')).toHaveAttribute('data-path', '/');
		});

		test('a plugin page is prerendered, titled from the route registry and hydrates', async ({
			page
		}) => {
			const html = await (await page.request.get(url('/hello'))).text();
			expect(html).toContain('hi from a plugin');
			expect(html).toContain('<title>Hello</title>');
			await gotoHydrated(page, url('/'));
			await page.getByRole('link', { name: "A plugin's page" }).click();
			await expect(page).toHaveURL(url('/hello'));
			await expect(page.locator('html')).toHaveAttribute('data-path', '/hello');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello');
			await expect(page.getByTestId('plugin-page')).toHaveText("hi from a plugin's page component");
			// persist() saves the count and loads it again after a reload.
			await page.getByTestId('count').click();
			await expect(page.getByTestId('count')).toHaveText('Pressed 1 times');
			await page.reload();
			await booted(page);
			await expect(page.getByTestId('count')).toHaveText('Pressed 1 times');
		});

		test.describe('onNavigate guards', () => {
			const length = (page: Page) => page.evaluate(() => history.length);

			/** Opens the home page; history then has the blank tab and it. */
			async function start(page: Page) {
				await page.goto(url('/'));
				await booted(page);
				expect(await length(page)).toBe(2);
			}

			/** Asserts the URL, what the page shows, and the history length. */
			async function at(page: Page, path: string, entries: number) {
				await expect(page).toHaveURL(url(path));
				const shown =
					path === '/'
						? page.getByRole('link', { name: "A plugin's page" })
						: page.getByTestId('plugin-page');
				await expect(shown).toBeVisible();
				expect(await length(page)).toBe(entries);
			}

			test('redirect and cancel synchronously, and stop redirect loops', async ({ page }) => {
				const errors: string[] = [];
				page.on('console', (m) => {
					if (m.type() === 'error') errors.push(m.text());
				});
				await start(page);
				await page.getByRole('link', { name: 'Guarded /moved' }).click();
				await at(page, '/hello', 3);
				await page.goBack();
				await at(page, '/', 3);

				await page.getByRole('link', { name: 'Guarded /blocked' }).click();
				await page.waitForTimeout(300);
				await at(page, '/', 3);

				await page.getByRole('link', { name: 'Guarded /loop' }).click();
				await expect.poll(() => errors.join('\n')).toContain('redirected more than 5 times');
				await at(page, '/', 3);
			});

			test('hold async navigations, and keep history right through Back and Forward', async ({
				page
			}) => {
				const html = page.locator('html');
				await start(page);

				await page.getByRole('link', { name: 'Guarded /slow' }).click();
				await at(page, '/hello', 3);
				await page.goBack();
				await at(page, '/', 3);

				await page.getByRole('link', { name: 'Guarded /hello?wait' }).click();
				await at(page, '/hello?wait', 3);
				await expect(html).toHaveAttribute('data-path', '/hello');
				await page.goBack();
				await at(page, '/', 3);
				await page.goForward();
				await at(page, '/hello?wait', 3);
				await page.goBack();
				await at(page, '/', 3);
				await expect(html).toHaveAttribute('data-path', '/');
			});

			test('repeat Back and Forward after a guard that resolves at once', async ({ page }) => {
				await start(page);
				await page.getByRole('link', { name: 'Guarded /hello?now' }).click();
				await at(page, '/hello?now', 3);
				await page.goBack();
				await at(page, '/', 3);
				await page.goForward();
				await at(page, '/hello?now', 3);
				await page.goBack();
				await at(page, '/', 3);
				// Still guarded next time (nothing was left marked as allowed).
				await page.goForward();
				await at(page, '/hello?now', 3);
			});

			test('redirect a Forward navigation asynchronously', async ({ page }) => {
				await start(page);
				await page.getByRole('link', { name: 'Guarded /hello?once' }).click();
				await at(page, '/hello?once', 3);
				await page.goBack();
				await at(page, '/', 3);
				// Forward is held, undone, then redirected home: the page stays at its entry (a
				// redirect to the current URL replaces it), and the forward entry is still guarded.
				await page.goForward();
				await page.waitForTimeout(300);
				await at(page, '/', 3);
				await page.goForward();
				await page.waitForTimeout(300);
				await at(page, '/', 3);
			});

			test("run the first page's guards once the app has booted", async ({ page }) => {
				// /moved isn't a page: 404.html boots the app, and the guard redirects in place.
				await page.goto(url('/moved'));
				await at(page, '/hello', 2);
			});

			test("drop the first page's redirect once the user has moved on", async ({ page }) => {
				// The guard for /hello?bounce redirects after 1.5 s; the user leaves well before that.
				await page.goto(url('/hello?bounce'));
				await booted(page);
				await page.getByRole('link', { name: 'Home' }).click();
				await at(page, '/', 3);
				await page.waitForTimeout(2000);
				await at(page, '/', 3);
			});

			test('replace the first page through a whole redirect chain', async ({ page }) => {
				// /hello?bounce → (async) /moved → /hello, all in the first page's history entry.
				await page.goto(url('/hello?bounce'));
				await booted(page);
				await expect(page).toHaveURL(url('/hello'), { timeout: 5000 });
				await at(page, '/hello', 2);
				await page.goBack();
				await expect(page).toHaveURL('about:blank');
			});

			test('push one entry for a redirect chain started by a link', async ({ page }) => {
				await start(page);
				await page.getByRole('link', { name: 'Guarded /hello?bounce' }).click();
				await expect(page).toHaveURL(url('/hello'), { timeout: 5000 });
				await at(page, '/hello', 3);
				await page.goBack();
				await at(page, '/', 3);
			});
		});

		test('every control is a 44px tap target on a phone', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			for (const path of ['/', '/hello', '/no-such-page']) {
				await gotoHydrated(page, url(path));
				await booted(page);
				expect(await auditTapTargets(page), path).toEqual([]);
			}
		});

		test('the pre-paint script runs before first paint under a hash CSP', async ({ page }) => {
			const errors: string[] = [];
			page.on('console', (m) => {
				if (m.type() === 'error') errors.push(m.text());
			});
			for (const path of ['/', '/hello', '/no-such-page']) {
				const html = await (await page.request.get(url(path))).text();
				expect(html, path).toContain('http-equiv="content-security-policy"');
				expect(html, path).not.toContain('%xcwds.head%');
				// Both attributes are set by the inline script: every module is blocked.
				await page.route(/\.js$/, (route) => route.abort());
				await page.goto(url(path));
				await expect(page.locator('html'), path).toHaveAttribute('data-prepaint', 'hi');
				await expect(page.locator('html'), path).toHaveAttribute('data-greeting', 'hi');
				await page.unrouteAll();
			}
			expect(errors.filter((e) => e.includes('Content Security Policy'))).toEqual([]);
		});

		test('saved settings apply before first paint', async ({ page }) => {
			await page.goto(url('/hello'));
			await booted(page);
			await page.getByTestId('greeting').click();
			await expect(page.getByTestId('plugin-page')).toHaveText(
				"hey from a plugin's page component"
			);
			await page.route(/\.js$/, (route) => route.abort());
			await page.reload();
			await expect(page.locator('html')).toHaveAttribute('data-greeting', 'hey');
		});

		test('the manifest, icons and head tags use the base path', async ({ page }) => {
			await page.goto(url('/'));
			const href = await page.locator('link[rel="manifest"]').getAttribute('href');
			expect(href).toBe(`${base}/manifest.webmanifest`);
			const manifest = await (await page.request.get(`${server.origin}${href}`)).json();
			expect(manifest).toMatchObject({
				name: 'Minimal',
				id: `${base}/`,
				start_url: `${base}/`,
				scope: `${base}/`,
				display: 'standalone'
			});
			for (const icon of manifest.icons as { src: string; type: string }[]) {
				const response = await page.request.get(`${server.origin}${icon.src}`);
				expect(response.status(), icon.src).toBe(200);
				expect(response.headers()['content-type'], icon.src).toBe(icon.type);
			}
			const html = await (await page.request.get(url('/'))).text();
			expect(html).toContain(
				`<link rel="apple-touch-icon" href="${base}/icons/apple-touch-icon.png" />`
			);
			expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Minimal" />');
		});

		test.describe('with the service worker', () => {
			test.use({ serviceWorkers: 'allow' });

			/** Opens the home page and waits until the service worker controls it. */
			async function controlled(page: Page) {
				await gotoHydrated(page, url('/'));
				await booted(page);
				return waitForServiceWorker(page);
			}

			test('installs as a PWA', async ({ page }) => {
				expect(await controlled(page)).toBe(url('/'));
				const cdp = await page.context().newCDPSession(page);
				const { errors } = await cdp.send('Page.getAppManifest');
				expect(errors).toEqual([]);
				const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
				// Playwright's contexts are incognito, where Chromium never offers to install.
				expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([]);
			});

			test('a worker plugin answers a fetch', async ({ page }) => {
				await controlled(page);
				const text = await page.evaluate(
					(path) => fetch(path).then((r) => r.text()),
					`${base}/__xcwds/hello`
				);
				expect(text).toBe('hi from the worker');
			});

			test('works offline', async ({ page, context }) => {
				await controlled(page);
				await context.setOffline(true);
				// The network really is gone: what the worker hasn't cached fails.
				const fetched = await page.evaluate(
					(path) =>
						fetch(path).then(
							() => 'online',
							() => 'offline'
						),
					`${base}/never-cached.txt`
				);
				expect(fetched).toBe('offline');
				await page.reload();
				await booted(page);
				await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minimal');
				await page.goto(url('/hello'));
				await booted(page);
				await expect(page.getByTestId('plugin-page')).toHaveText(
					"hi from a plugin's page component"
				);
				// Pages that were never cached get the 404.html fallback, which boots the app.
				await page.goto(url('/no-such-page'));
				await expect(page.getByTestId('error')).toHaveText('Page not found');
				await context.setOffline(false);
			});

			test('a new version installs and waits; the page keeps the old one', async ({ page }) => {
				const deployment = await serveDeployment(build, { base });
				try {
					await gotoHydrated(page, deployment.url('/'));
					await booted(page);
					await waitForServiceWorker(page);
					await deployment.deployNewVersion('v2');
					// There is no skipWaiting(): the new worker waits for the old one's tabs to close.
					expect(await updateServiceWorker(page)).toBe('waiting');
					// Precached pages come from the old version's cache, even on a reload.
					await page.reload();
					await booted(page);
					expect(await pageVersion(page)).toBe('original');
					// The old worker still controls it, and the new one is still waiting.
					expect(
						await page.evaluate(async () => {
							const registration = await navigator.serviceWorker.ready;
							const controller = navigator.serviceWorker.controller;
							return [
								controller !== null && controller === registration.active,
								registration.waiting?.state
							];
						})
					).toEqual([true, 'installed']);
					// The network has the new version.
					expect(await (await page.request.get(deployment.url('/'))).text()).toContain(
						'content="v2"'
					);
				} finally {
					await deployment.close();
				}
			});
		});
	});
}
