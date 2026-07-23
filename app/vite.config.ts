import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// One copy of the alert logic, shared with the runner container.
const shared = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
	resolve: {
		alias: { $shared: shared }
	},
	server: {
		fs: { allow: [shared] }
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// Cookie first so the dashboard keeps clean URLs; fall back to Accept-Language.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		})
	]
});
