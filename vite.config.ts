import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // process.env (Railway injected vars) overrides .env file values
    const env = { ...loadEnv(mode, '.', ''), ...process.env };
    return {
      server: {
        port: 3000,
        host: 'localhost',
      },
      build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              gdal: ['gdal3.js']
            }
          }
        }
      },
      plugins: [
        react(),
        // Dev-only: handle /api/github-oauth token exchange server-side so the secret never reaches the browser
        {
          name: 'github-oauth-dev',
          configureServer(server) {
            server.middlewares.use('/api/github-oauth', (req: any, res: any) => {
              if (req.method === 'OPTIONS') {
                res.writeHead(200, { 'Access-Control-Allow-Origin': 'http://localhost:3000', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
                res.end();
                return;
              }
              if (req.method !== 'POST') { res.writeHead(405).end(); return; }
              const chunks: Buffer[] = [];
              req.on('data', (chunk: Buffer) => chunks.push(chunk));
              req.on('end', async () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                    body: new URLSearchParams({
                      client_id: env.GITHUB_CLIENT_ID || env.VITE_GITHUB_CLIENT_ID,
                      client_secret: env.GITHUB_CLIENT_SECRET,
                      code: body.code,
                      code_verifier: body.code_verifier,
                      redirect_uri: body.redirect_uri || env.VITE_GITHUB_REDIRECT_URI,
                    }),
                  });
                  const tokenData = await tokenRes.json();
                  res.writeHead(tokenRes.ok ? 200 : 400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(tokenData));
                } catch {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Internal server error' }));
                }
              });
            });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_GITHUB_CLIENT_ID': JSON.stringify(env.VITE_GITHUB_CLIENT_ID),
        'import.meta.env.VITE_GITHUB_REDIRECT_URI': JSON.stringify(env.VITE_GITHUB_REDIRECT_URI)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});