import hello from '@xcwds-example/plugin-hello';
import { defineConfig } from '@xcwds/core';
import install from '@xcwds/plugin-install';
import offline from '@xcwds/plugin-offline';
import shell from '@xcwds/plugin-shell';
import theme from '@xcwds/plugin-theme';
import update from '@xcwds/plugin-update';

export default defineConfig({
	brand: {
		name: 'Minimal',
		tagline: 'The smallest @xcwds app.',
		icon: 'icon.svg',
		themeColor: { light: '#dbeafe', dark: '#030712' }
	},
	plugins: [
		shell({
			sections: [
				{ path: '/', label: 'Home', emoji: '🏠' },
				{ path: '/hello', label: 'Hello', emoji: '👋' }
			]
		}),
		hello({ greeting: 'hi' }),
		offline(),
		update(),
		theme(),
		install()
	]
});
