'use client';

import { useEffect, useState } from 'react';
import { getVotingQueue, vote } from '@/lib/api';
import { SalarySubmission, VoteFilter } from '@/types';
import { getToken } from '@/hooks/useAuth';

export function useVoting() {
  const [filter, setFilter] = useState<VoteFilter>('all');
  const [items, setItems] = useState<SalarySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, 'UP' | 'DOWN'>>({});

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      setError('Login required to view voting queue');
      return;
    }
    setLoading(true);
    setError(null);
    getVotingQueue(filter, token)
      .then(setItems)
      .catch(() => setError('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleVote(id: string, type: 'UP' | 'DOWN') {
    const token = getToken();
    if (!token) { window.location.href = '/login'; return; }
    if (voted[id]) return;

    setVoted(v => ({ ...v, [id]: type }));
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        upvotes: type === 'UP' ? item.upvotes + 1 : item.upvotes,
        downvotes: type === 'DOWN' ? item.downvotes + 1 : item.downvotes,
      };
    }));

    try {
      await vote(id, type, token);
    } catch {
      setVoted(v => { const n = { ...v }; delete n[id]; return n; });
      setItems(prev => prev.map(item => {
        if (item.id !== id) return item;
        return {
          ...item,
          upvotes: type === 'UP' ? item.upvotes - 1 : item.upvotes,
          downvotes: type === 'DOWN' ? item.downvotes - 1 : item.downvotes,
        };
      }));
    }
  }

  return { filter, setFilter, items, loading, error, voted, handleVote };
}
