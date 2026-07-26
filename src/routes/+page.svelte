<script lang="ts">
	import { Card, Button } from '@tauri-front/shared';
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome to TaskFlow</h1>
		<p class="text-gray-600 dark:text-gray-400">Schema-driven task management application</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
		<Card>
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-2">My Tasks</h2>
				<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
					View and manage your assigned tasks.
				</p>
				<Button variant="primary">Open Tasks</Button>
			</div>
		</Card>

		<Card>
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-2">Team</h2>
				<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
					Collaborate with your team members.
				</p>
				<Button variant="secondary">View Team</Button>
			</div>
		</Card>

		<Card>
			<div class="p-4">
				<h2 class="text-xl font-semibold mb-2">Reports</h2>
				<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
					Task analytics and reporting.
				</p>
				<Button variant="secondary">View Reports</Button>
			</div>
		</Card>
	</div>

	<div class="mt-12">
		<h2 class="text-2xl font-bold mb-4">Quick Actions</h2>
		<div class="flex flex-wrap gap-4">
			<Button variant="primary">New Task</Button>
			<Button variant="secondary">Team Board</Button>
			<Button variant="outline">Open Settings</Button>
		</div>
	</div>
</div>
