// examples/minimal on @xcwds/sveltekit (#10): static builds served the way GitHub Pages serves
// them, at the root (`build/`) and under a base path (`build-sub/`, built with BASE_PATH=/sub).
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server';

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
		let server: Awaited<ReturnType<typeof serveStatic>>;
		const url = (path: string) => `${server.origin}${base}${path}`;

		test.beforeAll(async () => {
			server = await serveStatic(fileURLToPath(new URL(`../${dir}`, import.meta.url)), { base });
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
			await page.goto(url('/'));
			await booted(page);
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
				await page.goto(url('/'));
				await booted(page);
				return page.evaluate(async () => {
					const registration = await navigator.serviceWorker.ready;
					if (!navigator.serviceWorker.controller)
						await new Promise((resolve) =>
							navigator.serviceWorker.addEventListener('controllerchange', resolve, {
								once: true
							})
						);
					return registration.scope;
				});
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
		});
	});
}
