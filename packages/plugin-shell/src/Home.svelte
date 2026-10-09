<script lang="ts">
	/**
	 * The Home page (`/`): the blocks plugins add with `app.shell.home.add()`, in order, or the
	 * app's name and tagline while there are none. Render it from `src/routes/+page.svelte`;
	 * `children` come after.
	 */
	import { brand, useApp } from '@xcwds/sveltekit';
	import type { Snippet } from 'svelte';
	import type { Slot } from './client.js';

	let { children }: { children?: Snippet } = $props();

	const shell = useApp().shell;
	let blocks = $state<readonly Slot[]>(shell?.home.list() ?? []);
	$effect(() => shell?.home.subscribe((list) => (blocks = list)));
</script>

<main class="page-wide flex flex-col gap-6 pt-2 pb-4 sm:pb-8" data-testid="home">
	{#each blocks as block, i (i)}
		<block.component {...block.props} />
	{:else}
		<section class="flex flex-col gap-1 py-6" data-testid="home-brand">
			<p class="text-2xl font-semibold">{brand.name}</p>
			{#if brand.tagline}<p class="text-(--xcwds-shell-muted)">{brand.tagline}</p>{/if}
		</section>
	{/each}
	{@render children?.()}
</main>
