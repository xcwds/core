// The build entry. Calling the plugin in xcwds.config.js returns a plain, serialisable
// descriptor (decision 1 in docs/rfc/0001-architecture.md); the build turns descriptors into
// imports of `./client` and `./worker`.

/** @param {{ greeting?: string }} [options] */
export default function hello(options = {}) {
	return { name: '@xcwds-spike/plugin-hello', options: { greeting: options.greeting ?? 'hello' } };
}

/** Build hooks. `onHead` returns plain ES5 that runs before first paint (decision 4). */
export const build = {
	/** @param {{ greeting: string }} options */
	onHead(options) {
		return `document.documentElement.dataset.prepaint=${JSON.stringify(options.greeting)};`;
	}
};
