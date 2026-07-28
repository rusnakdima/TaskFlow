<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { DynamicPage, NotFoundPage, SchemaErrorPage, schemaLoader } from '@tauri-front/shared';

	let loading = true;
	let error: string | null = null;

	$: currentRoute = $page.url.pathname;
	$: schema = schemaLoader.getSchema();
	$: currentPage = schema?.pages.find((p: any) => p.route === currentRoute);
	$: layoutRegions = schema?.layoutRegions || [];
	$: layoutMode = currentPage?.layoutMode || 'default';

	onMount(async () => {
		try {
			if (!schema) {
				await schemaLoader.loadFromUrl('/schemas/taskflowschemas.json');
			}
		} catch (e: any) {
			error = e.message;
			console.error('Schema load error:', e);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>TaskFlow - Schema-driven</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center min-h-[400px]">
		<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
	</div>
{:else if error}
	<SchemaErrorPage message={error} />
{:else if schema}
	{#if currentPage}
		<DynamicPage schema={currentPage} />
	{:else}
		<NotFoundPage message="Page not found in schema" />
	{/if}
{:else}
	<SchemaErrorPage message="No schema loaded" />
{/if}
