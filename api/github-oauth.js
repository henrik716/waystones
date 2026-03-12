// Secure serverless function - client secret never exposed to frontend
export default async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, code_verifier, redirect_uri } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Client ID is safe to expose, but secret is server-side only
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID, // Server-side only
        client_secret: process.env.GITHUB_CLIENT_SECRET, // Server-side only
        code: code,
        code_verifier: code_verifier,
        redirect_uri: redirect_uri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(400).json({ 
        error: 'Token exchange failed',
        details: errorText 
      });
    }

    const tokenData = await tokenResponse.json();
    return res.status(200).json(tokenData);

  } catch (error) {
    console.error('OAuth token exchange error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
