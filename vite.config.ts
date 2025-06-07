import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 3000,
		watch: {
			usePolling: true,
			interval: 100,
			// Docker環境でのファイル変更検知を改善
			ignored: ['!**/node_modules/**']
		},
		hmr: {
			port: 24678,
			host: 'localhost',
			protocol: 'ws'
		}
	},
	optimizeDeps: {
		include: ['clsx', 'tailwind-merge'],
		exclude: ['svelte-hmr']
	},
	// Svelteファイルの変更検知を改善
	resolve: {
		dedupe: ['svelte']
	}
});