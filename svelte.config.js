import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		}),
		// HMRのためのファイル監視設定
		files: {
			routes: 'src/routes',
			lib: 'src/lib'
		}
	},
	// HMRの最適化
	compilerOptions: {
		dev: true
	}
};

export default config;