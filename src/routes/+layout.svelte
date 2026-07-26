<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { HeaderDropdown, ThemeService } from '@tauri-front/shared';

	let currentPath = '/';

	page.subscribe((p) => {
		currentPath = p.url.pathname;
	});

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

<div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
	<HeaderDropdown
		appName="TaskFlow"
		{currentPath}
		onSettings={handleSettings}
		onAbout={handleAbout}
	/>

	<main class="p-6">
		<slot />
	</main>
</div>
