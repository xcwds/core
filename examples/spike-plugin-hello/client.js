// The page entry. Imported during prerender too, so nothing here touches `window` or
// `document` until a hook runs in the browser.
export default {
	/** @param {{ greeting: string }} options */
	onBoot(options) {
		document.documentElement.dataset.hello = options.greeting;
	}
};
