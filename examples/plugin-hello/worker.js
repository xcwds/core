// The service-worker entry: an `onFetch` hook that answers one URL (decision 3).
import { definePlugin } from '@xcwds/core';

export default definePlugin(
	(app, /** @type {import('./index.js').HelloOptions} */ options) => {
		app.addHook('onFetch', (_request, url) => {
			if (!url.pathname.endsWith('/__xcwds/hello')) return undefined;
			return new Response(`${options.greeting ?? 'hello'} from the worker`, {
				headers: { 'content-type': 'text/plain' }
			});
		});
	},
	{ name: '@xcwds-example/plugin-hello' }
);
