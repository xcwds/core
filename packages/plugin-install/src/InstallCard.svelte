<script lang="ts">
	/**
	 * Offers to install the app: an Install button where the browser has a prompt, Add to Home
	 * Screen steps on iPhone and iPad, the browser menu elsewhere. Shows nothing once the app
	 * runs installed. Place it inside `<App>` (the settings plugin puts it on its page).
	 */
	import { useApp } from '@xcwds/sveltekit';
	import type { InstallState } from './client.js';

	type Text = {
		heading: string;
		intro: string;
		/** The Install button. */
		install: string;
		/** iPhone and iPad steps; `<strong>` is allowed. */
		iosSteps: string[];
		/** Other browsers. `<strong>` is allowed. */
		menu: string;
	};
	const defaults: Text = {
		heading: 'Install the app',
		intro: 'Get it on your home screen. It opens full-screen and works offline.',
		install: 'Install app',
		iosSteps: [
			'Open this page in <strong>Safari</strong>.',
			'Tap <strong>Share</strong> (the square with an arrow).',
			'Choose <strong>Add to Home Screen</strong>.'
		],
		menu: "Use your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>."
	};
	let { text = {} }: { text?: Partial<Text> } = $props();
	const t = $derived({ ...defaults, ...text });

	/** Only `<strong>` survives: everything else is shown as text. */
	const strong = (s: string) =>
		s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/&lt;(\/?)strong>/g, '<$1strong>');

	const install = useApp().install;
	let current = $state<InstallState>({
		checked: false,
		installed: false,
		available: false,
		ios: false
	});
	$effect(() => install?.subscribe((value) => (current = value)));
	const id = $props.id();
</script>

{#if current.checked && !current.installed}
	<section class="xcwds-install" aria-labelledby={id} data-testid="install">
		<h2 {id}>{t.heading}</h2>
		<p>{t.intro}</p>
		{#if current.available}
			<button type="button" onclick={() => install?.prompt()}>{t.install}</button>
		{:else if current.ios}
			<ol>
				{#each t.iosSteps as step, i (i)}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<li>{@html strong(step)}</li>
				{/each}
			</ol>
		{:else}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<p>{@html strong(t.menu)}</p>
		{/if}
	</section>
{/if}

<style>
	h2 {
		margin: 0 0 0.25rem;
		font-size: 1.125rem;
	}
	p,
	ol {
		margin: 0 0 0.5rem;
	}
	button {
		min-width: 44px;
		min-height: 44px;
		padding: 0 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: var(--xcwds-install-accent, #2563eb);
		color: #fff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
