<script lang="ts">
	/**
	 * Privacy: which servers the app contacts and why, from each plugin's `network` metadata and
	 * `privacy.allowOrigins` in the xcwds config. The build fails on any other origin it finds,
	 * and the page's Content Security Policy blocks the rest.
	 */
	import { brand, privacy } from '@xcwds/sveltekit';

	const declared = privacy.plugins.flatMap(({ name, network }) =>
		network ? [{ origins: network.origins, reason: network.reason, by: name }] : []
	);
	const contacts = [
		...declared,
		...(privacy.allowOrigins.length
			? [{ origins: privacy.allowOrigins, reason: 'Allowed by the app.', by: brand.name }]
			: [])
	];
	const host = (origin: string) => origin.replace(/^[a-z]+:\/\//, '');
</script>

<div class="flex flex-col gap-3 text-sm" data-testid="privacy">
	{#if contacts.length === 0}
		<p>
			{brand.name} never contacts a server. Everything you save stays on this device, and only you can
			move it, with a backup.
		</p>
	{:else}
		<p>{brand.name} only contacts these servers. Everything else you save stays on this device.</p>
		<ul class="flex flex-col gap-2">
			{#each contacts as contact, i (i)}
				<li>
					<span class="font-medium">{contact.origins.map(host).join(', ')}</span>:
					{contact.reason}
					<span class="text-(--xcwds-shell-muted)">({contact.by})</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if privacy.plugins.length}
		<details>
			<summary class="flex min-h-11 cursor-pointer items-center">
				Plugins ({privacy.plugins.length})
			</summary>
			<ul class="flex flex-col gap-1">
				{#each privacy.plugins as plugin (plugin.name)}
					<li class="flex flex-wrap justify-between gap-x-4">
						<span>{plugin.name}</span>
						<span class="text-(--xcwds-shell-muted)">
							{plugin.network ? plugin.network.origins.map(host).join(', ') : 'No network'}
						</span>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>
