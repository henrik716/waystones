import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Returns true if the hostname resolves to a private/loopback address
 * (SSRF protection — prevents users from making the server connect to internal services).
 */
export function isPrivateIp(hostname) {
  const ip = hostname.toLowerCase();
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  // 172.16-31.x.x (RFC 1918 private range)
  const parts = ip.split('.');
  if (parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true; // Link-local (AWS/GCP metadata: 169.254.169.254)
  if (ip.startsWith('::ffff:127.')) return true; // IPv6 localhost
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true; // IPv6 private
  return false;
}

/**
 * Validates a Supabase JWT using HMAC-SHA256.
 * Returns true when no jwtSecret is configured (auth bypassed in dev/self-hosted).
 */
export function validateSupabaseJwt(authHeader, jwtSecret) {
  if (!jwtSecret) return true; // No secret set, skip JWT validation
  if (!authHeader) return false;

  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const expected = createHmac('sha256', jwtSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actual = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    if (expected.length !== actual.length) return false;
    if (!timingSafeEqual(expected, actual)) return false;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch (err) {
    console.warn('JWT validation error:', err.message);
    return false;
  }
}

/**
 * Returns the connection string with the password replaced by *** for safe logging.
 */
export function scrubConnectionString(cs) {
  try {
    const u = new URL(cs.includes('://') ? cs : `postgresql://${cs}`);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '[unparseable connection string]';
  }
}
