// @xcwds/plugin-changelog (#19) in examples/minimal, ported from xcwds.github.io's What's new
// update test: after an update, a toast links to What's new, which badges only the entries the
// user hadn't seen; a fresh install badges none.
import { expect, test, type Page } from '@playwright/test';
import {
	gotoHydrated,
	serveDeployment,
	waitForServiceWorker,
	type Deployment
} from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';
import { changelog } from '../src/lib/changelog.js';

test.use({ serviceWorkers: 'allow' });

const targets = [
	{ name: 'at the root', dir: 'build', base: '' },
	{ name: 'under a base path', dir: 'build-sub', base: '/sub' }
];

const latest = changelog[0]!.id;
const banner = (page: Page) => page.getByTestId('update-banner');
const seen = (page: Page) => page.evaluate(() => localStorage.getItem('app:changelog:seen'));

for (const { name, dir, base } of targets) {
	test.describe(name, () => {
		const build = fileURLToPath(new URL(`../${dir}`, import.meta.url));
		let deployment: Deployment;
		const url = (path: string) => deployment.url(path);

		test.beforeEach(async () => {
			deployment = await serveDeployment(build, { base });
		});
		test.afterEach(() => deployment.close());

		test('a fresh install badges nothing', async ({ page }) => {
			await gotoHydrated(page, url('/settings'));
			await expect(page.getByTestId('whats-new-entry')).toHaveCount(changelog.length);
			await expect(page.getByTestId('whats-new-entry').first()).toContainText(
				changelog[0]!.items[0]!
			);
			await expect(page.getByTestId('whats-new-badge')).toHaveCount(0);
			await expect.poll(() => seen(page)).toBe(String(latest));
		});

		test("after an update, the toast links to What's new with only the newer entries", async ({
			page
		}) => {
			await gotoHydrated(page, url('/'));
			await waitForServiceWorker(page);
			await expect.poll(() => seen(page)).toBe(String(latest));
			// As if the version running now had one entry fewer.
			await page.evaluate(
				(id) => localStorage.setItem('app:changelog:seen', JSON.stringify(id)),
				latest - 1
			);
			await deployment.deployNewVersion('whats-new');
			await expect(async () => {
				await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
				await expect(banner(page)).toContainText('A new version is available.', {
					timeout: 1000
				});
			}).toPass({ timeout: 15_000 });
			await Promise.all([
				page.waitForEvent('load'),
				banner(page).getByRole('button', { name: 'Update', exact: true }).click()
			]);

			const toast = page.getByTestId('toast').filter({ hasText: 'App updated.' });
			await expect(toast).toBeVisible();
			const link = toast.getByRole('link', { name: "See what's new" });
			const box = (await link.boundingBox())!;
			expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
			await link.click();
			await expect(page).toHaveURL(url('/settings#whats-new'));
			await expect(page.getByTestId('whats-new')).toBeInViewport();
			await expect(page.getByTestId('whats-new-badge')).toHaveCount(1);
			await expect(
				page.getByTestId('whats-new-entry').first().getByTestId('whats-new-badge')
			).toBeVisible();

			// Seeing them marks them seen.
			await expect.poll(() => seen(page)).toBe(String(latest));
			await gotoHydrated(page, url('/settings'));
			await expect(page.getByTestId('whats-new-entry').first()).toBeVisible();
			await expect(page.getByTestId('whats-new-badge')).toHaveCount(0);
		});

		test('no toast after an update without new entries', async ({ page }) => {
			await gotoHydrated(page, url('/'));
			await waitForServiceWorker(page);
			await expect.poll(() => seen(page)).toBe(String(latest));
			await deployment.deployNewVersion('nothing-new');
			await expect(async () => {
				await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
				await expect(banner(page)).toContainText('A new version is available.', {
					timeout: 1000
				});
			}).toPass({ timeout: 15_000 });
			await Promise.all([
				page.waitForEvent('load'),
				banner(page).getByRole('button', { name: 'Update', exact: true }).click()
			]);
			await expect(page.locator('html')).toHaveAttribute('data-hello', 'hi');
			await page.waitForTimeout(500);
			await expect(page.getByTestId('toast')).toHaveCount(0);
		});
	});
}
