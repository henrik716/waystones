import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivateIp, validateSupabaseJwt, scrubConnectionString } from './utils/serverUtils.js';

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


async function handlePostgisSchema(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }

  // Hoist variable declarations so they're accessible in the catch block
  let connectionString = '';
  let schema = 'public';

  try {
    // Check JWT if SUPABASE_JWT_SECRET is set
    if (process.env.SUPABASE_JWT_SECRET) {
      const authHeader = req.headers.authorization || '';
      if (!validateSupabaseJwt(authHeader, process.env.SUPABASE_JWT_SECRET)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    // Parse request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    ({ connectionString, schema } = JSON.parse(Buffer.concat(chunks).toString()));

    if (!connectionString) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'connectionString is required' }));
      return;
    }

    // SSRF protection: check hostname
    let finalConnectionString = connectionString;
    try {
      const pgUrl = new URL(connectionString.includes('://') ? connectionString : `postgresql://${connectionString}`);
      if (isPrivateIp(pgUrl.hostname)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Private IP addresses are not allowed' }));
        return;
      }
    } catch (err) {
      // If we can't parse the connection string, try simple pattern matching
      if (isPrivateIp(connectionString.split('@')[1]?.split(':')[0] || connectionString)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Private IP addresses are not allowed' }));
        return;
      }
    }

    // Dynamically import pg (node-postgres)
    const { Pool } = await import('pg');
    const targetSchema = schema || 'public';

    // Disable SSL certificate verification for hosted DBs (Railway, Render, etc.)
    // which use self-signed/auto-generated certs. Still encrypts the connection.
    let sslOptions = false;
    try {
      const parsedForSsl = new URL(finalConnectionString.includes('://') ? finalConnectionString : `postgresql://${finalConnectionString}`);
      const sslmode = parsedForSsl.searchParams.get('sslmode') || 'prefer';
      if (sslmode !== 'disable') {
        sslOptions = { rejectUnauthorized: false };
      }
    } catch {
      sslOptions = { rejectUnauthorized: false };
    }

    const pool = new Pool({
      connectionString: finalConnectionString,
      connectionTimeoutMillis: 5000,   // 5 s to connect
      statement_timeout: 10000,        // 10 s per query
      ssl: sslOptions,
      // Force IPv4 — some hosts (incl. Supabase direct DB) resolve to IPv6
      // which fails on IPv4-only networks. Pooler URLs already use IPv4.
      family: 4,
    });

    try {
      // Query information_schema, geometry_columns (PostGIS), and row counts
      const query = `
        SELECT
          c.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          tc.constraint_type,
          gc.type       AS geometry_type,
          gc.srid       AS geometry_srid,
          st.n_live_tup AS row_count
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        LEFT JOIN geometry_columns gc
          ON gc.f_table_schema    = c.table_schema
          AND gc.f_table_name     = c.table_name
          AND gc.f_geometry_column = c.column_name
        LEFT JOIN pg_stat_user_tables st
          ON st.schemaname = c.table_schema
          AND st.relname   = c.table_name
        WHERE c.table_schema = $1
        ORDER BY c.table_name, c.ordinal_position
      `;

      const result = await pool.query(query, [targetSchema]);
      const rows = result.rows;

      // For geometry columns whose subtype is unspecified ('GEOMETRY' or null),
      // sample one row with ST_GeometryType() to get the actual type from data.
      const toSample = rows.filter(r =>
        r.udt_name === 'geometry' && (!r.geometry_type || r.geometry_type.toUpperCase() === 'GEOMETRY')
      );

      for (const row of toSample) {
        try {
          const tbl = `"${targetSchema}"."${row.table_name}"`;
          const col = `"${row.column_name}"`;
          const sr = await pool.query(
            `SELECT ST_GeometryType(${col}) AS gtype FROM ${tbl} WHERE ${col} IS NOT NULL LIMIT 1`
          );
          if (sr.rows[0]?.gtype) {
            // ST_GeometryType returns e.g. 'ST_Point' — strip prefix
            row.geometry_type = sr.rows[0].gtype.replace(/^ST_/i, '').toUpperCase();
          }
        } catch { /* sampling is best-effort; leave geometry_type as-is */ }
      }

      // Compute bbox for every geometry column via ST_Extent, reprojected to WGS84
      const geomRows = rows.filter(r => r.udt_name === 'geometry' || r.udt_name === 'geography');
      for (const row of geomRows) {
        try {
          const tbl = `"${targetSchema}"."${row.table_name}"`;
          const col = `"${row.column_name}"`;
          const srid = row.geometry_srid || 4326;
          const transform = srid !== 4326
            ? `ST_Transform(ST_Extent(${col}), ${srid}, 4326)`
            : `ST_Extent(${col})`;
          const br = await pool.query(
            `SELECT ST_XMin(ext) AS west, ST_YMin(ext) AS south,
                    ST_XMax(ext) AS east, ST_YMax(ext) AS north
             FROM (SELECT ${transform} AS ext FROM ${tbl}) t`
          );
          if (br.rows[0]?.west != null) {
            row.bbox_west  = br.rows[0].west;
            row.bbox_south = br.rows[0].south;
            row.bbox_east  = br.rows[0].east;
            row.bbox_north = br.rows[0].north;
          }
        } catch { /* bbox is best-effort */ }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ layers: rows })); // Return flat rows; client groups them
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('PostGIS schema error (conn: %s):', scrubConnectionString(connectionString), err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to read database schema' }));
  }
}

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

// In-memory rate limiter for trial AI: key = "${ip}-${weekKey}", value = use count
const trialRateMap = new Map();

function getTrialWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

async function handleAiTrial(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') { res.writeHead(405).end(); return; }

  const defaultKey = process.env.DEFAULT_AI_KEY;
  if (!defaultKey) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Trial not available' }));
    return;
  }

  const MAX_TRIAL = 10;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const rateKey = `${ip}-${getTrialWeekKey()}`;
  const used = trialRateMap.get(rateKey) || 0;
  if (used >= MAX_TRIAL) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Trial limit reached' }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let system, user;
  try {
    ({ system, user } = JSON.parse(Buffer.concat(chunks).toString()));
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  if (!system || !user) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Missing system or user' }));
    return;
  }

  const provider = process.env.DEFAULT_AI_PROVIDER ||
    (defaultKey.startsWith('sk-ant-') ? 'claude' : 'gemini');

  try {
    let text;
    if (provider === 'claude') {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': defaultKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (upstream.status === 429) { res.writeHead(429); res.end(JSON.stringify({ error: 'Rate limit' })); return; }
      if (!upstream.ok) { res.writeHead(502); res.end(JSON.stringify({ error: 'AI error' })); return; }
      const data = await upstream.json();
      text = data.content?.[0]?.text?.trim() ?? '';
    } else {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${defaultKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
          }),
        }
      );
      if (upstream.status === 429) { res.writeHead(429); res.end(JSON.stringify({ error: 'Rate limit' })); return; }
      if (!upstream.ok) { res.writeHead(502); res.end(JSON.stringify({ error: 'AI error' })); return; }
      const data = await upstream.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    }

    if (!text) { res.writeHead(502); res.end(JSON.stringify({ error: 'Empty AI response' })); return; }
    trialRateMap.set(rateKey, used + 1);
    res.writeHead(200);
    res.end(JSON.stringify({ text, provider }));
  } catch (err) {
    console.error('AI trial error:', err.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'AI request failed' }));
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/github-oauth') {
      return await handleGitHubOAuth(req, res);
    }

    if (url.pathname === '/api/pg-schema') {
      return await handlePostgisSchema(req, res);
    }

    if (url.pathname === '/api/ai-trial') {
      return await handleAiTrial(req, res);
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
