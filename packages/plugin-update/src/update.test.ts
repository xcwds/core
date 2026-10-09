import { definePlugin } from '@xcwds/core';
import { buildTestApp, buildTestWorker, type Importer } from '@xcwds/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import client, { JUST_UPDATED } from './client.js';
import update from './index.js';
import { resolveOptions } from './options.js';
import worker from './worker.js';

afterEach(() => void vi.unstubAllGlobals());

const importer: Importer = async (id) => {
	const entries: Record<string, () => Promise<Record<string, unknown>>> = {
		'@xcwds/plugin-update': () => import('./index.js'),
		'@xcwds/plugin-update/client': () => import('./client.js'),
		'@xcwds/plugin-update/worker': () => import('./worker.js')
	};
	const load = entries[id];
	if (!load) throw Object.assign(new Error(id), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
	return load();
};

class FakeWorker extends EventTarget {
	state: ServiceWorkerState = 'installing';
	readonly messages: unknown[] = [];
	postMessage(message: unknown) {
		this.messages.push(message);
	}
	to(state: ServiceWorkerState) {
		this.state = state;
		this.dispatchEvent(new Event('statechange'));
	}
}

class FakeRegistration extends EventTarget {
	installing: FakeWorker | null = null;
	waiting: FakeWorker | null = null;
	active: FakeWorker | null = null;
	updates = 0;
	async update() {
		this.updates++;
	}
}

/** The browser around the app: a service worker container, a tab, session storage. */
function fakeBrowser({ controlled = true, hidden = false } = {}) {
	const registration = new FakeRegistration();
	const container = Object.assign(new EventTarget(), {
		controller: null as FakeWorker | null,
		ready: Promise.resolve(registration)
	});
	if (controlled) container.controller = registration.active = new FakeWorker();
	const session = new Map<string, string>();
	const tab = {
		visibilityState: hidden ? 'hidden' : 'visible',
		reload: vi.fn(),
		window: new EventTarget()
	};
	vi.stubGlobal('navigator', { serviceWorker: container, onLine: true });
	vi.stubGlobal('window', tab.window);
	vi.stubGlobal('document', {
		get visibilityState() {
			return tab.visibilityState;
		}
	});
	vi.stubGlobal('location', { reload: tab.reload });
	vi.stubGlobal('sessionStorage', {
		getItem: (key: string) => session.get(key) ?? null,
		setItem: (key: string, value: string) => void session.set(key, value),
		removeItem: (key: string) => void session.delete(key)
	});
	return {
		registration,
		container,
		session,
		tab,
		/** A new version installs and waits. */
		deploy() {
			const next = new FakeWorker();
			registration.installing = next;
			registration.dispatchEvent(new Event('updatefound'));
			registration.installing = null;
			registration.waiting = next;
			next.to('installed');
			return next;
		},
		/** `worker` takes over (after SKIP_WAITING, from this tab or another). */
		takeOver(worker: FakeWorker) {
			registration.waiting = null;
			registration.active = worker;
			worker.to('activated');
			container.controller = worker;
			container.dispatchEvent(new Event('controllerchange'));
		}
	};
}

/** Lets the app's promise callbacks (e.g. `serviceWorker.ready`) run. */
const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('options', () => {
	it('fills in defaults and refuses mistakes', () => {
		expect(resolveOptions()).toEqual({ checkEveryMs: 3_600_000, askBeforeReload: true });
		expect(resolveOptions({ checkEveryMs: 0, askBeforeReload: false })).toEqual({
			checkEveryMs: 0,
			askBeforeReload: false
		});
		expect(() => resolveOptions({ checkEveryMs: -1 })).toThrow(/`checkEveryMs`/);
		expect(() => resolveOptions({ checkEveryMs: 1.5 })).toThrow(/`checkEveryMs`/);
		expect(() => resolveOptions({ checkEveryMs: 2 ** 31 })).toThrow(/`checkEveryMs`/);
		expect(() => resolveOptions({ askBeforeReload: 'no' })).toThrow(/`askBeforeReload`/);
		expect(() => resolveOptions({ banner: 'mine' })).toThrow(/unknown option `banner`/);
	});
});

describe('the page', () => {
	it('offers a waiting version, and updates when asked', async () => {
		const browser = fakeBrowser();
		const app = await buildTestApp({ plugins: [update()] }, { import: importer });
		await tick();
		expect(app.update!.state).toEqual({
			available: false,
			reloadNeeded: false,
			justUpdated: false
		});
		const next = browser.deploy();
		expect(app.update!.state.available).toBe(true);
		app.update!.apply();
		expect(next.messages).toEqual([{ type: 'SKIP_WAITING' }]);
		expect(browser.tab.reload).not.toHaveBeenCalled();
		expect(browser.session.has(JUST_UPDATED)).toBe(false);
		browser.takeOver(next);
		expect(browser.tab.reload).toHaveBeenCalledOnce();
		expect(browser.session.has(JUST_UPDATED)).toBe(true);

		// The reloaded page knows it was just updated, once.
		await app.close();
		const reloaded = await buildTestApp({ plugins: [[client, {}]] });
		expect(reloaded.update!.state.justUpdated).toBe(true);
		expect(browser.session.has(JUST_UPDATED)).toBe(false);
	});

	it('offers a version that was already waiting or installing when the page opened', async () => {
		const browser = fakeBrowser();
		const waiting = (browser.registration.waiting = new FakeWorker());
		waiting.state = 'installed';
		const app = await buildTestApp({ plugins: [[client, {}]] });
		await tick();
		expect(app.update!.state.available).toBe(true);
		// Replaced by a newer one before the user tapped Update.
		waiting.to('redundant');
		expect(app.update!.state.available).toBe(false);
		const installing = (browser.registration.installing = new FakeWorker());
		await app.close();
		const again = await buildTestApp({ plugins: [[client, {}]] });
		await tick();
		installing.to('installed');
		expect(again.update!.state.available).toBe(true);
	});

	it("doesn't treat the first install as an update", async () => {
		const browser = fakeBrowser({ controlled: false });
		const app = await buildTestApp({ plugins: [[client, {}]] });
		await tick();
		const first = browser.deploy();
		expect(app.update!.state.available).toBe(false);
		browser.takeOver(first);
		expect(app.update!.state).toMatchObject({ available: false, reloadNeeded: false });
		expect(browser.tab.reload).not.toHaveBeenCalled();
	});

	it('lists what a reload would interrupt: markBusy and onBeforeReload', async () => {
		fakeBrowser();
		let saving = false;
		const app = await buildTestApp({
			plugins: [
				[client, {}],
				definePlugin((a) => void a.addHook('onBeforeReload', () => (saving ? 'save' : undefined)))
			]
		});
		let running = true;
		const unmark = app.update!.markBusy('timer', () => running);
		expect(await app.update!.busyReasons()).toEqual(['timer']);
		saving = true;
		running = false;
		expect(await app.update!.busyReasons()).toEqual(['save']);
		running = true;
		unmark();
		expect(await app.update!.busyReasons()).toEqual(['save']);
	});

	it('when another tab updates: asks visible or busy tabs to reload, reloads hidden idle ones', async () => {
		const browser = fakeBrowser();
		const app = await buildTestApp({ plugins: [[client, {}]] });
		await tick();
		browser.takeOver(browser.deploy());
		await tick();
		expect(app.update!.state).toMatchObject({ available: false, reloadNeeded: true });
		expect(browser.tab.reload).not.toHaveBeenCalled();
		app.update!.reload();
		expect(browser.tab.reload).toHaveBeenCalledOnce();
		await app.close();

		const hidden = fakeBrowser({ hidden: true });
		const idle = await buildTestApp({ plugins: [[client, {}]] });
		await tick();
		hidden.takeOver(hidden.deploy());
		await tick();
		expect(hidden.tab.reload).toHaveBeenCalledOnce();
		expect(hidden.session.has(JUST_UPDATED)).toBe(true);
		await idle.close();

		const busy = fakeBrowser({ hidden: true });
		const working = await buildTestApp({ plugins: [[client, {}]] });
		working.update!.markBusy('timer', () => true);
		await tick();
		busy.takeOver(busy.deploy());
		await tick();
		expect(busy.tab.reload).not.toHaveBeenCalled();
		expect(working.update!.state.reloadNeeded).toBe(true);
	});

	it('checks for updates on launch, every checkEveryMs, when shown and when back online', async () => {
		const browser = fakeBrowser();
		const app = await buildTestApp(
			{ plugins: [[client, { checkEveryMs: 60_000 }]] },
			{ now: new Date('2026-05-01T08:00:00Z') }
		);
		await app.clock!.flush();
		expect(browser.registration.updates).toBe(1);
		await app.clock!.advance(60_000);
		expect(browser.registration.updates).toBe(2);
		await app.hooks.run('onVisible', []);
		browser.tab.window.dispatchEvent(new Event('online'));
		expect(browser.registration.updates).toBe(4);
		await app.close();
		browser.tab.window.dispatchEvent(new Event('online'));
		expect(browser.registration.updates).toBe(4);
	});

	it('stays quiet without service workers', async () => {
		vi.stubGlobal('navigator', {});
		vi.stubGlobal('sessionStorage', undefined);
		const app = await buildTestApp({ plugins: [[client, {}]] });
		expect(app.update!.state).toEqual({
			available: false,
			reloadNeeded: false,
			justUpdated: false
		});
		app.update!.apply();
	});
});

describe('the worker', () => {
	it('takes over only when a page sends SKIP_WAITING', async () => {
		const sw = await buildTestWorker({ plugins: [[worker, {}]] }, { logLevel: 'silent' });
		await sw.install();
		expect(sw.skippedWaiting).toBe(false);
		await sw.message({ type: 'something else' });
		await sw.message(null);
		expect(sw.skippedWaiting).toBe(false);
		await sw.message({ type: 'SKIP_WAITING' });
		expect(sw.skippedWaiting).toBe(true);
	});
});
