<script lang="ts">
	/**
	 * Finished timers, as alerts with +1 min and Stop, on pages that don't already show every
	 * timer (the alarm rings everywhere). Put it in the shell's notification stack.
	 */
	import { useApp } from '@xcwds/sveltekit';
	import type { TimerItem } from './client.js';
	import { MINUTE } from './timer.js';
	import { href } from './paths.js';

	const timers = useApp().timers;
	let ringing = $state<readonly TimerItem[]>([]);
	$effect(() =>
		timers?.subscribe((list) => {
			const next = timers.shown() ? [] : list.filter((i) => timers.ringing(i));
			// Ticks come several times a second; only re-render when the set changes.
			if (next.length !== ringing.length || next.some((i, n) => i !== ringing[n])) ringing = next;
		})
	);

	const action = 'min-h-11 rounded-xl px-3 font-semibold';
</script>

{#each ringing as item (item.id)}
	<div
		role="alert"
		data-testid="timer-alert"
		class="flex w-full max-w-md items-center gap-2 rounded-2xl bg-amber-300 py-1 pr-1 pl-4 text-sm text-gray-900 shadow-lg dark:bg-amber-700 dark:text-white"
	>
		<p class="min-w-0 flex-1 truncate">⏲️ {item.label} is done</p>
		<button type="button" class="{action} bg-white/50" onclick={() => timers?.add(item.id, MINUTE)}>
			+1 min
		</button>
		<button type="button" class="{action} bg-white/50" onclick={() => timers?.remove(item.id)}>
			Stop
		</button>
		{#if timers?.page}
			<a
				href={href(timers.page)}
				class="{action} flex items-center underline"
				aria-label="Open timers">Open</a
			>
		{/if}
	</div>
{/each}
