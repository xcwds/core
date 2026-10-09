<script lang="ts">
	/**
	 * The body of the error page: render it from `src/routes/+error.svelte`. The shell's header
	 * already says what went wrong and leads home; this explains it and links to each section.
	 */
	import { page } from '$app/state';
	import { useApp } from '@xcwds/sveltekit';
	import { href } from './paths.js';

	type Text = { notFound: string; failed: string; retry: string };
	const defaults: Text = {
		notFound: "There's nothing at this address. The link may be mistyped, or the page has moved.",
		failed: "This page couldn't load.",
		retry: 'Try again'
	};
	let { text = {} }: { text?: Partial<Text> } = $props();
	const t = $derived({ ...defaults, ...text });

	const sections = useApp().shell?.sections ?? [{ path: '/', label: 'Home', emoji: '🏠' }];
	const notFound = $derived(page.status === 404);
	// SvelteKit's message for unexpected errors says nothing useful; show only messages a page set.
	const detail = $derived(page.error?.message === 'Internal Error' ? '' : page.error?.message);
</script>

<main class="page-narrow flex flex-col gap-6 pt-2 pb-4 sm:pb-8" data-testid="error-page">
	<div class="flex flex-col gap-2 rounded-2xl bg-(--xcwds-shell-card) p-4">
		{#if notFound}
			<p data-testid="error">{t.notFound}</p>
		{:else}
			<p data-testid="error">{t.failed}{detail ? ` (${detail})` : ''}</p>
			<button
				type="button"
				class="rounded-xl bg-(--xcwds-shell-accent) px-3 py-2 font-semibold text-white"
				onclick={() => location.reload()}
			>
				{t.retry}
			</button>
		{/if}
	</div>

	<nav aria-label="Go to">
		<ul class="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
			{#each sections as section (section.path)}
				<li>
					<a
						href={href(section.path)}
						class="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl bg-(--xcwds-shell-card) py-3 font-medium hover:bg-(--xcwds-shell-hover-bg)"
					>
						{#if section.emoji}<span aria-hidden="true" class="text-2xl">{section.emoji}</span>{/if}
						{section.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</main>
