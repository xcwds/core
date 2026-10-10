<script lang="ts">
	/** The tally page. An app shows it from a route file of its own. */
	import { persist, settings, useApp } from '@xcwds/sveltekit';
	import { add, type Tally as SavedTally } from './tally.js';
	import type {} from './client.js';

	// `app.tally` is optional: say what's missing rather than fail on `undefined`.
	const plugin = useApp().tally;
	if (!plugin)
		throw new Error('xcwds-plugin-tally: add tally() to the plugins in xcwds.config.ts.');
	let tally = $state<SavedTally | undefined>();
	// Loads the saved tally after mount, saves every change, and follows other tabs.
	persist(
		plugin.entry,
		() => tally,
		(v) => (tally = v),
		{ cleared: () => (tally = undefined) }
	);
	const step = $derived(settings.current.tallyStep);
</script>

<div class="tally">
	<p class="count" data-testid="tally">{tally?.count ?? 0}</p>
	<p class="since">
		{tally ? `Counting since ${new Date(tally.since).toLocaleDateString()}.` : 'Tap to count.'}
	</p>
	<div class="buttons">
		<button type="button" onclick={() => (tally = add(tally, step))}>+{step}</button>
		<button type="button" onclick={() => (tally = undefined)} disabled={!tally}>Reset</button>
	</div>
</div>

<style>
	/* Plain CSS with the shell's variables, so the app needs no Tailwind setup for it. */
	.tally {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}
	.count {
		font-size: 3rem;
		font-variant-numeric: tabular-nums;
	}
	.since {
		opacity: 0.7;
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
	}
	button {
		min-width: 5rem;
		border-radius: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--xcwds-shell-card);
	}
	button:disabled {
		opacity: 0.5;
	}
</style>
