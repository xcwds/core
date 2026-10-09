<script lang="ts">
	// The share target (@xcwds/plugin-share): shows what another app shared.
	import type { Shared } from '@xcwds/plugin-share';
	import type {} from '@xcwds/plugin-share/client';
	import { useApp } from '@xcwds/sveltekit';
	import { onMount } from 'svelte';

	const app = useApp();
	let shared = $state<Shared | null>(null);
	onMount(() => app.shared?.listen((value) => (shared = value)));
</script>

<main class="page-narrow">
	{#if shared}
		<p data-testid="shared">{shared.joined}</p>
		{#if shared.title}<p data-testid="shared-title">{shared.title}</p>{/if}
	{:else}
		<p>Nothing shared yet.</p>
	{/if}
</main>
