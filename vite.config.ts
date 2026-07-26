import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5174,
		strictPort: true
	},
	resolve: {
		alias: {
			'$lib': '/src/lib',
			'@tauri-front/shared': '/home/dmitriy/Projects/tauri-front-shared/projects/shared/dist'
		}
	},
	optimizeDeps: {
		include: ['@tauri-front/shared']
	}
});
