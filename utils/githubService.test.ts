import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushDeployKit } from './githubService';

// ---------------------------------------------------------------------------
// Fetch mocking helpers
//
// pushDeployKit makes a fixed sequence of GitHub REST calls. We mock global
// fetch to resolve them in order and assert on method/URL/body at the points
// that matter — this is the cheapest way to pin down the "empty repo" (no
// existing branch/commits) behavior without hitting the real GitHub API.
// ---------------------------------------------------------------------------

const jsonResponse = (body: any, ok = true) => ({
  ok,
  json: async () => body,
} as Response);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('pushDeployKit — existing branch (normal case)', () => {
  it('reads the existing branch/commit/tree and PATCHes the ref to the new commit', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'base-commit-sha' } });
      if (url.endsWith('/git/commits/base-commit-sha')) return jsonResponse({ tree: { sha: 'base-tree-sha' } });
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs/heads/main')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pushDeployKit(
      'token', 'owner/repo', 'main', '', { 'README.md': 'hello' }, 'commit message'
    );

    expect(result.success).toBe(true);
    expect(result.commitSha).toBe('new-commit-sha');

    const treeCall = calls.find(c => c.url.endsWith('/git/trees'));
    expect(JSON.parse(treeCall!.init!.body as string).base_tree).toBe('base-tree-sha');

    const commitCall = calls.find(c => c.url.endsWith('/git/commits') && c.init?.method === 'POST');
    expect(JSON.parse(commitCall!.init!.body as string).parents).toEqual(['base-commit-sha']);

    const refUpdateCall = calls.find(c => c.url.endsWith('/git/refs/heads/main'));
    expect(refUpdateCall!.init!.method).toBe('PATCH');
  });
});

describe('pushDeployKit — brand-new empty repo (no branch/commits yet)', () => {
  it('treats a 404 on git/ref/heads/<branch> as "first commit ever", not an error', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({}, false); // 404 — no ref yet
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pushDeployKit(
      'token', 'owner/waystones-demo', 'main', '', { 'README.md': 'hello' }, 'first commit'
    );

    expect(result.success).toBe(true);
  });

  it('builds the tree with no base_tree (a full tree from scratch)', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({}, false);
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await pushDeployKit('token', 'owner/waystones-demo', 'main', '', { 'README.md': 'hello' }, 'first commit');

    const treeCall = calls.find(c => c.url.endsWith('/git/trees'));
    expect(JSON.parse(treeCall!.init!.body as string).base_tree).toBeUndefined();
  });

  it('creates a root commit with no parents', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({}, false);
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await pushDeployKit('token', 'owner/waystones-demo', 'main', '', { 'README.md': 'hello' }, 'first commit');

    const commitCall = calls.find(c => c.url.endsWith('/git/commits') && c.init?.method === 'POST');
    expect(JSON.parse(commitCall!.init!.body as string).parents).toEqual([]);
  });

  it('creates the branch ref with POST /git/refs, not PATCH /git/refs/heads/<branch>', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({}, false);
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await pushDeployKit('token', 'owner/waystones-demo', 'main', '', { 'README.md': 'hello' }, 'first commit');

    const refCreateCall = calls.find(c => c.url.endsWith('/git/refs') && c.init?.method === 'POST');
    expect(refCreateCall).toBeDefined();
    expect(JSON.parse(refCreateCall!.init!.body as string)).toEqual({ ref: 'refs/heads/main', sha: 'new-commit-sha' });
    expect(calls.some(c => c.url.endsWith('/git/refs/heads/main') && c.init?.method === 'PATCH')).toBe(false);
  });

  it('pushes directly instead of opening a PR, even when createPR is requested (no base branch to diff against)', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({}, false);
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit-sha' });
      if (url.endsWith('/git/refs')) return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pushDeployKit(
      'token', 'owner/waystones-demo', 'main', '', { 'README.md': 'hello' }, 'first commit',
      /* createPR */ true, 'My PR title'
    );

    expect(result.success).toBe(true);
    expect(result.prUrl).toBeUndefined();
    expect(calls.some(c => c.url.endsWith('/pulls'))).toBe(false);
  });
});
