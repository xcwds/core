<script lang="ts">
	/**
	 * Says so while the browser is offline (everything precached keeps working). Render it once,
	 * inside `<App>`, where notices stack (e.g. above a bottom tab bar).
	 */
	import { useApp } from '@xcwds/sveltekit';
	import type {} from './client.js';

	let { label = 'Offline · everything still works' }: { label?: string } = $props();

	const network = useApp().network;
	let online = $state(true);
	$effect(() => network?.subscribe((value) => (online = value)));
</script>

<div class="xcwds-offline" role="status">
	{#if !online}
		<p data-testid="offline-notice">{label}</p>
	{/if}
</div>

<style>
	.xcwds-offline p {
		margin: 0;
		padding: 0.375rem 1rem;
		border-radius: 999px;
		background: var(--xcwds-offline-bg, #fde68a);
		color: var(--xcwds-offline-fg, #451a03);
		font-size: 0.875rem;
		font-weight: 500;
	}
</style>
