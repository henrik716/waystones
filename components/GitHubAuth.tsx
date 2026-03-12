import React from 'react';
import { Github, LogOut, User, Settings, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useGitHubAuth } from '../hooks/useGitHubAuth';

interface GitHubAuthProps {
  onAuthChange?: (isAuthenticated: boolean, user?: any, token?: any) => void;
  showUserInfo?: boolean;
  compact?: boolean;
  t?: any;
}

const GitHubAuth: React.FC<GitHubAuthProps> = ({ 
  onAuthChange, 
  showUserInfo = true, 
  compact = false,
  t
}) => {
  const authTexts = t?.deploy?.oauth?.auth || {};
  const {
    isAuthenticated,
    user,
    token,
    isLoading,
    error,
    isConfigured,
    login,
    logout,
    clearError
  } = useGitHubAuth();

  // Notify parent of auth state changes
  React.useEffect(() => {
    if (onAuthChange) {
      onAuthChange(isAuthenticated, user, isAuthenticated ? token : null);
    }
  }, [isAuthenticated, user, token]); // Remove onAuthChange from dependencies

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
        {isAuthenticated ? (
          <div className="flex items-center gap-3 flex-1">
            {user?.avatar_url && (
              <img 
                src={user.avatar_url} 
                alt={user.login}
                className="w-8 h-8 rounded-full border-2 border-emerald-200"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{user?.name || user?.login}</p>
              <p className="text-xs text-slate-500">{authTexts.connected || 'Connected to GitHub'}</p>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-600 transition-colors"
              title={authTexts.disconnect || 'Disconnect GitHub'}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            disabled={isLoading || !isConfigured}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Github size={16} />
            )}
            {authTexts.connectGitHub || 'Connect GitHub'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Github className="text-slate-600" size={20} />
          <h3 className="font-semibold text-slate-800">GitHub Integration</h3>
        </div>
        
        {isAuthenticated && (
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle size={16} />
            <span className="text-sm">Connected</span>
          </div>
        )}
      </div>

      {/* Configuration Warning */}
      {!isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-amber-600 mt-0.5" size={16} />
            <div className="text-sm">
              <p className="font-medium text-amber-800">{authTexts.notConfigured || 'OAuth Not Configured'}</p>
              <p className="text-amber-700 mt-1">
                {authTexts.notConfiguredDesc || 'Set VITE_GITHUB_CLIENT_ID and VITE_GITHUB_CLIENT_SECRET environment variables to enable OAuth authentication.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="text-red-600 mt-0.5" size={16} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Authentication State */}
      {isAuthenticated && user ? (
        <div className="space-y-3">
          {/* User Info */}
          {showUserInfo && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <img
                src={user.avatar_url}
                alt={user.login}
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1">
                <p className="font-medium text-slate-800">
                  {user.name || user.login}
                </p>
                <p className="text-sm text-slate-600">@{user.login}</p>
                {user.email && (
                  <p className="text-xs text-slate-500">{user.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={logout}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
            >
              <LogOut size={16} />
              Disconnect
            </button>
            
            {!isConfigured && (
              <div className="flex items-center gap-2 px-4 py-2 text-slate-500">
                <Settings size={16} />
                <span className="text-sm">OAuth not configured</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Login Prompt */}
          <div className="text-center py-4">
            <Github className="mx-auto text-slate-400 mb-3" size={48} />
            <p className="text-slate-600 mb-4">
              Connect your GitHub account to enable repository integration
            </p>
          </div>

          {/* Login Button */}
          <button
            onClick={login}
            disabled={isLoading || !isConfigured}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Github size={18} />
                {authTexts.connectAccount || 'Connect GitHub Account'}
              </>
            )}
          </button>

          {/* Manual Token Fallback */}
          <div className="text-center">
            <p className="text-xs text-slate-500">
              Or use a personal access token in the deploy settings
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubAuth;
