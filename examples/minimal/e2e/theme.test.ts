// @xcwds/plugin-theme (#14) in examples/minimal: the saved theme applies before first paint, and
// `system` follows the OS. Ported from xcwds.github.io's dark-mode checks.
import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, serveStatic, type StaticServer } from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';

const targets = [
	{ name: 'at the root', dir: 'build', base: '' },
	{ name: 'under a base path', dir: 'build-sub', base: '/sub' }
];

const LIGHT = { scheme: 'light', background: 'rgb(255, 255, 255)', bar: '#dbeafe' };
const DARK = { scheme: 'dark', background: 'rgb(3, 7, 18)', bar: '#030712' };

/** What the page shows: its scheme, background and browser bar colour. */
async function shows(page: Page, expected: typeof LIGHT) {
	await expect(page.locator('html')).toHaveAttribute('data-color-scheme', expected.scheme);
	expect(
		await page.evaluate(() => ({
			background: getComputedStyle(document.documentElement).backgroundColor,
			bar: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
			colorScheme: document.documentElement.style.colorScheme
		}))
	).toEqual({ background: expected.background, bar: expected.bar, colorScheme: expected.scheme });
}

/** Reloads with every script module blocked: only the inline pre-paint script runs. */
async function reloadBeforeAppCode(page: Page) {
	await page.route(/\.js$/, (route) => route.abort());
	await page.reload();
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

		test('with dark saved, a reload never paints light', async ({ page }) => {
			await page.emulateMedia({ colorScheme: 'light' });
			await gotoHydrated(page, url('/'));
			await shows(page, LIGHT);
			await page.getByLabel('Dark').check();
			await shows(page, DARK);
			// Before any app code runs, on this page and any other.
			await reloadBeforeAppCode(page);
			await shows(page, DARK);
			await page.goto(url('/hello'));
			await shows(page, DARK);
			await page.goto(url('/no-such-page'));
			await shows(page, DARK);
		});

		test('system follows the OS, before first paint and while open', async ({ page }) => {
			await page.emulateMedia({ colorScheme: 'dark' });
			await gotoHydrated(page, url('/'));
			await expect(page.getByLabel('System')).toBeChecked();
			await shows(page, DARK);
			await page.emulateMedia({ colorScheme: 'light' });
			await shows(page, LIGHT);
			await page.emulateMedia({ colorScheme: 'dark' });
			await shows(page, DARK);
			// Light ignores the OS.
			await page.getByLabel('Light').check();
			await shows(page, LIGHT);
			await page.getByLabel('System').check();
			await shows(page, DARK);
			await reloadBeforeAppCode(page);
			await shows(page, DARK);
		});

		test('another tab follows a change', async ({ context }) => {
			const first = await context.newPage();
			const second = await context.newPage();
			await gotoHydrated(first, url('/'));
			await gotoHydrated(second, url('/hello'));
			await first.getByLabel('Dark').check();
			await shows(second, DARK);
		});
	});
}
