<script lang="ts">
	/**
	 * The header's Share button, added by the plugin. It shows in the installed app only (a
	 * browser tab has its own Share), never on excluded paths, private pages or error pages, and shares the
	 * page's origin and path only.
	 */
	import { page } from '$app/state';
	import { appPath, brand, useApp } from '@xcwds/sveltekit';
	import { onMount } from 'svelte';
	import type {} from './client.js';
	import { shareData } from './share.js';

	const app = useApp();
	let installed = $state(false);
	onMount(() => {
		const display = matchMedia('(display-mode: standalone)');
		const check = () =>
			(installed =
				display.matches || (navigator as Navigator & { standalone?: unknown }).standalone === true);
		check();
		display.addEventListener('change', check);
		return () => display.removeEventListener('change', check);
	});

	const data = $derived.by(() => {
		if (!installed || page.error || !app.share) return null;
		const { pathname, origin } = page.url;
		const path = appPath(pathname);
		if (path === null) return null;
		// What's left of the pathname is the base path.
		const base = path === '/' ? pathname.replace(/\/$/, '') : pathname.slice(0, -path.length);
		const route = app.routes.get(path);
		return shareData(path, {
			origin,
			base,
			title: route?.title,
			private: route?.private,
			appName: brand.name,
			tagline: brand.tagline,
			exclude: app.share.exclude
		});
	});
</script>

{#if data}
	{@const target = data}
	<button
		type="button"
		aria-label="Share {target.title}"
		class="xcwds-share"
		onclick={() => app.share?.share(target)}
	>
		<svg
			viewBox="0 0 24 24"
			width="24"
			height="24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path
				d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
{/if}

<style>
	/* Plain CSS with the shell's colours, so apps need no extra Tailwind @source for it. */
	.xcwds-share {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		margin-right: -0.5rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--xcwds-shell-muted, currentColor);
		cursor: pointer;
	}
	.xcwds-share:hover {
		background: var(--xcwds-shell-hover-bg, rgb(0 0 0 / 0.05));
	}
	/* Beside the header links on wider screens, after them. */
	@media (width >= 48rem) {
		.xcwds-share {
			order: 99;
			margin-right: 0;
		}
	}
</style>
