'use client';

import Link from 'next/link';
import { useLingui } from '@lingui/react';
import { useAuth } from '@/hooks/useAuth';
import { useDashboard } from './useDashboard';
import { formatSalary, formatSalaryCompact, timeAgo } from '@/utils/format';
import StatCard from '@/components/StatCard/StatCard';
import { VoteResult } from '@/types';
import styles from './DashboardView.module.css';

function resultBadge(result: VoteResult, styles: Record<string, string>) {
  const map: Record<VoteResult, { label: string; cls: string }> = {
    approved: { label: 'APPROVED', cls: styles.badgeApproved },
    flagged:  { label: 'FLAGGED',  cls: styles.badgeFlagged },
    pending:  { label: 'PENDING',  cls: styles.badgePending },
  };
  const { label, cls } = map[result];
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

export default function DashboardView() {
  const { _ } = useLingui();
  const { token } = useAuth();
  const { data, loading, error } = useDashboard(token);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{token ? _('Welcome back') : _('Welcome to Watup Dashboard')}</h1>
          <p className={styles.subtitle}>{_('Your community activity overview')}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/submit"><button className={styles.btnPrimary}>{_('+ Submit Salary')}</button></Link>
        </div>
      </div>

      {loading && <p className={styles.loadingNote}>{_('Loading…')}</p>}
      {error && <p className={styles.loadingNote}>{error}</p>}

      {data && (
        <>
          <div className={styles.statsGrid}>
            <StatCard
              label={_('MY VOTES CAST')}
              value={data.votesCast}
              change={data.votesCastChange > 0 ? `+${data.votesCastChange} ${_('this week')}` : undefined}
            />
            <StatCard
              label={_('REPORTS FILED')}
              value={data.reportsFiled}
            />
            <StatCard
              label={_('COMMUNITY SCORE')}
              value={data.communityScore}
              change={data.communityScoreChange > 0 ? `+${data.communityScoreChange}` : undefined}
            />
            <StatCard
              label={_('AVG SL SALARY')}
              value={formatSalaryCompact(data.avgSalaryLKR)}
              change={data.avgSalaryChange > 0 ? `+${data.avgSalaryChange}% YoY` : undefined}
              variant="primary"
            />
          </div>

          <div className={styles.mainGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{_('RECENT SUBMISSIONS (PENDING YOUR VOTE)')}</h2>
              {data.pendingSubmissions.length === 0
                ? <p className={styles.loadingNote}>{_('No pending submissions')}</p>
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

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{_('MY VOTE HISTORY')}</h2>
              {data.voteHistory.length === 0
                ? <p className={styles.loadingNote}>{_('No votes yet')}</p>
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
                        {resultBadge(v.result, styles)}
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{_('RECENTLY APPROVED SALARIES')}</h2>
            {data.recentlyApproved.length === 0
              ? <p className={styles.loadingNote}>{_('No approved salaries yet')}</p>
              : (
                <div className={styles.approvedGrid}>
                  {data.recentlyApproved.map(s => (
                    <div key={s.id} className={styles.approvedCard}>
                      <p className={styles.approvedSalary}>{formatSalaryCompact(s.monthlySalaryLKR)}</p>
                      <p className={styles.approvedRole}>{s.role}</p>
                      <p className={styles.approvedMeta}>
                        {s.experienceLevel.charAt(0).toUpperCase() + s.experienceLevel.slice(1)} · {s.companyType}
                      </p>
                      <span className={`${styles.badge} ${styles.badgeApproved}`}>{_('APPROVED')}</span>
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
