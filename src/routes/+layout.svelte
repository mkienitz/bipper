<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-5-french-toast';
	let { children } = $props();
</script>

<Toaster />
<div class="container prose mx-auto flex flex-col items-center">
	<h1 class="mt-20">Bipper</h1>
	{@render children()}
</div>
