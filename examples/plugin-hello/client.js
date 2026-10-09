// The page entry. Imported while SvelteKit prerenders too, so nothing here touches `window` or
// `document` until a hook runs in the browser.
import { definePlugin } from '@xcwds/core';

export default definePlugin(
	(app, /** @type {import('./index.js').HelloOptions} */ options) => {
		const greeting = options.greeting ?? 'hello';
		app.settings.field('greeting', {
			default: greeting,
			parse: (v) => (typeof v === 'string' && v.length <= 40 ? v : undefined),
			label: 'Greeting',
			// Applies the saved greeting before first paint.
			prePaint: "if(typeof v==='string')root.dataset.greeting=v;"
		});
		app.decorate('hello', {
			count: app.storage.entry('count', {
				label: 'Hello count',
				parse: (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)
			})
		});
		app.addHook('onBoot', () => {
			document.documentElement.dataset.hello = greeting;
		});
		// Navigation guards for the e2e tests: a redirect, a cancel, and two async ones.
		const later = (/** @type {string | undefined} */ value) =>
			new Promise((resolve) => setTimeout(() => resolve(value), 50));
		app.addHook('onNavigate', (to) => {
			if (to.path === '/moved') return '/hello';
			if (to.path === '/blocked') return false;
			if (to.path === '/slow') return later('/hello');
			if (to.path === '/hello' && to.url?.searchParams.has('wait')) return later(undefined);
			return undefined;
		});
		// Paths reach hooks without the base path.
		app.addHook('afterNavigate', (to) => {
			document.documentElement.dataset.path = to.path;
		});
	},
	{ name: '@xcwds-example/plugin-hello', encapsulate: false }
);
