import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { xcwds } from '@xcwds/sveltekit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [xcwds(), sveltekit(), tailwindcss()] });
