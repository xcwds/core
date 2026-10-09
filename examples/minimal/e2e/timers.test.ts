// @xcwds/plugin-timers (#18) in examples/minimal, ported from xcwds.github.io's cooking-timer
// tests: timers count against the wall clock, ring on every page, survive a reload, and keep an
// app update waiting while they run.
import { expect, test, type Page } from '@playwright/test';
import {
	gotoHydrated,
	serveDeployment,
	serveStatic,
	waitForServiceWorker,
	type Deployment,
	type StaticServer
} from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';

test.use({ viewport: { width: 390, height: 844 } });

const targets = [
	{ name: 'at the root', dir: 'build', base: '' },
	{ name: 'under a base path', dir: 'build-sub', base: '/sub' }
];

async function startTimer(page: Page, label: string, minutes: string) {
	await page.getByLabel('Label').fill(label);
	await page.getByLabel('Minutes').fill(minutes);
	await page.getByRole('button', { name: 'Start' }).click();
}

for (const { name, dir, base } of targets) {
	test.describe(name, () => {
		const build = fileURLToPath(new URL(`../${dir}`, import.meta.url));

		test.describe('timers', () => {
			let server: StaticServer;
			const url = (path: string) => server.url(path);
			test.beforeAll(async () => {
				server = await serveStatic(build, { base });
			});
			test.afterAll(() => server.close());

			test('a timer counts down, rings on every page, and +1 min snoozes it', async ({ page }) => {
				await page.clock.install();
				await gotoHydrated(page, url('/utils/timer'));
				await startTimer(page, 'Pasta', '2');
				const timer = page.getByTestId('timer');
				await expect(timer.getByRole('timer')).toHaveText('2:00');
				await page.clock.fastForward('00:30');
				await expect(timer.getByRole('timer')).toHaveText('1:30');
				await timer.getByRole('button', { name: 'Pause' }).click();
				await page.clock.fastForward('05:00');
				await expect(timer.getByRole('timer')).toHaveText('1:30');
				await timer.getByRole('button', { name: 'Resume' }).click();

				// The page that lists timers doesn't also show an alert.
				await page.getByRole('link', { name: 'Home' }).first().click();
				await page.clock.fastForward('01:31');
				const alert = page.getByTestId('timer-alert');
				await expect(alert).toHaveText(/Pasta is done/);
				await alert.getByRole('button', { name: '+1 min' }).click();
				await expect(alert).toHaveCount(0);
				await page.clock.fastForward('01:01');
				await expect(alert).toHaveText(/Pasta is done/);
				await alert.getByRole('link', { name: 'Open timers' }).click();
				await expect(page).toHaveURL(url('/utils/timer'));
				await expect(alert).toHaveCount(0);
				await expect(timer.getByRole('timer')).toHaveText('Done');
				await timer.getByRole('button', { name: 'Stop' }).click();
				await expect(timer).toHaveCount(0);
			});

			test('timers survive a reload and a sleeping tab', async ({ page }) => {
				await page.clock.install();
				await gotoHydrated(page, url('/utils/timer'));
				await startTimer(page, 'Bread', '10');
				await startTimer(page, '', '1');
				await expect(page.getByTestId('timer')).toHaveText([/Bread/, /1:00 timer/]);
				// No ticks while the phone sleeps, but the wall clock moves on.
				await page.clock.pauseAt(Date.now() + 1000);
				await page.clock.setSystemTime(Date.now() + 4 * 60_000);
				await page.reload();
				await page.clock.resume();
				await expect(page.getByTestId('timer').first().getByRole('timer')).toHaveText(/^5:5\d$/);
				await expect(page.getByTestId('timer').nth(1).getByRole('timer')).toHaveText('Done');
			});

			test('a timer needs minutes', async ({ page }) => {
				await gotoHydrated(page, url('/utils/timer'));
				await startTimer(page, 'Nothing', '0');
				await expect(page.getByText('Enter minutes between 1 and 10080.')).toBeVisible();
				await expect(page.getByLabel('Minutes')).toHaveAttribute('aria-invalid', 'true');
				await expect(page.getByTestId('timer')).toHaveCount(0);
			});
		});

		test.describe('updates', () => {
			test.use({ serviceWorkers: 'allow' });
			let deployment: Deployment;
			const url = (path: string) => deployment.url(path);
			test.beforeEach(async () => {
				deployment = await serveDeployment(build, { base });
			});
			test.afterEach(() => deployment.close());

			test('an update waits while a timer runs', async ({ page }) => {
				await gotoHydrated(page, url('/utils/timer'));
				await waitForServiceWorker(page);
				await deployment.deployNewVersion('next');
				const banner = page.getByTestId('update-banner');
				await expect(async () => {
					await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
					await expect(banner).toContainText('A new version is available.', { timeout: 1000 });
				}).toPass({ timeout: 15_000 });
				await startTimer(page, 'Rice', '15');
				await expect(banner).toContainText('Finish your running timers first.');
				await page.getByTestId('timer').getByRole('button', { name: 'Pause' }).click();
				await expect(banner.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
			});
		});
	});
}
