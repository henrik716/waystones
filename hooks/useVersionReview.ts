import { useState, useEffect } from 'react';
import { DataModel } from '../types';
import { fetchModelHistory, fetchModelAtCommit, CommitInfo } from '../utils/githubService';
import { compareModels, getStructuredChanges } from '../utils/diffUtils';
import type { Translations } from '../i18n/index';

interface UseVersionReviewProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onSetBaseline: (model: DataModel) => void;
  t: Translations;
}

export const useVersionReview = ({
  model,
  baselineModel,
  githubConfig,
  onSetBaseline,
  t,
}: UseVersionReviewProps) => {
  const [reviewMode, setReviewMode] = useState(false);
  const [commitHistory, setCommitHistory] = useState<CommitInfo[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string>('');

  const changes = reviewMode ? compareModels(baselineModel, model, t) : [];
  const structuredChanges = reviewMode ? getStructuredChanges(changes) : null;

  const stats = {
    added: changes.filter((c) => c.type === 'added').length,
    modified: changes.filter((c) => c.type === 'modified').length,
    deleted: changes.filter((c) => c.type === 'deleted').length,
    total: changes.length,
  };

  useEffect(() => {
    if (
      reviewMode &&
      githubConfig.repo &&
      githubConfig.path &&
      commitHistory.length === 0
    ) {
      loadHistory();
    }
  }, [reviewMode, githubConfig]);

  const loadHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const history = await fetchModelHistory(
        githubConfig.token,
        githubConfig.repo,
        githubConfig.path,
        githubConfig.branch
      );
      setCommitHistory(history);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleCompareVersion = async (sha: string) => {
    setSelectedSha(sha);
    if (!sha) return;

    try {
      const historicalModel = await fetchModelAtCommit(
        githubConfig.token,
        githubConfig.repo,
        githubConfig.path,
        sha
      );
      if (historicalModel) {
        onSetBaseline(historicalModel);
      }
    } catch (e) {
      console.error('Failed to fetch historical model:', e);
    }
  };

  return {
    reviewMode,
    setReviewMode,
    commitHistory,
    isFetchingHistory,
    selectedSha,
    handleCompareVersion,
    changes,
    structuredChanges,
    stats,
  };
};
