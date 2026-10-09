<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import OfflineNotice from '@xcwds/plugin-offline/OfflineNotice.svelte';
	import UpdateBanner from '@xcwds/plugin-update/UpdateBanner.svelte';
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
	<aside class="notices">
		<UpdateBanner />
		<OfflineNotice />
	</aside>
</App>

<style>
	/* Tap targets of at least 44px (`auditTapTargets` in the e2e tests checks every page). */
	:global(button) {
		min-height: 44px;
		min-width: 44px;
	}
	.notices {
		position: fixed;
		inset: auto 1rem 1rem;
		display: grid;
		justify-items: center;
		gap: 0.5rem;
	}
</style>
