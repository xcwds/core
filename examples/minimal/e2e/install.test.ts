// @xcwds/plugin-install (#15) in examples/minimal, ported from xcwds.github.io's app-extras
// install tests: the button appears when the browser offers a prompt, iPhone gets steps, and
// the installed app offers nothing.
import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, serveStatic, type StaticServer } from '@xcwds/testing/playwright';
import { fileURLToPath } from 'node:url';

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const card = (page: Page) => page.getByTestId('install');

/** Chromium's beforeinstallprompt, as the browser would fire it; records `prompt()` calls. */
function firePrompt(page: Page) {
	return page.evaluate(() => {
		const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
			prompt: async () => void ((window as unknown as { prompted: number }).prompted = 1),
			userChoice: Promise.resolve({ outcome: 'accepted' })
		});
		window.dispatchEvent(event);
	});
}

let server: StaticServer;
const url = (path: string) => server.url(path);
test.beforeAll(async () => {
	server = await serveStatic(fileURLToPath(new URL('../build', import.meta.url)));
});
test.afterAll(() => server.close());

test('the Install button appears when the browser offers a prompt', async ({ page }) => {
	await gotoHydrated(page, url('/'));
	await expect(card(page)).toContainText('Install app');
	await expect(card(page).getByRole('button')).toHaveCount(0);
	await firePrompt(page);
	await card(page).getByRole('button', { name: 'Install app' }).click();
	expect(await page.evaluate(() => (window as unknown as { prompted?: number }).prompted)).toBe(1);
	await expect(card(page)).toHaveCount(0);
});

test('a prompt that fires before the app starts is kept', async ({ page }) => {
	// Fire it as soon as the head script has run, long before the app's modules load.
	await page.addInitScript(() => {
		document.addEventListener('readystatechange', () => {
			if (document.readyState !== 'interactive') return;
			const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
				prompt: async () => {},
				userChoice: Promise.resolve({ outcome: 'dismissed' })
			});
			window.dispatchEvent(event);
		});
	});
	await gotoHydrated(page, url('/'));
	await expect(card(page).getByRole('button', { name: 'Install app' })).toBeVisible();
});

test('the installed app offers nothing', async ({ page }) => {
	await page.addInitScript(() => {
		const real = window.matchMedia.bind(window);
		window.matchMedia = (query: string) => {
			const list = real(query);
			if (query === '(display-mode: standalone)')
				Object.defineProperty(list, 'matches', { value: true });
			return list;
		};
	});
	await gotoHydrated(page, url('/'));
	await expect(page.getByTestId('theme-picker')).toBeVisible();
	await firePrompt(page);
	await expect(card(page)).toHaveCount(0);
});

test.describe('on an iPhone', () => {
	test.use({ userAgent: IPHONE });

	test('explains Add to Home Screen', async ({ page }) => {
		await gotoHydrated(page, url('/'));
		await expect(card(page)).toContainText('Add to Home Screen');
		await expect(card(page).locator('strong', { hasText: 'Safari' })).toBeVisible();
	});
});
