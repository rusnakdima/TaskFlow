<script lang="ts">
	import { Card, Text, Button, Switch } from '@tauri-front/shared';
	import { themeStore } from '@tauri-front/shared';

	let isDark = false;
	let currentTheme = 'system';

	themeStore.subscribe((state) => {
		isDark = state.isDark;
		currentTheme = state.mode;
	});

	function toggleDarkMode() {
		const newMode = isDark ? 'light' : 'dark';
		themeStore.setMode(newMode);
	}

	function setTheme(mode: 'light' | 'dark' | 'system') {
		themeStore.setMode(mode);
	}
</script>

<svelte:head>
	<title>TaskFlow - Settings</title>
</svelte:head>

<div class="space-y-6">
	<Text variant="heading" class="mb-6">Settings</Text>

	<Card variant="elevated" class="p-6">
		<Text variant="title" class="mb-4">Appearance</Text>
		
		<div class="space-y-4">
			<div class="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
				<div>
					<Text variant="body" class="font-medium">Dark Mode</Text>
					<Text variant="caption" class="text-gray-500 dark:text-gray-400">
						Switch between light and dark themes
					</Text>
				</div>
				<Switch 
					checked={isDark} 
					on:change={toggleDarkMode}
				/>
			</div>

			<div class="py-3">
				<Text variant="body" class="font-medium mb-3">Theme Mode</Text>
				<div class="flex gap-2">
					<Button 
						variant={currentTheme === 'light' ? 'primary' : 'outline'} 
						size="small"
						on:click={() => setTheme('light')}
					>
						Light
					</Button>
					<Button 
						variant={currentTheme === 'dark' ? 'primary' : 'outline'}
						size="small"
						on:click={() => setTheme('dark')}
					>
						Dark
					</Button>
					<Button 
						variant={currentTheme === 'system' ? 'primary' : 'outline'}
						size="small"
						on:click={() => setTheme('system')}
					>
						System
					</Button>
				</div>
			</div>
		</div>
	</Card>

	<Card variant="elevated" class="p-6">
		<Text variant="title" class="mb-4">Navigation</Text>
		<div class="flex gap-4">
			<Button variant="outline" on:click={() => window.location.href = '/'}>
				Home
			</Button>
			<Button variant="outline" on:click={() => window.location.href = '/about'}>
				About
			</Button>
		</div>
	</Card>
</div>
