import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { xcwds } from './spike/xcwds.js';

export default defineConfig({ plugins: [xcwds(), sveltekit()] });
