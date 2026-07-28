import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'$lib': '/src/lib',
			'@tauri-front/shared': path.resolve(__dirname, '../tauri-front-shared/projects/shared/src/lib')
		}
	},
	server: {
		port: 5176,
		strictPort: true,
		host: '0.0.0.0',
		fs: {
			allow: ['/home/dmitriy/Projects/tauri-front-shared']
		}
	}
});
