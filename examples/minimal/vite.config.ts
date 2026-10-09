import { sveltekit } from '@sveltejs/kit/vite';
import { xcwds } from '@xcwds/sveltekit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [xcwds(), sveltekit()] });
