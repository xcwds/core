import { data } from 'virtual:xcwds/client';

/**
 * The app's name and tagline from `brand` in xcwds.config, for page chrome. Read lazily: plugin
 * client entries import components that import this package, while `virtual:xcwds/client` (which
 * imports those entries) is still loading.
 */
export const brand: { readonly name: string; readonly tagline: string } = Object.freeze({
	get name() {
		return data.name;
	},
	get tagline() {
		return data.tagline;
	}
});
