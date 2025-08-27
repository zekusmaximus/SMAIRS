// @ts-check
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { compression } from 'vite-plugin-compression2';
import { visualizer } from 'rollup-plugin-visualizer';
import { splitVendorChunkPlugin } from 'vite';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zlib = require('zlib');

const isProduction = process.env.NODE_ENV === 'production';
const isTauriDebug = !!process.env.TAURI_DEBUG;

export default defineConfig({
  plugins: [
    react({
      // Optimize JSX in production
      jsxRuntime: 'automatic',
    }),
    
    // Progressive Web App configuration
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
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
    }),

    // Compression plugins for production
    ...(isProduction ? [
      compression({
        algorithms: ['gzip'],
        threshold: 1024,
        deleteOriginalAssets: false
      }),
      compression({
        algorithms: ['brotliCompress'],
        threshold: 1024,
        deleteOriginalAssets: false
      })
    ] : []),

    // Bundle analyzer for production builds
    ...(isProduction && process.env.ANALYZE ? [
      visualizer({
        filename: './dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap'
      })
    ] : []),

    // Vendor chunk splitting
    splitVendorChunkPlugin()
  ],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    hmr: {
      overlay: true
    },
    // Proxy API calls in development if needed
    proxy: process.env.VITE_API_URL ? {
      '/api': {
        target: process.env.VITE_API_URL,
        changeOrigin: true,
        secure: true
      }
    } : undefined
  },

  // For env prefix
  envPrefix: ['VITE_', 'TAURI_'],

  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // Alias common paths
      '@components': path.resolve(process.cwd(), 'src/ui/components'),
      '@utils': path.resolve(process.cwd(), 'src/utils'),
      '@features': path.resolve(process.cwd(), 'src/features'),
      '@types': path.resolve(process.cwd(), 'src/types')
    },
  },

  // Build optimizations
  build: {
    // Target modern browsers
    target: process.env.TAURI_PLATFORM == 'windows' 
      ? ['chrome105', 'edge105'] 
      : ['safari13', 'firefox100'],
    
    // Minification settings
    minify: isTauriDebug ? false : 'esbuild',
    
    // Source maps
    sourcemap: isTauriDebug || process.env.VITE_SOURCEMAP === 'true',
    
    // Bundle splitting and optimization
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: {
          // React ecosystem
          'react-vendor': ['react', 'react-dom'],
          
          // UI libraries
          'ui-vendor': ['framer-motion', 'lucide-react'],
          
          // Large feature modules
          'export-features': [
            './src/features/export/revision-instructions.ts',
            './src/features/export/docx-track-changes.ts'
          ],
          
          // LLM processing
          'llm-features': ['./src/features/llm'],
          
          // Utilities
          'utils': [
            './src/utils/error-recovery.ts',
            './src/utils/performance-monitor.ts'
          ],

          // UI components  
          'ui-components': [
            './src/ui/components/RevisionInstructionViewer.tsx',
            './src/ui/components/VersionComparisonModal.tsx',
            './src/ui/components/ExportProgressIndicator.tsx'
          ]
        },
        
        // Asset naming for caching
        chunkFileNames: () => {
          return `js/[name]-[hash].js`;
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name!.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext!)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext!)) {
            return `assets/css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        }
      },
      
      // External dependencies (for library builds)
      external: isProduction ? [] : ['@tauri-apps/api']
    },

    // Performance settings
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: isProduction,
    
    // Asset handling
    assetsInlineLimit: 4096, // 4KB
    
    // CSS code splitting
    cssCodeSplit: true
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'framer-motion',
      'lucide-react'
    ],
    exclude: ['@tauri-apps/api'],
    esbuildOptions: {
      target: 'es2020'
    }
  },

  // Preview server (for production builds)
  preview: {
    port: 4173,
    host: true
  },

  // ESBuild configuration
  esbuild: {
    // Remove console.log in production
    drop: isProduction ? ['console', 'debugger'] : [],
    legalComments: 'none'
  },

  // CSS configuration
  css: {
    devSourcemap: !isProduction,
    postcss: {
      plugins: isProduction ? [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('autoprefixer'),
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('cssnano')({
          preset: 'default'
        })
      ] : []
    }
  },

  // Define global constants
  define: {
    __DEV__: !isProduction,
    __VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    // Performance monitoring flags
    __ENABLE_PERFORMANCE_MONITORING__: isProduction,
    __ENABLE_ERROR_REPORTING__: isProduction
  }
});
