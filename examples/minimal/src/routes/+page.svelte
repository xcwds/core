<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { onMount } from 'svelte';

	// Links to paths only the example plugin's onNavigate guard handles. They exist only in the
	// browser, so prerendering (which runs no guards) doesn't crawl them.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const guarded = [
		'/moved',
		'/blocked',
		'/loop',
		'/slow',
		'/hello?wait',
		'/hello?now',
		'/hello?once',
		'/hello?bounce'
	];
</script>

<p><a href={resolve('/hello')}>A plugin's page</a></p>
{#if mounted}
	<ul>
		{#each guarded as path (path)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<li><a href={`${base}${path}`}>Guarded {path}</a></li>
		{/each}
	</ul>
{/if}
