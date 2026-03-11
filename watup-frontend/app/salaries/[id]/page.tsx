'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { vote } from '@/lib/api';
import { SalarySubmission } from '@/types';
import styles from './page.module.css';

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:8080';

const LEVEL_LABELS: Record<string, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal',
};

export default function SalaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [salary, setSalary]           = useState<SalarySubmission | null>(null);
  const [loading, setLoading]         = useState(true);
  const [voted, setVoted]             = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);
  const [error, setError]             = useState('');

  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
    : null;

  useEffect(() => {
    fetch(`${BFF_URL}/api/search/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setSalary)
      .catch(() => setError('Could not load salary entry.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleVote(type: 'UP' | 'DOWN') {
    if (!token || !salary || voted) return;
    setVoteLoading(true);
    try {
      await vote(salary.id, type, token);
      setSalary(prev => prev ? {
        ...prev,
        upvotes:   type === 'UP'   ? prev.upvotes + 1   : prev.upvotes,
        downvotes: type === 'DOWN' ? prev.downvotes + 1 : prev.downvotes,
      } : prev);
      setVoted(true);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Vote failed');
    } finally {
      setVoteLoading(false);
    }
  }

  if (loading) return <div className={styles.container}>Loading…</div>;
  if (error || !salary) return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>← Back to listings</Link>
      <p>{error || 'Entry not found.'}</p>
    </div>
  );

  const formattedSalary = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(salary.monthlySalaryLKR);

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>← Back to listings</Link>

      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <div className={styles.role}>{salary.role}</div>
            <div className={styles.company}>
              {salary.anonymize ? '(Company hidden)' : salary.company}
            </div>
          </div>
          <div className={styles.salary}>
            {formattedSalary} <small>/month</small>
          </div>
        </div>

        <div className={styles.meta}>
          <span className={styles.badge}>{salary.country}{salary.city ? `, ${salary.city}` : ''}</span>
          <span className={styles.badge}>{LEVEL_LABELS[salary.experienceLevel]}</span>
          <span className={styles.badge}>{salary.yearsOfExperience} yrs experience</span>
          <span className={`${styles.statusBadge} ${salary.status === 'APPROVED' ? styles.statusApproved : styles.statusPending}`}>
            {salary.status}
          </span>
        </div>

        <hr className={styles.divider} />

        <div className={styles.voteSection}>
          <h2>Is this salary trustworthy?</h2>
          <p>
            Your vote helps the community verify this submission.
            Once enough upvotes are received, it will be marked as <strong>APPROVED</strong>.
          </p>

          {token ? (
            <>
              <div className={styles.voteButtons}>
                <button
                  className={`${styles.voteBtn} ${styles.voteUp}`}
                  onClick={() => handleVote('UP')}
                  disabled={voted || voteLoading}
                >
                  ▲ Upvote ({salary.upvotes})
                </button>
                <button
                  className={`${styles.voteBtn} ${styles.voteDown}`}
                  onClick={() => handleVote('DOWN')}
                  disabled={voted || voteLoading}
                >
                  ▼ Downvote ({salary.downvotes})
                </button>
              </div>
              {voted && <p className={styles.voted}>Thanks for voting!</p>}
            </>
          ) : (
            <div className={styles.loginPrompt}>
              <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to vote on
              this submission. Current votes: ▲ {salary.upvotes} · ▼ {salary.downvotes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
