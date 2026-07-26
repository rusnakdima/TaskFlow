import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'$lib': '/src/lib',
			'@tauri-front/shared': '/tauri-front-shared/projects/shared/src/lib'
		}
	},
	server: {
		port: 5176,
		strictPort: true,
		host: '0.0.0.0'
	}
});
