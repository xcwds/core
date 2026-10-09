// RFC 0001 spikes (docs/rfc/0001-architecture.md): each test proves one decision on a real
// static build, served the way GitHub Pages serves it.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server';

const buildDir = fileURLToPath(new URL('../build', import.meta.url));
let server: Awaited<ReturnType<typeof serveStatic>>;

test.beforeAll(async () => {
	server = await serveStatic(buildDir);
});
test.afterAll(() => server.close());

test('1: a client plugin from the config runs in the page', async ({ page }) => {
	await page.goto(`${server.origin}/`);
	await expect(page.locator('html')).toHaveAttribute('data-hello', 'hi');
});

test('2: a thin route file renders a plugin page, prerendered', async ({ page }) => {
	const response = await page.request.get(`${server.origin}/hello`);
	expect(await response.text()).toContain('hi from a plugin');
	await page.goto(`${server.origin}/hello`);
	await expect(page.getByTestId('plugin-page')).toHaveText("hi from a plugin's page component");
});

test('4: the pre-paint script runs before first paint under a hash CSP', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	for (const path of ['/', '/hello', '/no-such-page']) {
		const html = await (await page.request.get(`${server.origin}${path}`)).text();
		expect(html, path).toContain('http-equiv="content-security-policy"');
		expect(html, path).not.toContain('%xcwds.head%');
		// The attribute is set by the inline script, so it exists before any module loads.
		await page.route(/\.js$/, (route) => route.abort());
		await page.goto(`${server.origin}${path}`);
		await expect(page.locator('html'), path).toHaveAttribute('data-prepaint', 'hi');
		await page.unrouteAll();
	}
	expect(errors.filter((e) => e.includes('Content Security Policy'))).toEqual([]);
});

test.describe('with the service worker', () => {
	test.use({ serviceWorkers: 'allow' });

	test('3: a worker plugin answers a fetch', async ({ page }) => {
		await page.goto(`${server.origin}/`);
		await page.evaluate(() => navigator.serviceWorker.ready);
		await page.reload();
		const text = await page.evaluate(() => fetch('/__xcwds/hello').then((r) => r.text()));
		expect(text).toBe('hi from the worker');
	});
});
