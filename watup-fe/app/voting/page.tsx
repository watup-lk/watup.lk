'use client';

import { useEffect, useState } from 'react';
import { getVotingQueue, vote } from '@/lib/api';
import { SalarySubmission, VoteFilter } from '@/types';
import styles from './page.module.css';

const FILTERS: { value: VoteFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs-vote', label: 'Needs 1 More Vote' },
  { value: 'recently-approved', label: 'Recently Approved' },
  { value: 'reported', label: 'Reported' },
];

const MOCK: SalarySubmission[] = [
  {
    id: '1', role: 'Senior Backend Developer', company: 'Tech MNC', experienceLevel: 'senior',
    yearsOfExperience: 5, monthlySalaryLKR: 420000, country: 'Sri Lanka', currency: 'LKR',
    workType: 'Hybrid', status: 'PENDING', anonymize: true, upvotes: 3, downvotes: 0,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: '2', role: 'DevOps Engineer', company: 'Startup', experienceLevel: 'mid',
    yearsOfExperience: 3, monthlySalaryLKR: 380000, country: 'Sri Lanka', currency: 'LKR',
    workType: 'Remote', status: 'PENDING', anonymize: true, upvotes: 4, downvotes: 0,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: '3', role: 'React Developer', company: 'Agency', experienceLevel: 'mid',
    yearsOfExperience: 2, monthlySalaryLKR: 290000, country: 'Sri Lanka', currency: 'LKR',
    workType: 'Onsite', status: 'PENDING', anonymize: true, upvotes: 0, downvotes: 0,
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
  },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

export default function VotingPage() {
  const [filter, setFilter] = useState<VoteFilter>('all');
  const [items, setItems] = useState<SalarySubmission[]>(MOCK);
  const [voted, setVoted] = useState<Record<string, 'up' | 'down'>>({});

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) return;
    getVotingQueue(filter, token)
      .then(setItems)
      .catch(() => {/* use mock */});
  }, [filter]);

  async function handleVote(id: string, type: 'up' | 'down') {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }
    if (voted[id]) return;

    setVoted(v => ({ ...v, [id]: type }));
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        upvotes: type === 'up' ? item.upvotes + 1 : item.upvotes,
        downvotes: type === 'down' ? item.downvotes + 1 : item.downvotes,
      };
    }));

    try {
      await vote(id, type, token);
    } catch {
      // Revert on failure
      setVoted(v => { const n = { ...v }; delete n[id]; return n; });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Community Voting</h1>
          <p className={styles.subtitle}>Help verify salary data · Login required</p>
        </div>
        <button className={styles.filterBtn}>+ Submit Salary</button>
      </div>

      {/* Filter tabs */}
      <div className={styles.filterTabs}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`${styles.filterTab} ${filter === f.value ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Salary cards */}
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
                    {' · '}{item.yearsOfExperience} yrs
                    {' · '}{item.workType ?? 'Remote'}
                  </p>
                  <p className={styles.cardSalary}>
                    LKR {new Intl.NumberFormat('en-LK').format(item.monthlySalaryLKR)}
                    <span className={styles.salaryUnit}> /month gross</span>
                  </p>
                </div>

                <div className={styles.voteGroup}>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnUp} ${myVote === 'up' ? styles.votedUp : ''}`}
                    onClick={() => handleVote(item.id, 'up')}
                    disabled={!!myVote}
                  >▲</button>
                  <span className={styles.voteCount}>{totalVotes}</span>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnDown} ${myVote === 'down' ? styles.votedDown : ''}`}
                    onClick={() => handleVote(item.id, 'down')}
                    disabled={!!myVote}
                  >▼</button>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.cardActions}>
                  <button className={styles.reportBtn}>⚑ Report as fake</button>
                  <button className={styles.commentBtn}>☐ Comment</button>
                </div>
                <p className={styles.cardTime}>
                  Submitted {timeAgo(item.createdAt)} · {needed} to approve
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
