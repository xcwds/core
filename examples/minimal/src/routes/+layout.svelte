<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { App, routeInfo } from '@xcwds/sveltekit';

	let { children } = $props();
	const title = $derived(routeInfo(page.url.pathname)?.title ?? 'Minimal');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<App>
	<header>
		<h1>{title}</h1>
		<a href={resolve('/')}>Home</a>
	</header>
	<main>{@render children()}</main>
</App>

<style>
	/* Tap targets of at least 44px (`auditTapTargets` in the e2e tests checks every page). */
	:global(button) {
		min-height: 44px;
		min-width: 44px;
	}
</style>
