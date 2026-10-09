import { data } from 'virtual:xcwds/client';

/** The app's name and tagline from `brand` in xcwds.config, for page chrome. */
export const brand: { readonly name: string; readonly tagline: string } = Object.freeze({
	name: data.name,
	tagline: data.tagline
});
