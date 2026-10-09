<script lang="ts">
	/**
	 * Offers a waiting version (Update) or, after another tab updated, a reload (Reload). While
	 * something a reload would interrupt is running, it says what and asks before going ahead.
	 * Render it once, inside `<App>`; to change how it looks, render your own from `app.update`.
	 */
	import { useApp } from '@xcwds/sveltekit';
	import type { UpdateState } from './client.js';

	type Text = {
		available: string;
		reloadNeeded: string;
		update: string;
		reload: string;
		anyway: string;
		dismiss: string;
		/** `{busy}` is replaced by what is busy. */
		finishFirst: string;
		/** `{busy}` is replaced by what is busy, `{action}` by Update or Reload. */
		confirm: string;
	};
	const defaults: Text = {
		available: 'A new version is available.',
		reloadNeeded: 'Updated in another tab. Reload to finish updating.',
		update: 'Update',
		reload: 'Reload',
		anyway: ' anyway',
		dismiss: 'Dismiss',
		finishFirst: 'Finish your {busy} first.',
		confirm: 'Reloading now will interrupt your {busy}. {action} anyway?'
	};
	let { text = {} }: { text?: Partial<Text> } = $props();
	const t = $derived({ ...defaults, ...text });

	const update = useApp().update;
	let current = $state<UpdateState>({ available: false, reloadNeeded: false, justUpdated: false });
	$effect(() => update?.subscribe((value) => (current = value)));

	type Kind = 'update' | 'reload';
	const kind = $derived<Kind | null>(
		current.reloadNeeded ? 'reload' : current.available ? 'update' : null
	);
	/** Dismissing the "new version" banner doesn't hide a later "reload" one. */
	let dismissed = $state<Kind | null>(null);
	let busy = $state<string[]>([]);
	const busyText = $derived(busy.join(' and '));

	// `onBeforeReload` hooks have no change events: ask again while the banner shows.
	$effect(() => {
		if (!kind || !update) return;
		let live = true;
		const refresh = async () => {
			const reasons = await update.busyReasons();
			if (live) busy = reasons;
		};
		void refresh();
		const timer = setInterval(refresh, 1000);
		return () => {
			live = false;
			clearInterval(timer);
		};
	});

	async function act() {
		if (!update || !kind) return;
		const reasons = await update.busyReasons();
		busy = reasons;
		const action = kind === 'reload' ? t.reload : t.update;
		if (
			reasons.length &&
			update.askBeforeReload &&
			!confirm(t.confirm.replace('{busy}', reasons.join(' and ')).replace('{action}', action))
		)
			return;
		if (kind === 'reload') update.reload();
		else update.apply();
	}
</script>

<div role="status">
	{#if kind && kind !== dismissed}
		<div class="xcwds-update" data-testid="update-banner">
			<p>
				{kind === 'reload' ? t.reloadNeeded : t.available}
				{#if busy.length}
					<span>{t.finishFirst.replace('{busy}', busyText)}</span>
				{/if}
			</p>
			<button type="button" class="action" class:busy={busy.length > 0} onclick={act}>
				{kind === 'reload' ? t.reload : t.update}{busy.length ? t.anyway : ''}
			</button>
			<button
				type="button"
				class="dismiss"
				aria-label={t.dismiss}
				onclick={() => (dismissed = kind)}
			>
				✕
			</button>
		</div>
	{/if}
</div>

<style>
	.xcwds-update {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 28rem;
		padding: 0.5rem 0.5rem 0.5rem 1rem;
		border-radius: 1rem;
		background: var(--xcwds-update-bg, #111827);
		color: var(--xcwds-update-fg, #fff);
		font-size: 0.875rem;
	}
	p {
		flex: 1;
		margin: 0;
	}
	span {
		display: block;
		opacity: 0.8;
	}
	button {
		min-width: 44px;
		min-height: 44px;
		border: 0;
		border-radius: 0.5rem;
		font: inherit;
		cursor: pointer;
	}
	.action {
		padding: 0 0.75rem;
		background: var(--xcwds-update-accent, #3b82f6);
		color: #fff;
		font-weight: 600;
	}
	.action.busy {
		background: rgb(255 255 255 / 0.15);
	}
	.dismiss {
		background: transparent;
		color: inherit;
		opacity: 0.7;
	}
</style>
