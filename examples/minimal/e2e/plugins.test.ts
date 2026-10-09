// @xcwds/plugin-offline (#11) and @xcwds/plugin-update (#12) in examples/minimal, ported from
// xcwds.github.io's `pwa`, `errors` and `update` e2e tests. Each test serves its own copy of the
// build (`serveDeployment`), so a fake deploy never leaks into another test.
import { expect, test, type Page } from '@playwright/test';
import {
	gotoHydrated,
	pageVersion,
	serveDeployment,
	waitForServiceWorker,
	type Deployment
} from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';

test.use({ serviceWorkers: 'allow' });

const targets = [
	{ name: 'at the root', dir: 'build', base: '' },
	{ name: 'under a base path', dir: 'build-sub', base: '/sub' }
];

const banner = (page: Page) => page.getByTestId('update-banner');
const waiting = (page: Page) =>
	page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting);

/** Opens `path` and waits until the service worker controls it and the app has booted. */
async function open(page: Page, url: string) {
	await gotoHydrated(page, url);
	await expect(page.locator('html')).toHaveAttribute('data-hello', 'hi');
	await waitForServiceWorker(page);
}

/**
 * Comes back to the app until it finds the new version. A check asked for while the one on load
 * is still running is merged into it and can see the old worker, so one return isn't always enough.
 */
async function noticeUpdate(page: Page) {
	await expect(async () => {
		await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await expect(banner(page)).toContainText('A new version is available.', { timeout: 1000 });
	}).toPass({ timeout: 15_000 });
}

for (const { name, dir, base } of targets) {
	test.describe(name, () => {
		const build = fileURLToPath(new URL(`../${dir}`, import.meta.url));
		let deployment: Deployment;
		const url = (path: string) => deployment.url(path);

		test.beforeEach(async () => {
			deployment = await serveDeployment(build, { base });
		});
		test.afterEach(() => deployment.close());

		test('offline, every page and unknown URLs still render, and the notice says so', async ({
			page,
			context
		}) => {
			await open(page, url('/'));
			await expect(page.getByTestId('offline-notice')).toHaveCount(0);
			await context.setOffline(true);
			await expect(page.getByTestId('offline-notice')).toBeVisible();
			for (const path of ['/', '/hello']) {
				await page.goto(url(path));
				await expect(page.locator('html'), path).toHaveAttribute('data-path', path);
				await expect(page.getByTestId('offline-notice'), path).toBeVisible();
			}
			await expect(page.getByTestId('plugin-page')).toHaveText("hi from a plugin's page component");
			await page.goto(url('/no-such-page'));
			await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
			await expect(page.getByTestId('offline-notice')).toBeVisible();
			await context.setOffline(false);
			await expect(page.getByTestId('offline-notice')).toHaveCount(0);
		});

		test('a new version waits for Update, holds off while busy, then updates', async ({ page }) => {
			await open(page, url('/'));
			await expect(banner(page)).toHaveCount(0);
			await deployment.deployNewVersion('next');
			await noticeUpdate(page);
			expect(await waiting(page)).toBe(true);

			// A relaunch before Update keeps the old version.
			await open(page, url('/hello'));
			expect(await pageVersion(page)).toBe('original');
			await expect(banner(page)).toContainText('A new version is available.');
			await open(page, url('/'));

			// Something a reload would interrupt: the banner asks to finish first, and a "no" keeps it.
			await page.getByTestId('work').click();
			await expect(banner(page)).toContainText('Finish your work first.');
			page.once('dialog', (dialog) => dialog.dismiss());
			await banner(page).getByRole('button', { name: 'Update anyway' }).click();
			expect(await waiting(page)).toBe(true);
			expect(await pageVersion(page)).toBe('original');

			await page.getByTestId('work').click();
			await expect(banner(page).getByRole('button', { name: 'Update', exact: true })).toBeVisible();
			// Listen before clicking: the reload can finish before a later waitForEvent starts.
			await Promise.all([
				page.waitForEvent('load'),
				banner(page).getByRole('button', { name: 'Update', exact: true }).click()
			]);
			expect(await pageVersion(page)).toBe('next');
			expect(await waiting(page)).toBe(false);
			await expect(banner(page)).toHaveCount(0);
		});

		test('dismissing the banner hides it until the next launch', async ({ page }) => {
			await open(page, url('/'));
			await deployment.deployNewVersion('dismissed');
			await noticeUpdate(page);
			await banner(page).getByRole('button', { name: 'Dismiss' }).click();
			await expect(banner(page)).toHaveCount(0);
			await open(page, url('/hello'));
			await expect(banner(page)).toContainText('A new version is available.');
		});

		test('other open tabs are asked to reload after one tab updates', async ({ context }) => {
			const first = await context.newPage();
			await open(first, url('/'));
			const second = await context.newPage();
			await open(second, url('/hello'));

			await deployment.deployNewVersion('tabs');
			await noticeUpdate(first);
			await noticeUpdate(second);
			await Promise.all([
				first.waitForEvent('load'),
				banner(first).getByRole('button', { name: 'Update', exact: true }).click()
			]);
			expect(await pageVersion(first)).toBe('tabs');

			// The second tab is visible, so it asks instead of reloading under the user.
			await expect(banner(second)).toContainText(
				'Updated in another tab. Reload to finish updating.'
			);
			expect(await pageVersion(second)).toBe('original');
			await Promise.all([
				second.waitForEvent('load'),
				banner(second).getByRole('button', { name: 'Reload', exact: true }).click()
			]);
			expect(await pageVersion(second)).toBe('tabs');
			await expect(banner(second)).toHaveCount(0);
		});
	});
}
