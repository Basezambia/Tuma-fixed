import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // This ensures your assets are loaded from the correct path in production
    base: mode === 'production' ? '/' : '/',
    
    server: {
      host: "::",
      port: 8080,
    },
    
    plugins: [
      react(),
      // Temporarily disabled lovable-tagger as it's causing build issues
      // mode === 'development' &&
      // componentTagger(),
    ].filter(Boolean),
    
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    
    // Ensure environment variables are properly exposed to the client
    define: {
      'process.env': {}
    },
    
    // Configure build settings
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        output: {
          manualChunks: {
            // Split vendor and runtime chunks
            vendor: ['react', 'react-dom', 'react-router-dom'],
            // You can add more chunks here as needed
          },
        },
      },
    },
    
    // Configure development server
    preview: {
      port: 8080,
      strictPort: true,
    },
  };
});
