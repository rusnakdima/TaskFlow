<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { HeaderDropdown, ThemeService, SchemaShell, schemaLoader, ToastContainer, toasts } from '@tauri-front/shared';

	let currentPath = '/';
	let schema: any = null;
	let loading = true;

	page.subscribe((p) => {
		currentPath = p.url.pathname;
	});

	onMount(async () => {
		ThemeService.init();
		try {
			schema = await schemaLoader.loadFromUrl('/schemas/taskflowschemas.json');
			toasts.show('Schema loaded successfully', 'success');
		} catch (e) {
			toasts.show('Failed to load schema', 'error');
			console.error('Schema load error:', e);
		} finally {
			loading = false;
		}
	});

	function handleSettings() {
		toasts.show('Settings opened', 'info');
		goto('/settings');
	}

	function handleAbout() {
		toasts.show('TaskFlow v1.0.0', 'info');
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
		{#if loading}
			<div class="flex items-center justify-center min-h-[400px]">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
			</div>
		{:else}
			<slot />
		{/if}
	</main>
	<ToastContainer />
</div>
