'use client';

import Link from 'next/link';
import { useLingui } from '@lingui/react';
import { useVoting } from './useVoting';
import { formatNumber, timeAgo } from '@/utils/format';
import { VoteFilter } from '@/types';
import styles from './VotingView.module.css';

const FILTERS: { value: VoteFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'All' },
  { value: 'needs-vote', labelKey: 'Needs 1 More Vote' },
  { value: 'recently-approved', labelKey: 'Recently Approved' },
  { value: 'reported', labelKey: 'Reported' },
];

export default function VotingView() {
  const { _ } = useLingui();
  const { filter, setFilter, items, loading, error, voted, handleVote } = useVoting();

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{_('Community Voting')}</h1>
          <p className={styles.subtitle}>{_('Help verify salary data · Login required')}</p>
        </div>
        <Link href="/submit">
          <button className={styles.filterBtn}>{_('+ Submit Salary')}</button>
        </Link>
      </div>

      <div className={styles.filterTabs}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`${styles.filterTab} ${filter === f.value ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.labelKey}
          </button>
        ))}
      </div>

      {loading && <p className={styles.loadingNote}>{_('Loading…')}</p>}
      {error && <p className={styles.loadingNote}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className={styles.loadingNote}>{_('No submissions found')}</p>
      )}

      <div className={styles.list}>
        {items.map(item => {
          const myVote = voted[item.id];
          const totalVotes = item.upvotes - item.downvotes;
          const needed = Math.max(0, 5 - item.upvotes);

          return (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardLeft}>
                  <div className={styles.cardTitleRow}>
                    <h2 className={styles.cardRole}>{item.role}</h2>
                    <span className={`${styles.badge} ${styles.badgePending}`}>PENDING</span>
                  </div>
                  <p className={styles.cardMeta}>
                    {item.anonymize ? `(${item.company})` : item.company}
                    {' · '}{item.experienceLevel}
                    {' · '}{item.yearsOfExperience} {_('yrs')}
                    {' · '}{item.workType ?? 'Remote'}
                  </p>
                  <p className={styles.cardSalary}>
                    LKR {formatNumber(item.monthlySalaryLKR)}
                    <span className={styles.salaryUnit}> /month gross</span>
                  </p>
                </div>

                <div className={styles.voteGroup}>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnUp} ${myVote === 'UP' ? styles.votedUp : ''}`}
                    onClick={() => handleVote(item.id, 'UP')}
                    disabled={!!myVote}
                  >▲</button>
                  <span className={styles.voteCount}>{totalVotes}</span>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnDown} ${myVote === 'DOWN' ? styles.votedDown : ''}`}
                    onClick={() => handleVote(item.id, 'DOWN')}
                    disabled={!!myVote}
                  >▼</button>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.cardActions}>
                  <button className={styles.reportBtn}>{_('⚑ Report as fake')}</button>
                  <button className={styles.commentBtn}>{_('☐ Comment')}</button>
                </div>
                <p className={styles.cardTime}>
                  {_('Submitted')} {timeAgo(item.createdAt)} · {needed} {_('to approve')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
