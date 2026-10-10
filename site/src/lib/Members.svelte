<script lang="ts">
	/** A table of options, decorators, settings or hooks, from the package's types. */
	import type { Member } from './server/api.js';
	import Members from './Members.svelte';

	let { members, prefix = '' }: { members: Member[]; prefix?: string } = $props();
</script>

<dl class="members">
	{#each members as member (member.name)}
		<div class="member">
			<dt>
				<code>{prefix}{member.name}{member.optional ? '?' : ''}</code>
				{#if member.type !== 'object'}<code class="type">{member.type}</code>{/if}
			</dt>
			<dd>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- doc comments from this repository's own source -->
				{#if member.doc}{@html member.doc}{/if}
				{#if member.members?.length}
					<Members members={member.members} prefix="{prefix}{member.name}." />
				{/if}
			</dd>
		</div>
	{/each}
</dl>
