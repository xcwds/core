import pages from '@xcwds-site/plugin-pages';
import { defineConfig } from '@xcwds/core';
import install from '@xcwds/plugin-install';
import offline from '@xcwds/plugin-offline';
import settings from '@xcwds/plugin-settings';
import shell from '@xcwds/plugin-shell';
import theme from '@xcwds/plugin-theme';
import update from '@xcwds/plugin-update';
import tally from 'xcwds-plugin-tally';
import { pages as docs } from './src/lib/server/pages.js';

/** The tab bar on phones, and header links or a sidebar on wider screens. */
const sections = [
	{ path: '/', label: 'Home', emoji: '🏠' },
	{ path: '/docs', label: 'Docs', emoji: '📖' },
	{ path: '/reference', label: 'Reference', emoji: '📚' },
	{ path: '/settings', label: 'Settings', emoji: '⚙️' }
];

export default defineConfig({
	brand: {
		name: 'xcwds docs',
		shortName: 'xcwds',
		tagline: 'Make private, offline-first apps from a config file and plugins.',
		icon: 'icon.svg',
		themeColor: { light: '#ffffff', dark: '#0f172a' }
	},
	plugins: [
		shell({ sections }),
		pages({
			pages: [
				{ path: '/docs', title: 'Docs', emoji: '📖', parent: '/' },
				{ path: '/reference', title: 'Reference', emoji: '📚', parent: '/' },
				...docs().map(({ path, title, emoji, parent }) => ({ path, title, emoji, parent }))
			]
		}),
		// The plugin the guide builds, on its own tab-less page.
		tally({ step: 1 }),
		theme(),
		offline(),
		update(),
		install(),
		settings({
			source: 'https://github.com/xcwds/core',
			backupName: 'xcwds-docs-backup',
			sections: { tally: 'Tally' }
		})
	]
});
