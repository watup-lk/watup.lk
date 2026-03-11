'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboard } from '@/lib/api';
import { DashboardData, VoteResult } from '@/types';
import SearchModal from '@/components/SearchModal/SearchModal';
import styles from './page.module.css';

function formatSalary(n: number) {
  return `LKR ${new Intl.NumberFormat('en-LK').format(n)}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

function resultBadge(result: VoteResult) {
  const map: Record<VoteResult, { label: string; cls: string }> = {
    approved: { label: 'APPROVED', cls: styles.badgeApproved },
    flagged:  { label: 'FLAGGED',  cls: styles.badgeFlagged },
    pending:  { label: 'PENDING',  cls: styles.badgePending },
  };
  const { label, cls } = map[result];
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) {
      setLoading(false);
      setError('Not logged in');
      return;
    }
    getDashboard(token)
      .then(setData)
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Your community activity overview</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/submit"><button className={styles.btnPrimary}>+ Submit Salary</button></Link>
          <button className={styles.btnSecondary} onClick={() => setSearchOpen(true)}>Search</button>
        </div>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      {loading && <p className={styles.loadingNote}>Loading…</p>}
      {error && <p className={styles.loadingNote}>{error}</p>}

      {data && (
        <>
          {/* Stat cards */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>MY VOTES CAST</p>
              <p className={styles.statValue}>{data.votesCast}</p>
              {data.votesCastChange > 0 && (
                <p className={styles.statChange}>+{data.votesCastChange} this week</p>
              )}
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>REPORTS FILED</p>
              <p className={styles.statValue}>{data.reportsFiled}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>COMMUNITY SCORE</p>
              <p className={styles.statValue}>{data.communityScore}</p>
              {data.communityScoreChange > 0 && (
                <p className={styles.statChange}>+{data.communityScoreChange}</p>
              )}
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>AVG SL SALARY</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>
                LKR {new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(data.avgSalaryLKR)}
              </p>
              {data.avgSalaryChange > 0 && (
                <p className={styles.statChange}>+{data.avgSalaryChange}% YoY</p>
              )}
            </div>
          </div>

          <div className={styles.mainGrid}>
            {/* Pending submissions */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>RECENT SUBMISSIONS (PENDING YOUR VOTE)</h2>
              {data.pendingSubmissions.length === 0
                ? <p className={styles.loadingNote}>No pending submissions</p>
                : (
                  <div className={styles.submissionList}>
                    {data.pendingSubmissions.map(sub => {
                      const pct = (sub.votesFor / sub.votesRequired) * 100;
                      return (
                        <div key={sub.id} className={styles.submissionRow}>
                          <div className={styles.submissionInfo}>
                            <span className={styles.submissionRole}>{sub.role}</span>
                            <span className={styles.submissionMeta}>{sub.company} · {formatSalary(sub.monthlySalaryLKR)}</span>
                          </div>
                          <div className={styles.submissionActions}>
                            <span className={styles.voteProgress}>{sub.votesFor}/{sub.votesRequired}</span>
                            <div className={styles.progressBar}>
                              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                            </div>
                            <button className={styles.voteUp}>▲</button>
                            <button className={styles.voteDown}>▼</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            {/* Vote history */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>MY VOTE HISTORY</h2>
              {data.voteHistory.length === 0
                ? <p className={styles.loadingNote}>No votes yet</p>
                : (
                  <div className={styles.historyList}>
                    {data.voteHistory.map(v => (
                      <div key={v.id} className={styles.historyRow}>
                        <div className={styles.historyIcon}>
                          {v.result === 'approved' ? '▲' : v.result === 'flagged' ? '▼' : '►'}
                        </div>
                        <div className={styles.historyInfo}>
                          <span className={styles.historyRole}>{v.role}</span>
                          <span className={styles.historyTime}>{timeAgo(v.timestamp)}</span>
                        </div>
                        {resultBadge(v.result)}
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          {/* Recently approved */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>RECENTLY APPROVED SALARIES</h2>
            {data.recentlyApproved.length === 0
              ? <p className={styles.loadingNote}>No approved salaries yet</p>
              : (
                <div className={styles.approvedGrid}>
                  {data.recentlyApproved.map(s => (
                    <div key={s.id} className={styles.approvedCard}>
                      <p className={styles.approvedSalary}>
                        LKR {new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(s.monthlySalaryLKR)}
                      </p>
                      <p className={styles.approvedRole}>{s.role}</p>
                      <p className={styles.approvedMeta}>
                        {s.experienceLevel.charAt(0).toUpperCase() + s.experienceLevel.slice(1)} · {s.companyType}
                      </p>
                      <span className={`${styles.badge} ${styles.badgeApproved}`}>APPROVED</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </>
      )}
    </div>
  );
}
