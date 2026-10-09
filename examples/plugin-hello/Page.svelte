<script>
	/** A page shipped by a plugin package and mounted by a thin route file (decision 2). */
	import { persist, settings, useApp } from '@xcwds/sveltekit';

	const app = useApp();
	let count = $state(0);
	persist(
		app.hello.count,
		() => count,
		(v) => (count = v)
	);
</script>

<p data-testid="plugin-page">
	{settings.current.greeting ?? 'hello'} from a plugin's page component
</p>
<p>
	<button type="button" data-testid="count" onclick={() => count++}>Pressed {count} times</button>
</p>
<p>
	<button type="button" data-testid="greeting" onclick={() => settings.set({ greeting: 'hey' })}>
		Say hey instead
	</button>
</p>
