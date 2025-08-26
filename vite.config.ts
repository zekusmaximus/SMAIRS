// @ts-check
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      manifest: {
        name: 'SMAIRS',
        short_name: 'SMAIRS',
        description: 'Single Manuscript AI Revision System',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0f13',
        theme_color: '#0b0f13',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Tauri expects a fixed port, fail if port is in use
  server: {
    port: 5173,
    strictPort: true,
  },

  // For env prefix
  envPrefix: ['VITE_', 'TAURI_'],

  resolve: {
    alias: {
  '@': path.resolve(process.cwd(), 'src'),
    },
  },

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
