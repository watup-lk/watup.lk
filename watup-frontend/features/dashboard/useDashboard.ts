'use client';

import { useEffect, useState } from 'react';
import { getDashboard } from '@/lib/api';
import { DashboardData } from '@/types';

export function useDashboard(token: string | null) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Please login to view your dashboard');
      return;
    }
    getDashboard(token)
      .then(setData)
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [token]);

  return { data, loading, error };
}
