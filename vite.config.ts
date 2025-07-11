import { defineConfig } from 'vite';
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3003,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
    proxy: {
      // Proxy API requests to serverless functions during development
      '/api': {
        target: 'http://localhost:3001',  // Use a different port for API server
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  preview: {
    port: 3003,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure sourcemaps are generated for better debugging
    sourcemap: true,
    // Optimize chunks for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover'],
        },
      },
    },
  },
  plugins: [
    react(),
    // Temporarily disabled lovable-tagger as it's causing build issues
    // mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure environment variables are properly handled
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
}));
