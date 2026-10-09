<script>
	/** A page shipped by a plugin package and mounted by a thin route file (decision 2). */
	let { greeting = 'hello' } = $props();
</script>

<h1>Plugin page</h1>
<p data-testid="plugin-page">{greeting} from a plugin's page component</p>
