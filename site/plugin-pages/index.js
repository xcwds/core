// A build-only plugin: the docs site's pages come from Markdown files, so they can't each call
// `app.route()` from a plugin of their own. xcwds.config.ts lists them and passes the list here.
import { definePlugin, descriptor } from '@xcwds/core';

/** @type {(options: import('./index.js').PagesOptions) => import('@xcwds/core').Descriptor<import('./index.js').PagesOptions>} */
export default descriptor('@xcwds-site/plugin-pages');

export const build = definePlugin(
	(app, /** @type {import('./index.js').PagesOptions} */ options) => {
		for (const page of options.pages) app.route({ ...page, width: 'wide' });
	},
	{ name: '@xcwds-site/plugin-pages', network: false }
);
