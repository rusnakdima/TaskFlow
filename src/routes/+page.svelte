<script lang="ts">
	import { Card, Text, Button } from '@tauri-front/shared';
</script>

<svelte:head>
	<title>TaskFlow - Dashboard</title>
</svelte:head>

<div class="space-y-6">
	<Card variant="elevated" class="p-6">
		<Text variant="heading" class="mb-4">Welcome to TaskFlow</Text>
		<Text variant="body" class="text-gray-600 dark:text-gray-400 mb-6">
			TaskFlow is a powerful task and project management application. 
			Get started by creating your first task or exploring the settings.
		</Text>
		<div class="flex gap-4">
			<Button variant="primary" on:click={() => window.location.href = '/settings'}>
				Get Started
			</Button>
			<Button variant="outline" on:click={() => window.location.href = '/about'}>
				Learn More
			</Button>
		</div>
	</Card>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		<Card variant="outlined" class="p-4">
			<Text variant="label" class="text-gray-500 dark:text-gray-400">Total Tasks</Text>
			<Text variant="heading" class="text-3xl mt-2">0</Text>
		</Card>
		<Card variant="outlined" class="p-4">
			<Text variant="label" class="text-gray-500 dark:text-gray-400">In Progress</Text>
			<Text variant="heading" class="text-3xl mt-2">0</Text>
		</Card>
		<Card variant="outlined" class="p-4">
			<Text variant="label" class="text-gray-500 dark:text-gray-400">Completed</Text>
			<Text variant="heading" class="text-3xl mt-2">0</Text>
		</Card>
	</div>
</div>
