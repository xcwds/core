import { data } from 'virtual:xcwds/client';
import type { PrivacyInfo } from './data.js';

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

/**
 * What the app declares about its network use (#22): each plugin's `network` metadata and
 * `privacy.allowOrigins`. Read lazily, like `brand`.
 */
export const privacy: PrivacyInfo = Object.freeze({
	get plugins() {
		return data.privacy.plugins;
	},
	get allowOrigins() {
		return data.privacy.allowOrigins;
	}
});
