'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboard, getAnalytics, searchSalaries } from '@/lib/api';
import { AnalyticsData, DashboardData, SearchResult, VoteResult } from '@/types';
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
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [personal, setPersonal] = useState<DashboardData | null>(null);
  const [approvedSalaries, setApprovedSalaries] = useState<SearchResult[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    setIsLoggedIn(!!token);

    const fetchAnalytics = getAnalytics({}).then(setAnalytics).catch(() => null);
    const fetchApproved = searchSalaries({ status: 'APPROVED' }).then(setApprovedSalaries).catch(() => null);
    const fetchPersonal = token
      ? getDashboard(token).then(setPersonal).catch(() => null)
      : Promise.resolve();

    Promise.all([fetchAnalytics, fetchApproved, fetchPersonal]).finally(() => setLoading(false));
  }, []);
console.log(approvedSalaries)
  const avgSalaryLKR = analytics?.medianSalaryLKR ?? 0;
  const avgSalaryChange = analytics?.medianChange ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{isLoggedIn ? 'Welcome back' : 'Community Dashboard'}</h1>
          <p className={styles.subtitle}>
            {isLoggedIn ? 'Your community activity overview' : 'Sri Lanka salary transparency — public view'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/submit"><button className={styles.btnPrimary}>+ Submit Salary</button></Link>
          <button className={styles.btnSecondary} onClick={() => setSearchOpen(true)}>Search</button>
        </div>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      {!isLoggedIn && (
        <div className={styles.guestBanner}>
          <Link href="/login">Log in</Link> to see your personal stats, vote history, and pending submissions.
        </div>
      )}

      {loading && <p className={styles.loadingNote}>Loading…</p>}

      {!loading && (
        <>
          {/* Stat cards */}
          <div className={styles.statsGrid}>
            {isLoggedIn ? (
              <>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>MY VOTES CAST</p>
                  <p className={styles.statValue}>{personal?.votesCast ?? '—'}</p>
                  {personal && personal.votesCastChange > 0 && (
                    <p className={styles.statChange}>+{personal.votesCastChange} this week</p>
                  )}
                </div>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>REPORTS FILED</p>
                  <p className={styles.statValue}>{personal?.reportsFiled ?? '—'}</p>
                </div>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>COMMUNITY SCORE</p>
                  <p className={styles.statValue}>{personal?.communityScore ?? '—'}</p>
                  {personal && personal.communityScoreChange > 0 && (
                    <p className={styles.statChange}>+{personal.communityScoreChange}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>APPROVED ENTRIES</p>
                  <p className={`${styles.statValue} ${styles.statPrimary}`}>
                    {analytics?.approvedEntries ?? '—'}
                  </p>
                  {analytics && analytics.approvedEntriesChange > 0 && (
                    <p className={styles.statChange}>+{analytics.approvedEntriesChange} recently</p>
                  )}
                </div>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>MEDIAN SALARY</p>
                  <p className={`${styles.statValue} ${styles.statPrimary}`}>
                    {analytics?.medianSalaryLKR
                      ? `LKR ${new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(analytics.medianSalaryLKR)}`
                      : '—'}
                  </p>
                  {avgSalaryChange > 0 && (
                    <p className={styles.statChange}>+{avgSalaryChange}% YoY</p>
                  )}
                </div>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>P25 SALARY</p>
                  <p className={styles.statValue}>
                    {analytics?.p25SalaryLKR
                      ? `LKR ${new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(analytics.p25SalaryLKR)}`
                      : '—'}
                  </p>
                </div>
              </>
            )}
            <div className={styles.statCard}>
              <p className={styles.statLabel}>AVG SL SALARY</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>
                {avgSalaryLKR > 0
                  ? `LKR ${new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(avgSalaryLKR)}`
                  : '—'}
              </p>
              {avgSalaryChange > 0 && (
                <p className={styles.statChange}>+{avgSalaryChange}% YoY</p>
              )}
            </div>
          </div>

          <div className={styles.mainGrid}>
            {/* Pending submissions */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>RECENT SUBMISSIONS (PENDING YOUR VOTE)</h2>
              {!isLoggedIn ? (
                <p className={styles.loadingNote}>
                  <Link href="/login">Log in</Link> to vote on pending submissions.
                </p>
              ) : personal && personal.pendingSubmissions.length === 0 ? (
                <p className={styles.loadingNote}>No pending submissions</p>
              ) : personal ? (
                <div className={styles.submissionList}>
                  {personal.pendingSubmissions.map(sub => {
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
              ) : (
                <p className={styles.loadingNote}>No pending submissions</p>
              )}
            </div>

            {/* Vote history */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>MY VOTE HISTORY</h2>
              {!isLoggedIn ? (
                <p className={styles.loadingNote}>
                  <Link href="/login">Log in</Link> to see your vote history.
                </p>
              ) : personal && personal.voteHistory.length === 0 ? (
                <p className={styles.loadingNote}>No votes yet</p>
              ) : personal ? (
                <div className={styles.historyList}>
                  {personal.voteHistory.map(v => (
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
              ) : (
                <p className={styles.loadingNote}>No votes yet</p>
              )}
            </div>
          </div>

          {/* Recently approved — public, sourced from /api/search?status=APPROVED */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>RECENTLY APPROVED SALARIES</h2>
            {approvedSalaries.length === 0
              ? <p className={styles.loadingNote}>No approved salaries yet</p>
              : (
                <div className={styles.approvedGrid}>
                  {approvedSalaries.map(s => (
                    <div key={s.id} className={styles.approvedCard}>
                      <p className={styles.approvedSalary}>
                        LKR {new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(s.monthlySalaryLKR)}
                      </p>
                      <p className={styles.approvedRole}>{s.role}</p>
                      {s.company && (
                        <p className={styles.approvedCompany}>{s.company}</p>
                      )}
                      <p className={styles.approvedMeta}>
                        {s.experienceLevel
                          ? s.experienceLevel.charAt(0).toUpperCase() + s.experienceLevel.slice(1)
                          : '—'
                        }{' · '}{s.workType ?? s.country}
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
