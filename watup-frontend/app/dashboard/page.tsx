'use client';

import { useEffect, useState } from 'react';
import { getDashboard } from '@/lib/api';
import { DashboardData, VoteResult } from '@/types';
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

const MOCK: DashboardData = {
  votesCast: 24,
  votesCastChange: 3,
  reportsFiled: 2,
  communityScore: 87,
  communityScoreChange: 5,
  avgSalaryLKR: 285000,
  avgSalaryChange: 12,
  pendingSubmissions: [
    { id: '1', role: 'Senior Backend Dev', company: '(Tech MNC)', monthlySalaryLKR: 420000, votesFor: 3, votesAgainst: 0, votesRequired: 5 },
    { id: '2', role: 'DevOps Engineer',    company: '(Startup)',   monthlySalaryLKR: 380000, votesFor: 4, votesAgainst: 0, votesRequired: 5 },
    { id: '3', role: 'React Developer',    company: '(Agency)',    monthlySalaryLKR: 290000, votesFor: 1, votesAgainst: 0, votesRequired: 5 },
    { id: '4', role: 'QA Lead',            company: '(Startup)',   monthlySalaryLKR: 350000, votesFor: 2, votesAgainst: 0, votesRequired: 5 },
  ],
  voteHistory: [
    { id: 'v1', role: 'Full Stack Dev',   timestamp: new Date(Date.now() - 2*3600000).toISOString(),   result: 'approved' },
    { id: 'v2', role: 'Data Analyst',     timestamp: new Date(Date.now() - 5*3600000).toISOString(),   result: 'flagged' },
    { id: 'v3', role: 'Cloud Architect',  timestamp: new Date(Date.now() - 24*3600000).toISOString(),  result: 'approved' },
    { id: 'v4', role: 'Junior Frontend',  timestamp: new Date(Date.now() - 48*3600000).toISOString(),  result: 'approved' },
    { id: 'v5', role: 'PM Lead',          timestamp: new Date(Date.now() - 72*3600000).toISOString(),  result: 'pending' },
  ],
  recentlyApproved: [
    { id: 'a1', role: 'Backend Dev',  monthlySalaryLKR: 450000, experienceLevel: 'senior', companyType: 'Colombo Startup' },
    { id: 'a2', role: 'ML Engineer',  monthlySalaryLKR: 520000, experienceLevel: 'mid',    companyType: 'Remote / SL' },
    { id: 'a3', role: 'SRE',          monthlySalaryLKR: 680000, experienceLevel: 'lead',   companyType: 'Tech MNC' },
    { id: 'a4', role: 'iOS Dev',      monthlySalaryLKR: 180000, experienceLevel: 'junior', companyType: 'Agency' },
  ],
};

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
  const [data, setData] = useState<DashboardData>(MOCK);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    getDashboard(token)
      .then(setData)
      .catch(() => {/* use mock */})
      .finally(() => setLoading(false));
  }, []);

  const d = data;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Your community activity overview</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnPrimary}>+ Submit Salary</button>
          <button className={styles.btnSecondary}>Search</button>
        </div>
      </div>

      {loading && <p className={styles.loadingNote}>Loading live data…</p>}

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>MY VOTES CAST</p>
          <p className={styles.statValue}>{d.votesCast}</p>
          <p className={styles.statChange}>+{d.votesCastChange} this week</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>REPORTS FILED</p>
          <p className={styles.statValue}>{d.reportsFiled}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>COMMUNITY SCORE</p>
          <p className={styles.statValue}>{d.communityScore}</p>
          <p className={styles.statChange}>+{d.communityScoreChange}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>AVG SL SALARY</p>
          <p className={`${styles.statValue} ${styles.statPrimary}`}>
            LKR {new Intl.NumberFormat('en-LK', { notation: 'compact' }).format(d.avgSalaryLKR)}
          </p>
          <p className={styles.statChange}>+{d.avgSalaryChange}% YoY</p>
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* Pending submissions */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>RECENT SUBMISSIONS (PENDING YOUR VOTE)</h2>
          <div className={styles.submissionList}>
            {d.pendingSubmissions.map(sub => {
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
        </div>

        {/* Vote history */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>MY VOTE HISTORY</h2>
          <div className={styles.historyList}>
            {d.voteHistory.map(v => (
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
        </div>
      </div>

      {/* Recently approved */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>RECENTLY APPROVED SALARIES</h2>
        <div className={styles.approvedGrid}>
          {d.recentlyApproved.map(s => (
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
      </div>
    </div>
  );
}
