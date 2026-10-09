import hello from '@xcwds-example/plugin-hello';
import { defineConfig } from '@xcwds/core';
import offline from '@xcwds/plugin-offline';
import theme from '@xcwds/plugin-theme';
import update from '@xcwds/plugin-update';

export default defineConfig({
	brand: {
		name: 'Minimal',
		tagline: 'The smallest @xcwds app.',
		icon: 'icon.svg',
		themeColor: { light: '#dbeafe', dark: '#030712' }
	},
	plugins: [hello({ greeting: 'hi' }), offline(), update(), theme()]
});
