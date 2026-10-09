<script>
	// The root of an @xcwds app: wrap the root layout's content in it (see ./shell.ts).
	import { startApp } from './shell.js';

	/** @type {{ children: import('svelte').Snippet }} */
	let { children } = $props();

	startApp();
</script>

{@render children()}
