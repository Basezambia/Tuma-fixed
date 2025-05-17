import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    define: {
      'process.env': { ...env, VITE_API_URL: JSON.stringify(env.VITE_API_URL) },
    },
    server: {
      host: "::",
      port: 8080,
      proxy: {
        // Proxy API requests to the correct backend in development
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
      },
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
    // Ensure environment variables are available in the client
    envDir: '.',
    envPrefix: 'VITE_',
  };
});
