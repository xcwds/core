<script lang="ts">
	import { page } from '$app/state';
</script>

<p data-testid="error">{page.status === 404 ? 'Page not found' : 'Something went wrong'}</p>
