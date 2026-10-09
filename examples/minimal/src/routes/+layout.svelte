<script lang="ts">
	import OfflineNotice from '@xcwds/plugin-offline/OfflineNotice.svelte';
	import Shell from '@xcwds/plugin-shell/Shell.svelte';
	import TimerAlert from '@xcwds/plugin-timers/TimerAlert.svelte';
	import UpdateBanner from '@xcwds/plugin-update/UpdateBanner.svelte';
	import { App } from '@xcwds/sveltekit';
	import '../app.css';

	let { children } = $props();
</script>

<App>
	<Shell>
		{@render children()}
		{#snippet notices()}
			<UpdateBanner />
			<OfflineNotice />
			<TimerAlert />
		{/snippet}
	</Shell>
</App>
