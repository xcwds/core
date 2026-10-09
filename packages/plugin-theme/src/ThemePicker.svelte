<script lang="ts">
	/**
	 * System, Light and Dark as one radio group, saved to the `theme` setting. The settings
	 * plugin shows it under Appearance; apps can place it anywhere inside `<App>`.
	 */
	import { settings } from '@xcwds/sveltekit';
	import type {} from './client.js';
	import type { Theme } from './options.js';

	let {
		legend = 'Theme',
		labels = {}
	}: { legend?: string; labels?: Partial<Record<Theme, string>> } = $props();
	const names = $derived({ system: 'System', light: 'Light', dark: 'Dark', ...labels });
	const themes: Theme[] = ['system', 'light', 'dark'];
	// Its own radio group, so two pickers on one page don't uncheck each other.
	const uid = $props.id();
	const group = `xcwds-theme-${uid}`;
</script>

<fieldset class="xcwds-theme" data-testid="theme-picker">
	<legend>{legend}</legend>
	{#each themes as theme (theme)}
		<label>
			<input
				type="radio"
				name={group}
				value={theme}
				checked={settings.current.theme === theme}
				disabled={!settings.ready}
				onchange={() => settings.set({ theme })}
			/>
			{names[theme]}
		</label>
	{/each}
</fieldset>

<style>
	.xcwds-theme {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		width: 100%;
		margin-bottom: 0.25rem;
		font-weight: 600;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.75rem;
		border: 1px solid currentColor;
		border-radius: 0.5rem;
		cursor: pointer;
	}
</style>
