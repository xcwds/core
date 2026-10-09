// The service-worker entry: an `onFetch` hook that answers one URL (decision 3).
export default {
	/**
	 * @param {URL} url
	 * @param {{ greeting: string }} options
	 */
	onFetch(url, options) {
		if (!url.pathname.endsWith('/__xcwds/hello')) return undefined;
		return new Response(`${options.greeting} from the worker`, {
			headers: { 'content-type': 'text/plain' }
		});
	}
};
