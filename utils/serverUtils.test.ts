import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { isPrivateIp, validateSupabaseJwt, scrubConnectionString } from './serverUtils.js';

// ---------------------------------------------------------------------------
// Helper to mint a test JWT signed with HMAC-SHA256
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, any>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

// ---------------------------------------------------------------------------
// isPrivateIp
// ---------------------------------------------------------------------------

describe('isPrivateIp', () => {
  it('"localhost" → true', () => {
    expect(isPrivateIp('localhost')).toBe(true);
  });

  it('"127.0.0.1" → true', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
  });

  it('"127.100.0.1" → true (127.x.x.x)', () => {
    expect(isPrivateIp('127.100.0.1')).toBe(true);
  });

  it('"::1" → true (IPv6 loopback)', () => {
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('"0.0.0.0" → true', () => {
    expect(isPrivateIp('0.0.0.0')).toBe(true);
  });

  it('"10.0.0.1" → true (RFC 1918)', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
  });

  it('"192.168.1.100" → true (RFC 1918)', () => {
    expect(isPrivateIp('192.168.1.100')).toBe(true);
  });

  it('"172.16.0.1" → true (RFC 1918 lower boundary)', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true);
  });

  it('"172.31.255.255" → true (RFC 1918 upper boundary)', () => {
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });

  it('"172.32.0.1" → false (outside RFC 1918 range)', () => {
    expect(isPrivateIp('172.32.0.1')).toBe(false);
  });

  it('"172.15.0.1" → false (below RFC 1918 range)', () => {
    expect(isPrivateIp('172.15.0.1')).toBe(false);
  });

  it('"169.254.169.254" → true (AWS/GCP metadata IP)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
  });

  it('"fc00::1" → true (IPv6 unique local)', () => {
    expect(isPrivateIp('fc00::1')).toBe(true);
  });

  it('"db.example.com" → false (external hostname)', () => {
    expect(isPrivateIp('db.example.com')).toBe(false);
  });

  it('"8.8.8.8" → false', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('"192.169.0.1" → false (not in 192.168.x.x)', () => {
    expect(isPrivateIp('192.169.0.1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSupabaseJwt
// ---------------------------------------------------------------------------

describe('validateSupabaseJwt', () => {
  const SECRET = 'test-jwt-secret-123';
  const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
  const PAST_EXP   = Math.floor(Date.now() / 1000) - 3600;

  it('returns true when no jwtSecret is set (auth bypassed)', () => {
    expect(validateSupabaseJwt('Bearer anything', '')).toBe(true);
    expect(validateSupabaseJwt('Bearer anything', undefined as any)).toBe(true);
    expect(validateSupabaseJwt('Bearer anything', null as any)).toBe(true);
  });

  it('returns false when header is absent and secret is set', () => {
    expect(validateSupabaseJwt('', SECRET)).toBe(false);
    expect(validateSupabaseJwt(undefined as any, SECRET)).toBe(false);
  });

  it('returns true for valid JWT with Bearer prefix', () => {
    const token = makeJwt({ sub: 'user1', exp: FUTURE_EXP }, SECRET);
    expect(validateSupabaseJwt(`Bearer ${token}`, SECRET)).toBe(true);
  });

  it('returns true for valid JWT without Bearer prefix', () => {
    const token = makeJwt({ sub: 'user1', exp: FUTURE_EXP }, SECRET);
    expect(validateSupabaseJwt(token, SECRET)).toBe(true);
  });

  it('returns false for wrong secret', () => {
    const token = makeJwt({ sub: 'user1', exp: FUTURE_EXP }, SECRET);
    expect(validateSupabaseJwt(`Bearer ${token}`, 'wrong-secret')).toBe(false);
  });

  it('returns false for expired token', () => {
    const token = makeJwt({ sub: 'user1', exp: PAST_EXP }, SECRET);
    expect(validateSupabaseJwt(`Bearer ${token}`, SECRET)).toBe(false);
  });

  it('returns false for malformed token (not 3 parts)', () => {
    expect(validateSupabaseJwt('Bearer only.two', SECRET)).toBe(false);
    expect(validateSupabaseJwt('Bearer one', SECRET)).toBe(false);
  });

  it('returns false for tampered signature', () => {
    const token = makeJwt({ sub: 'user1', exp: FUTURE_EXP }, SECRET);
    const [h, p] = token.split('.');
    const tampered = `${h}.${p}.invalidsignature`;
    expect(validateSupabaseJwt(`Bearer ${tampered}`, SECRET)).toBe(false);
  });

  it('returns true for valid JWT with no exp claim', () => {
    // No exp claim — should be accepted (some internal tokens have no expiry)
    const token = makeJwt({ sub: 'system' }, SECRET);
    expect(validateSupabaseJwt(`Bearer ${token}`, SECRET)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scrubConnectionString
// ---------------------------------------------------------------------------

describe('scrubConnectionString', () => {
  it('replaces password with *** in postgresql:// URL', () => {
    const result = scrubConnectionString('postgresql://alice:s3cr3t@db.host:5432/mydb');
    expect(result).toContain('***');
    expect(result).not.toContain('s3cr3t');
    expect(result).toContain('alice');
    expect(result).toContain('db.host');
  });

  it('handles postgres:// scheme alias', () => {
    const result = scrubConnectionString('postgres://user:pass@host/db');
    expect(result).not.toContain('pass');
    expect(result).toContain('***');
  });

  it('adds postgresql:// prefix to bare key=value strings (URL parse fails → returns unparseable)', () => {
    // key=value format isn't a URL — scrub returns placeholder
    const result = scrubConnectionString('host=db.host password=secret dbname=mydb');
    expect(result).toBe('[unparseable connection string]');
  });

  it('returns [unparseable connection string] for input that throws URL parse after prefix', () => {
    // The function prepends postgresql:// and then tries URL(). Some strings
    // that are valid after prefixing won't throw; test with truly invalid chars.
    // This also documents that the fallback IS reachable.
    const result = scrubConnectionString(':::invalid:::');
    expect(result).toBe('[unparseable connection string]');
  });

  it('preserves URL without password unchanged', () => {
    const url = 'postgresql://alice@db.host:5432/mydb';
    const result = scrubConnectionString(url);
    expect(result).not.toContain('***');
    expect(result).toContain('alice');
  });
});
