<script lang="ts">
	import { onMount } from 'svelte';
	import { plugins } from 'virtual:xcwds/client';

	let { children } = $props();

	onMount(() => {
		for (const [hooks, options] of plugins) hooks.onBoot?.(options);
		document.documentElement.dataset.hydrated = '';
	});
</script>

{@render children()}
