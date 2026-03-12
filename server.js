import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

async function handleGitHubOAuth(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { code, code_verifier, redirect_uri } = JSON.parse(Buffer.concat(chunks).toString());

    if (!code || !code_verifier) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required parameters' }));
      return;
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier,
        redirect_uri: redirect_uri || process.env.VITE_GITHUB_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    res.writeHead(tokenRes.ok ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tokenData));
  } catch (err) {
    console.error('OAuth error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/github-oauth') {
      return await handleGitHubOAuth(req, res);
    }

    // Serve static files, fall back to index.html for SPA routing
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    let content;
    let filePath = join(DIST, pathname);
    try {
      content = await readFile(filePath);
    } catch {
      content = await readFile(join(DIST, 'index.html'));
      filePath = join(DIST, 'index.html');
    }

    const isAsset = filePath.includes(join(DIST, 'assets'));
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate'
    });
    res.end(content);
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => console.log(`Waystones server running on port ${PORT}`));
