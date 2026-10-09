import hello from '@xcwds-example/plugin-hello';
import { defineConfig } from '@xcwds/core';

export default defineConfig({
	brand: {
		name: 'Minimal',
		tagline: 'The smallest @xcwds app.',
		icon: 'icon.svg',
		themeColor: { light: '#dbeafe', dark: '#030712' }
	},
	plugins: [hello({ greeting: 'hi' })]
});
