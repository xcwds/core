<script lang="ts">
	/**
	 * Header links or a sidebar on tablets and computers, per orientation (the `nav` setting).
	 * Phones always get the tab bar. The settings plugin shows it under Appearance.
	 */
	import { settings } from '@xcwds/sveltekit';
	import type {} from './client.js';
	import { DEFAULT_NAV, type NavStyle } from './options.js';

	type Text = { portrait: string; landscape: string; bar: string; sidebar: string };
	const defaults: Text = {
		portrait: 'Navigation in portrait',
		landscape: 'Navigation in landscape',
		bar: 'Top bar',
		sidebar: 'Sidebar'
	};
	let { text = {} }: { text?: Partial<Text> } = $props();
	const t = $derived({ ...defaults, ...text });
	const uid = $props.id();
	const nav = $derived(settings.current.nav ?? DEFAULT_NAV);
	const styles: NavStyle[] = ['bar', 'sidebar'];
	const orientations = ['portrait', 'landscape'] as const;
</script>

<div class="xcwds-nav-picker flex flex-col gap-3" data-testid="nav-picker">
	{#each orientations as orientation (orientation)}
		<div role="radiogroup" aria-labelledby="{uid}-{orientation}" class="flex flex-col gap-1">
			<span id="{uid}-{orientation}" class="font-medium">{t[orientation]}</span>
			<div class="flex flex-wrap gap-2">
				{#each styles as style (style)}
					<label
						class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-(--xcwds-shell-border) px-3"
					>
						<input
							type="radio"
							name="{uid}-{orientation}"
							value={style}
							checked={nav[orientation] === style}
							disabled={!settings.ready}
							onchange={() => settings.set({ nav: { ...nav, [orientation]: style } })}
						/>
						{t[style]}
					</label>
				{/each}
			</div>
		</div>
	{/each}
</div>
