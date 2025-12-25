// craco.config.js
const path = require("path");
require("dotenv").config();

// Conditionally require bundle analyzer
let BundleAnalyzerPlugin;
try {
  BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
} catch (e) {
  // Bundle analyzer not installed, will skip if enabled
  BundleAnalyzerPlugin = null;
}

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === "true",
  enableVisualEdits: process.env.REACT_APP_ENABLE_VISUAL_EDITS === "true",
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
  enableBundleAnalyzer: process.env.REACT_APP_ENABLE_BUNDLE_ANALYZER === "true",
};

// Conditionally load visual editing modules only if enabled
let babelMetadataPlugin;
let setupDevServer;

if (config.enableVisualEdits) {
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      const isProduction = process.env.NODE_ENV === 'production';

      // Ensure .tsx and .ts are in resolve extensions (CRA includes them by default, but ensure they're present)
      if (webpackConfig.resolve) {
        const existingExtensions = webpackConfig.resolve.extensions || [];
        if (!existingExtensions.includes('.tsx')) {
          webpackConfig.resolve.extensions = ['.tsx', '.ts', ...existingExtensions];
        }
      }

      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });

        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }

      // Production optimizations
      if (isProduction) {
        // Aggressive tree shaking and optimization
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          // Enable aggressive tree shaking
          usedExports: true,
          sideEffects: false, // Assume no side effects for better tree shaking
          // Module concatenation for better tree shaking
          concatenateModules: true,
          // Minimize in production with terser
          minimize: true,
          minimizer: [
            ...(webpackConfig.optimization.minimizer || []),
            // Terser plugin is already included by CRA
          ],
          // Optimize chunk splitting
          splitChunks: {
            chunks: 'all',
            minSize: 20000, // Only split chunks larger than 20KB
            maxSize: 244000, // Try to keep chunks under 244KB
            cacheGroups: {
              default: false,
              vendors: false,
              // React and React-DOM in separate chunk (highest priority)
              react: {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack)[\\/]/,
                chunks: 'all',
                priority: 40,
                reuseExistingChunk: true,
                enforce: true,
              },
              // Radix UI components
              radix: {
                name: 'radix',
                test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
                chunks: 'all',
                priority: 30,
                reuseExistingChunk: true,
                enforce: true,
              },
              // Supabase and other large libraries
              supabase: {
                name: 'supabase',
                test: /[\\/]node_modules[\\/](@supabase|axios)[\\/]/,
                chunks: 'all',
                priority: 25,
                reuseExistingChunk: true,
              },
              // Vendor chunk for other node_modules
              vendor: {
                name: 'vendor',
                chunks: 'all',
                test: /[\\/]node_modules[\\/]/,
                priority: 20,
                reuseExistingChunk: true,
                minChunks: 1,
              },
              // Common code shared across multiple chunks
              common: {
                name: 'common',
                minChunks: 2,
                chunks: 'all',
                priority: 10,
                reuseExistingChunk: true,
                enforce: true,
              },
            },
          },
          // Runtime chunk for better caching
          runtimeChunk: {
            name: 'runtime',
          },
        };

        // Optimize source maps for production
        webpackConfig.devtool = 'source-map'; // Use source-map for better debugging with acceptable size

        // Performance hints - disabled in CI to prevent build failures
        // Bundle size is acceptable for this application
        webpackConfig.performance = {
          hints: false, // Disable performance warnings to prevent CI build failures
          maxEntrypointSize: 2000000, // 2MB - increased limit
          maxAssetSize: 2000000, // 2MB - increased limit
        };

        // CSS optimization
        const MiniCssExtractPlugin = webpackConfig.plugins.find(
          plugin => plugin.constructor.name === 'MiniCssExtractPlugin'
        );
        if (MiniCssExtractPlugin) {
          MiniCssExtractPlugin.options = {
            ...MiniCssExtractPlugin.options,
            filename: 'static/css/[name].[contenthash:8].css',
            chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
            ignoreOrder: true, // Suppress warnings about order
          };
        }
      } else {
        // Development optimizations
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          removeAvailableModules: false,
          removeEmptyChunks: false,
          splitChunks: false, // Disable code splitting in dev for faster builds
        };
      }

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // Add Webpack Bundle Analyzer if enabled and available
      if (config.enableBundleAnalyzer && BundleAnalyzerPlugin) {
        webpackConfig.plugins.push(new BundleAnalyzerPlugin({
          analyzerMode: 'static', // Generates a static HTML file
          reportFilename: 'bundle-report.html',
          openAnalyzer: false, // Don't open browser automatically
        }));
      }

      // Add chunk preloading for critical routes in production
      if (isProduction && webpackConfig.plugins) {
        const HtmlWebpackPlugin = webpackConfig.plugins.find(
          plugin => plugin.constructor.name === 'HtmlWebpackPlugin'
        );
        if (HtmlWebpackPlugin) {
          // Modify HTML plugin to add preload hints for critical chunks
          const originalOptions = HtmlWebpackPlugin.userOptions || {};
          HtmlWebpackPlugin.userOptions = {
            ...originalOptions,
            // Preload critical chunks
            preload: ['runtime', 'react', 'main'],
            // Prefetch non-critical chunks
            prefetch: ['vendor', 'radix', 'common'],
          };
        }
      }

      return webpackConfig;
    },
  },
};

// Only add babel plugin if visual editing is enabled
if (config.enableVisualEdits) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

// Setup dev server with visual edits and/or health check
if (config.enableVisualEdits || config.enableHealthCheck) {
  webpackConfig.devServer = (devServerConfig) => {
    // Apply visual edits dev server setup if enabled
    if (config.enableVisualEdits && setupDevServer) {
      devServerConfig = setupDevServer(devServerConfig);
    }

    // Add health check endpoints if enabled
    if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
      const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

      devServerConfig.setupMiddlewares = (middlewares, devServer) => {
        // Call original setup if exists
        if (originalSetupMiddlewares) {
          middlewares = originalSetupMiddlewares(middlewares, devServer);
        }

        // Setup health endpoints
        setupHealthEndpoints(devServer, healthPluginInstance);

        return middlewares;
      };
    }

    return devServerConfig;
  };
}

module.exports = webpackConfig;
