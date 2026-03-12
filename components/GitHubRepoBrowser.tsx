import React, { useState, useEffect } from 'react';
import {
  Github, Search, Filter, ChevronDown, ChevronRight,
  GitBranch, Users, Lock, Globe, Check, AlertCircle, Loader2,
  RefreshCw
} from 'lucide-react';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { GitHubRepo } from '../utils/oauthService';

interface GitHubRepoBrowserProps {
  onRepoSelect?: (repo: GitHubRepo, branch?: string) => void;
  selectedRepo?: string;
  selectedBranch?: string;
  showBranchSelection?: boolean;
  compact?: boolean;
  t?: any;
}

const GitHubRepoBrowser: React.FC<GitHubRepoBrowserProps> = ({
  onRepoSelect,
  selectedRepo,
  selectedBranch,
  showBranchSelection = true,
  compact = false,
  t
}) => {
  const repoTexts = t?.deploy?.oauth?.repoBrowser || {};
  const authTexts = t?.deploy?.oauth?.auth || {};
  const {
    isAuthenticated,
    user,
    token,
    isLoading,
    error,
    getUserRepos,
    getRepoBranches
  } = useGitHubAuth();

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'owner' | 'collaborator'>('all');
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState<Set<string>>(new Set());
  const [repoError, setRepoError] = useState<string | null>(null);

  // Load repositories when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      loadRepositories();
    } else {
      setRepos([]);
      setFilteredRepos([]);
    }
  }, [isAuthenticated, token]);

  // Auto-select first repository if none selected and repos are loaded
  useEffect(() => {
    if (repos.length > 0 && !selectedRepo && onRepoSelect) {
      // Smart selection: prefer user's own repos, then by recent activity
      const ownerRepos = repos.filter(repo => repo.owner.login === user?.login);
      const sortedRepos = ownerRepos.length > 0
        ? ownerRepos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        : repos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const firstRepo = sortedRepos[0];
      onRepoSelect(firstRepo);
      // Auto-expand the selected repository
      setExpandedRepos(new Set([firstRepo.full_name]));
    }
  }, [repos, selectedRepo, user, onRepoSelect]);

  // Filter repositories based on search and type
  useEffect(() => {
    let filtered = repos;

    // Filter by type
    if (filterType === 'owner') {
      filtered = filtered.filter(repo => repo.owner.login === user?.login);
    } else if (filterType === 'collaborator') {
      filtered = filtered.filter(repo => repo.owner.login !== user?.login);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(repo =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredRepos(filtered);
  }, [repos, searchQuery, filterType, user]);

  const loadRepositories = async () => {
    if (!isAuthenticated || !token) return;

    setLoadingRepos(true);
    setRepoError(null);

    try {
      const userRepos = await getUserRepos();
      setRepos(userRepos);
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : 'Failed to load repositories');
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadBranches = async (repo: GitHubRepo) => {
    if (!token) return;

    setLoadingBranches(prev => new Set(prev).add(repo.full_name));

    try {
      const repoBranches = await getRepoBranches(repo.owner.login, repo.name);
      setBranches(prev => ({
        ...prev,
        [repo.full_name]: repoBranches
      }));
    } catch (error) {
      console.error(`Failed to load branches for ${repo.full_name}:`, error);
    } finally {
      setLoadingBranches(prev => {
        const newSet = new Set(prev);
        newSet.delete(repo.full_name);
        return newSet;
      });
    }
  };

  const toggleRepoExpansion = (repoFullName: string) => {
    const newExpanded = new Set(expandedRepos);
    if (newExpanded.has(repoFullName)) {
      newExpanded.delete(repoFullName);
    } else {
      newExpanded.add(repoFullName);
      // Load branches if not already loaded
      const repo = repos.find(r => r.full_name === repoFullName);
      if (repo && !branches[repoFullName]) {
        loadBranches(repo);
      }
    }
    setExpandedRepos(newExpanded);
  };

  const handleRepoSelect = (repo: GitHubRepo, branch?: string) => {
    if (onRepoSelect) {
      onRepoSelect(repo, branch);
    }
  };

  const getRepoIcon = (repo: GitHubRepo) => {
    if (repo.private) {
      return <Lock size={16} className="text-amber-600" />;
    } else {
      return <Globe size={16} className="text-green-600" />;
    }
  };

  const getPermissionBadge = (repo: GitHubRepo) => {
    if (repo.permissions.admin) {
      return <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">Admin</span>;
    } else if (repo.permissions.push) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Write</span>;
    } else {
      return <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full">Read</span>;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
        <Github className="mx-auto text-slate-400 mb-3" size={48} />
        <p className="text-slate-600">{authTexts.connectToBrowseRepos || 'Connect your GitHub account to browse repositories'}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Welcome message when authenticated */}
        {repos.length === 0 && !loadingRepos && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Github size={16} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800">{authTexts.welcomeConnected || 'Great! You\'re connected to GitHub'}</p>
                <p className="text-xs text-emerald-600">{authTexts.loadingRepos || 'Loading your repositories...'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Repository selection when loaded */}
        {repos.length > 0 && (
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={repoTexts.searchPlaceholder || 'Search repositories...'}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Repository List */}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredRepos.map(repo => (
                <div
                  key={repo.id}
                  onClick={() => handleRepoSelect(repo)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedRepo === repo.full_name
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {getRepoIcon(repo)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{repo.name}</p>
                      <p className="text-xs text-slate-500 truncate">{repo.full_name}</p>
                    </div>
                    {getPermissionBadge(repo)}
                  </div>
                </div>
              ))}
            </div>

            {/* Branch selection for selected repo */}
            {selectedRepo && showBranchSelection && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                  <GitBranch size={16} />
                  <span className="font-medium">{repoTexts.branch || 'Branch:'}</span>
                </div>
                <select
                  value={selectedBranch}
                  onChange={(e) => onRepoSelect?.(repos.find(r => r.full_name === selectedRepo)!, e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {branches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loadingRepos && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-slate-400" />
              <span className="text-sm text-slate-600">{repoTexts.loading || 'Loading repositories...'}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Github className="text-slate-600" size={20} />
            <h3 className="font-semibold text-slate-800">Repositories</h3>
          </div>
          <button
            onClick={loadRepositories}
            disabled={loadingRepos}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <RefreshCw size={16} className={loadingRepos ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Repos</option>
              <option value="owner">My Repos</option>
              <option value="collaborator">Collaborator</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {(error || repoError) && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-red-600 mt-0.5" size={16} />
            <p className="text-sm text-red-800">{repoError || error}</p>
          </div>
        </div>
      )}

      {/* Repository List */}
      <div className="max-h-96 overflow-y-auto">
        {loadingRepos ? (
          <div className="p-8 text-center">
            <Loader2 size={24} className="animate-spin mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-600">Loading repositories...</p>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="p-8 text-center">
            <Github className="mx-auto text-slate-400 mb-3" size={48} />
            <p className="text-slate-600">
              {searchQuery ? 'No repositories found' : 'No repositories available'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRepos.map(repo => (
              <div key={repo.id} className="hover:bg-slate-50">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => showBranchSelection && toggleRepoExpansion(repo.full_name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getRepoIcon(repo)}
                      <div>
                        <p className="font-medium text-slate-800">{repo.name}</p>
                        <p className="text-sm text-slate-600">{repo.full_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getPermissionBadge(repo)}
                      {showBranchSelection && (
                        <ChevronRight
                          size={16}
                          className={`text-slate-400 transform transition-transform ${expandedRepos.has(repo.full_name) ? 'rotate-90' : ''
                            }`}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Branch Selection */}
                {showBranchSelection && expandedRepos.has(repo.full_name) && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 mt-3 mb-2">
                      <GitBranch size={16} className="text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">Branches</span>
                      {loadingBranches.has(repo.full_name) && (
                        <Loader2 size={14} className="animate-spin text-slate-400" />
                      )}
                    </div>

                    {branches[repo.full_name] ? (
                      <div className="space-y-1">
                        {branches[repo.full_name].map(branch => (
                          <button
                            key={branch}
                            onClick={() => handleRepoSelect(repo, branch)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 ${selectedRepo === repo.full_name && selectedBranch === branch
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'text-slate-700'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{branch}</span>
                              {branch === repo.default_branch && (
                                <span className="text-xs text-slate-500">default</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No branches loaded</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubRepoBrowser;
