<script lang="ts">
	import { page } from '$app/state';
</script>

<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
