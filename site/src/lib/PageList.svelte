<script lang="ts">
	/** An index of pages: Docs, Reference and the start of Home. */
	import { href } from './href.js';

	type Item = { path: string; title: string; emoji: string; blurb: string };
	let { pages }: { pages: Item[] } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- href() resolves paths from data -->
<ul class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
	{#each pages as page (page.path)}
		<li class="flex">
			<a
				href={href(page.path)}
				class="flex flex-1 items-start gap-3 rounded-xl bg-(--xcwds-shell-card) px-4 py-3 hover:bg-(--xcwds-shell-hover-bg)"
			>
				<span aria-hidden="true" class="text-2xl">{page.emoji}</span>
				<span class="flex flex-col">
					<span class="font-medium">{page.title}</span>
					<span class="text-sm text-(--xcwds-shell-muted)">{page.blurb}</span>
				</span>
			</a>
		</li>
	{/each}
</ul>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
