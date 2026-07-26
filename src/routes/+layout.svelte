<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HeaderDropdown, ThemeService } from '@tauri-front/shared';

	let currentPath = '/';

	onMount(() => {
		ThemeService.init();
	});

	function handleSettings() {
		goto('/settings');
	}

	function handleAbout() {
		goto('/about');
	}
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-950">
	<HeaderDropdown
		appName="TaskFlow"
		{currentPath}
		onSettings={handleSettings}
		onAbout={handleAbout}
	/>
	
	<main class="container mx-auto px-4 py-8">
		<slot />
	</main>
</div>
