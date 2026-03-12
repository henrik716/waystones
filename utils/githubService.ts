export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  author: string;
}

const ghHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github.v3+json',
  ...(token ? { Authorization: `token ${token}` } : {}),
});

export const fetchModelHistory = async (
  token: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<CommitInfo[]> => {
  if (!repo || !path) return [];

  const response = await fetch(
    `https://api.github.com/repos/${repo}/commits?path=${path}&sha=${branch}`,
    { headers: ghHeaders(token) }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.map((item: any) => ({
    sha: item.sha,
    message: item.commit.message,
    date: item.commit.author.date,
    author: item.commit.author.name,
  }));
};

export const fetchModelAtCommit = async (
  token: string,
  repo: string,
  path: string,
  sha: string
): Promise<any> => {
  if (!repo || !path || !sha) return null;

  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${sha}`,
    { headers: ghHeaders(token) }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = JSON.parse(atob(data.content));
  return content;
};

// ============================================================
// Check if the authenticated user owns the target repo
// Returns true if the user is the owner or has push access.
// ============================================================
export const checkRepoAccess = async (
  token: string,
  repo: string
): Promise<{ isOwner: boolean; repoFullName: string; ownerLogin: string; userLogin: string }> => {
  const headers = ghHeaders(token);

  // Get authenticated user
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) throw new Error('Invalid token');
  const userData = await userRes.json();

  // Get repo info
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) throw new Error('Repository not found');
  const repoData = await repoRes.json();

  const isOwner = repoData.permissions?.push === true &&
    (repoData.owner.login === userData.login ||
     repoData.permissions?.admin === true);

  return {
    isOwner,
    repoFullName: repoData.full_name,
    ownerLogin: repoData.owner.login,
    userLogin: userData.login,
  };
};

// ============================================================
// Multi-file commit via Git Trees API
// Pushes multiple files in a single atomic commit.
// ============================================================
export interface DeployPushResult {
  success: boolean;
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

export const pushDeployKit = async (
  token: string,
  repo: string,
  branch: string,
  basePath: string,
  files: Record<string, string>,
  commitMessage: string,
  createPR: boolean = false,
  prTitle?: string,
  binaryFiles?: Record<string, Blob>
): Promise<DeployPushResult> => {
  const headers = {
    ...ghHeaders(token),
    'Content-Type': 'application/json',
  };
  const api = `https://api.github.com/repos/${repo}`;

  try {
    // 1. Get the SHA of the latest commit on the base branch
    const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers });
    if (!refRes.ok) throw new Error(`Could not find branch '${branch}'`);
    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    // 2. Get the tree SHA of that commit
    const commitRes = await fetch(`${api}/git/commits/${baseCommitSha}`, { headers });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeItems: any[] = [];
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = basePath ? `${basePath}/${filePath}` : filePath;
      const blobRes = await fetch(`${api}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: btoa(unescape(encodeURIComponent(content))), encoding: 'base64' }),
      });
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${filePath}`);
      const blobData = await blobRes.json();

      treeItems.push({
        path: fullPath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 3b. Create blobs for binary files (e.g., GeoPackage)
    if (binaryFiles) {
      for (const [filePath, blob] of Object.entries(binaryFiles)) {
        const fullPath = basePath ? `${basePath}/${filePath}` : filePath;
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Convert to base64 in chunks to avoid call stack overflow
        let base64 = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          base64 += String.fromCharCode(...chunk);
        }
        base64 = btoa(base64);

        const blobRes = await fetch(`${api}/git/blobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: base64, encoding: 'base64' }),
        });
        if (!blobRes.ok) throw new Error(`Failed to create blob for ${filePath}`);
        const blobData = await blobRes.json();

        treeItems.push({
          path: fullPath,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        });
      }
    }

    // 4. Create a new tree
    const treeRes = await fetch(`${api}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error('Failed to create tree');
    const treeData = await treeRes.json();

    // 5. Create the commit
    const newCommitRes = await fetch(`${api}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: [baseCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error('Failed to create commit');
    const newCommitData = await newCommitRes.json();

    if (createPR) {
      // 6a. Create a new branch and open a PR
      const prBranch = `deploy/${Date.now()}`;
      const branchRes = await fetch(`${api}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: newCommitData.sha }),
      });
      if (!branchRes.ok) throw new Error('Failed to create PR branch');

      const prRes = await fetch(`${api}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: prTitle || commitMessage,
          head: prBranch,
          base: branch,
          body: `Autogenerert deploy-konfigurasjon fra GeoForge.\n\nMerge denne PR-en for å trigge deployment.`,
        }),
      });
      if (!prRes.ok) throw new Error('Failed to create pull request');
      const prData = await prRes.json();

      return { success: true, commitSha: newCommitData.sha, prUrl: prData.html_url, prNumber: prData.number };
    } else {
      // 6b. Update branch ref directly
      const updateRes = await fetch(`${api}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitData.sha }),
      });
      if (!updateRes.ok) throw new Error('Failed to update branch');

      return { success: true, commitSha: newCommitData.sha };
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
};