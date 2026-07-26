<script lang="ts">
	import { Card, Text, Button } from '@tauri-front/shared';
</script>

<svelte:head>
	<title>TaskFlow - About</title>
</svelte:head>

<div class="space-y-6">
	<Card variant="elevated" class="p-6">
		<Text variant="heading" class="mb-4">About TaskFlow</Text>
		<Text variant="body" class="text-gray-600 dark:text-gray-400 mb-4">
			TaskFlow is a modern task and project management application built with Angular and Tauri.
			It uses Schema-driven UI (SDUI) for flexible and maintainable user interfaces.
		</Text>
		<Text variant="body" class="text-gray-600 dark:text-gray-400 mb-6">
			Version: 0.18.0
		</Text>

		<div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
			<Text variant="title" class="mb-3">Features</Text>
			<ul class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
				<li>Task and project management</li>
				<li>Calendar integration</li>
				<li>Statistics and analytics</li>
				<li>Team collaboration</li>
				<li>Dark mode support</li>
				<li>Multi-language support (EN/RU)</li>
			</ul>
		</div>
	</Card>

	<Card variant="elevated" class="p-6">
		<Text variant="title" class="mb-4">Navigation</Text>
		<div class="flex gap-4">
			<Button variant="outline" on:click={() => window.location.href = '/'}>
				Home
			</Button>
			<Button variant="outline" on:click={() => window.location.href = '/settings'}>
				Settings
			</Button>
		</div>
	</Card>
</div>
