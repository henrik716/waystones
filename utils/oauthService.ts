// GitHub OAuth Service Implementation
// Handles OAuth 2.0 flow with PKCE for secure authentication

export interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    type: string;
  };
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  default_branch: string;
}

// Default OAuth configuration
const DEFAULT_CONFIG: OAuthConfig = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI || `${window.location.origin}/oauth-callback.html`,
  scope: 'repo user:email'
};

// PKCE (Proof Key for Code Exchange) implementation
const generatePKCE = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Generate code challenge from code verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  return crypto.subtle.digest('SHA-256', data).then(buffer => {
    const hashArray = Array.from(new Uint8Array(buffer));
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return { codeVerifier, codeChallenge };
  });
};

// Token storage
const TOKEN_KEY = 'github_oauth_token';
const USER_KEY = 'github_user';

export const storeToken = (tokenData: TokenResponse) => {
  const expiresAt = tokenData.expires_in 
    ? Date.now() + (tokenData.expires_in * 1000)
    : null;
  
  const tokenInfo = {
    ...tokenData,
    expires_at: expiresAt,
    stored_at: Date.now()
  };
  
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenInfo));
};

export const getToken = (): TokenResponse | null => {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return null;
  
  try {
    const tokenInfo = JSON.parse(stored);
    
    // Check if token is expired
    if (tokenInfo.expires_at && Date.now() > tokenInfo.expires_at) {
      clearToken();
      return null;
    }
    
    return tokenInfo;
  } catch {
    clearToken();
    return null;
  }
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const storeUser = (user: GitHubUser) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getUser = (): GitHubUser | null => {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

// OAuth flow functions
export const initiateOAuth = async (): Promise<void> => {
  // Open a blank tab SYNCHRONOUSLY before any await — this preserves the
  // user-gesture chain required by iOS Safari. Mobile browsers block
  // window.open() calls made after an await.
  const authWindow = window.open('about:blank', '_blank');

  const { codeVerifier, codeChallenge } = await generatePKCE();

  // Store code verifier in both storages:
  // - localStorage survives cross-tab navigation and iOS Safari redirect quirks
  // - sessionStorage kept for any legacy paths
  localStorage.setItem('github_code_verifier', codeVerifier);
  sessionStorage.setItem('github_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: DEFAULT_CONFIG.clientId,
    redirect_uri: DEFAULT_CONFIG.redirectUri,
    scope: DEFAULT_CONFIG.scope,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  if (authWindow && !authWindow.closed) {
    // Navigate the already-open tab to GitHub
    authWindow.location.href = authUrl;
  } else {
    // Tab was blocked entirely — last-resort full-page redirect.
    // Save a flag so the app can restore the user's view after returning.
    localStorage.setItem('github_oauth_redirect_pending', 'true');
    window.location.href = authUrl;
    return new Promise(() => {}); // never resolves; page navigates away
  }

  // Wait for the callback tab to complete token exchange and write to localStorage
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('storage', storageHandler);
      reject(new Error('Authentication timed out'));
    }, 5 * 60 * 1000);

    const storageHandler = (event: StorageEvent) => {
      if (event.key === 'github_oauth_token' && event.newValue) {
        clearTimeout(timeout);
        window.removeEventListener('storage', storageHandler);
        resolve();
      } else if (event.key === 'github_oauth_error' && event.newValue) {
        clearTimeout(timeout);
        window.removeEventListener('storage', storageHandler);
        localStorage.removeItem('github_oauth_error');
        reject(new Error(event.newValue));
      }
    };

    window.addEventListener('storage', storageHandler);
  });
};

export const exchangeCodeForTokenWithProxy = async (code: string): Promise<TokenResponse> => {
  const codeVerifier =
    sessionStorage.getItem('github_code_verifier') ||
    localStorage.getItem('github_code_verifier');
  localStorage.removeItem('github_code_verifier');
  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }

  // Always route through the server-side endpoint (Vite plugin in dev, Express in production)
  const response = await fetch('/api/github-oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: import.meta.env.VITE_GITHUB_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Token exchange failed' }));
    throw new Error(errorData.error || 'Token exchange failed');
  }

  return response.json();
};

// GitHub API functions using OAuth token
export const getGitHubUser = async (token: string): Promise<GitHubUser> => {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user information');
  }
  
  return response.json();
};

export const getUserRepositories = async (token: string): Promise<GitHubRepo[]> => {
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch repositories');
  }
  
  return response.json();
};

export const getRepositoryBranches = async (token: string, owner: string, repo: string): Promise<string[]> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch branches');
  }
  
  const branches = await response.json();
  return branches.map((branch: any) => branch.name);
};

// Check if OAuth is properly configured
export const isOAuthConfigured = (): boolean => {
  // Only client ID is needed client-side; secret stays server-side
  return !!DEFAULT_CONFIG.clientId;
};

// Handle OAuth callback from popup
export const handleOAuthCallback = (): Promise<TokenResponse> => {
  return new Promise((resolve, reject) => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (error) {
      reject(new Error(`OAuth error: ${error}`));
      return;
    }
    
    if (!code) {
      reject(new Error('No authorization code received'));
      return;
    }
    
    exchangeCodeForTokenWithProxy(code)
      .then(resolve)
      .catch(reject);
  });
};
