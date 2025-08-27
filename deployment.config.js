// Production Deployment Configuration
export const deploymentConfig = {
  // Build optimization settings
  build: {
    // Target environments
    targets: {
      browsers: ['Chrome >= 105', 'Firefox >= 100', 'Safari >= 13', 'Edge >= 105'],
      node: '18.0.0'
    },
    
    // Bundle optimization
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // Vendor chunk for React and core libraries
          vendor: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'vendor',
            chunks: 'all',
            priority: 10
          },
          
          // UI libraries chunk
          ui: {
            test: /[\\/]node_modules[\\/](framer-motion|lucide-react)[\\/]/,
            name: 'ui-libs',
            chunks: 'all',
            priority: 8
          },
          
          // Common chunk for shared code
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true
          }
        }
      }
    },
    
    // Performance budgets
    performance: {
      maxAssetSize: 512000, // 512KB max for individual assets
      maxEntrypointSize: 2048000, // 2MB max for entry points
      hints: 'error'
    }
  },

  // Server configuration
  server: {
    // Security headers
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api.smairs.app"
      ].join('; ')
    },
    
    // Compression
    compression: {
      gzip: {
        enabled: true,
        level: 9,
        threshold: 1024
      },
      brotli: {
        enabled: true,
        quality: 11,
        threshold: 1024
      }
    },
    
    // Caching strategy
    cache: {
      static: {
        maxAge: '1y', // 1 year for versioned assets
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      },
      dynamic: {
        maxAge: '1h', // 1 hour for dynamic content
        headers: {
          'Cache-Control': 'public, max-age=3600, must-revalidate'
        }
      }
    }
  },

  // CDN configuration
  cdn: {
    enabled: true,
    domain: 'https://cdn.smairs.app',
    paths: {
      assets: '/assets',
      images: '/images',
      fonts: '/fonts'
    },
    
    // Preload critical resources
    preload: [
      { href: '/fonts/inter-var.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
      { href: '/assets/css/main.css', as: 'style' }
    ]
  },

  // Service Worker configuration
  serviceWorker: {
    enabled: true,
    scope: '/',
    updateInterval: 3600000, // 1 hour
    
    // Caching strategies
    cacheStrategies: {
      documents: 'NetworkFirst',
      static: 'CacheFirst',
      api: 'NetworkFirst',
      images: 'CacheFirst'
    },
    
    // Offline fallbacks
    offline: {
      document: '/offline.html',
      image: '/images/offline.svg'
    }
  },

  // Analytics and monitoring
  monitoring: {
    // Performance monitoring
    performance: {
      enabled: true,
      sampleRate: 0.1, // 10% sampling
      thresholds: {
        fcp: 2000, // First Contentful Paint < 2s
        lcp: 4000, // Largest Contentful Paint < 4s
        fid: 300,  // First Input Delay < 300ms
        cls: 0.25  // Cumulative Layout Shift < 0.25
      }
    },
    
    // Error tracking
    errorTracking: {
      enabled: true,
      sampleRate: 1.0, // 100% error capture
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'ChunkLoadError'
      ]
    },
    
    // User analytics
    analytics: {
      enabled: true,
      anonymizeIP: true,
      cookieExpires: 730 // 2 years
    }
  },

  // Deployment environments
  environments: {
    staging: {
      apiUrl: 'https://staging-api.smairs.app',
      cdnUrl: 'https://staging-cdn.smairs.app',
      enableDebugTools: true,
      enableSourceMaps: true
    },
    
    production: {
      apiUrl: 'https://api.smairs.app',
      cdnUrl: 'https://cdn.smairs.app',
      enableDebugTools: false,
      enableSourceMaps: false
    }
  },

  // Health checks and monitoring endpoints
  healthCheck: {
    endpoints: [
      { path: '/health', timeout: 5000 },
      { path: '/api/health', timeout: 10000 }
    ],
    interval: 300000, // 5 minutes
    retries: 3
  }
};

export default deploymentConfig;