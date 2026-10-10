import type { Page } from '@playwright/test';

/**
 * Navigates and waits for the app to hydrate and boot (`<App>` then sets `data-hydrated` on
 * `<html>`), so typed input or clicks aren't lost or doubled. `path` is anything `page.goto` takes.
 */
export async function gotoHydrated(
	page: Page,
	path: string,
	{ selector = 'html[data-hydrated]', timeout }: { selector?: string; timeout?: number } = {}
): Promise<void> {
	await page.goto(path);
	await page.locator(selector).waitFor({ state: 'attached', timeout });
}

/**
 * Every visible control smaller than `min` px (44 by default) in either direction, as
 * `"name (w×h)"`: expect it to be empty. Inline text links are exempt (WCAG 2.5.8), and a
 * checkbox or radio button counts its label's hit area. Ported from xcwds.github.io's app-extras test.
 */
export async function auditTapTargets(page: Page, { min = 44 }: { min?: number } = {}) {
	return page.evaluate((min) => {
		return [...document.querySelectorAll('a, button, input, select, textarea, summary')]
			.filter((el) => (el as HTMLElement).offsetParent !== null)
			.filter((el) => getComputedStyle(el).display !== 'inline')
			.map((el) => {
				const type = (el as HTMLInputElement).type;
				const target = type === 'checkbox' || type === 'radio' ? (el.closest('label') ?? el) : el;
				const { width, height } = target.getBoundingClientRect();
				const name = el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
				return { name: name.slice(0, 40), width: Math.round(width), height: Math.round(height) };
			})
			.filter(({ width, height }) => width < min || height < min)
			.map(({ name, width, height }) => `${name} (${width}×${height})`);
	}, min);
}

/** Waits until a service worker controls the page; resolves to its registration's scope. */
export function waitForServiceWorker(page: Page): Promise<string> {
	return page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller)
			await new Promise((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
			);
		return registration.scope;
	});
}

/**
 * Asks the browser to check for a new service worker now, and waits for it to finish
 * installing. Resolves to `'waiting'` (installed, waiting for the old one to go), `'active'`
 * (it took over straight away), or `'none'` (nothing new, or it failed to install).
 */
export function updateServiceWorker(page: Page): Promise<'waiting' | 'active' | 'none'> {
	return page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		await registration.update();
		const worker = registration.installing ?? registration.waiting;
		if (!worker) return 'none';
		const settled = ['installed', 'activating', 'activated', 'redundant'];
		if (!settled.includes(worker.state))
			await new Promise<void>((resolve) => {
				const check = () => {
					if (settled.includes(worker.state)) {
						worker.removeEventListener('statechange', check);
						resolve();
					}
				};
				worker.addEventListener('statechange', check);
			});
		if (registration.waiting === worker) return 'waiting';
		return worker.state === 'redundant' ? 'none' : 'active';
	});
}
