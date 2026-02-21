'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SalarySubmission } from '@/types';
import styles from './page.module.css';

// Mock – will be fetched from BFF by id
const MOCK: SalarySubmission = {
  id: '1',
  company: 'WSO2',
  role: 'Software Engineer',
  experienceLevel: 'mid',
  yearsOfExperience: 3,
  monthlySalaryLKR: 180000,
  country: 'Sri Lanka',
  city: 'Colombo',
  currency: 'LKR',
  status: 'PENDING',
  anonymize: false,
  upvotes: 12,
  downvotes: 1,
  createdAt: '2024-11-01',
};

const LEVEL_LABELS: Record<string, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal',
};

// In a real app this token comes from auth context / cookie
const mockToken: string | null = null;

export default function SalaryDetailPage() {
  const salary = MOCK; // TODO: fetch by params.id from BFF
  const [upvotes, setUpvotes] = useState(salary.upvotes);
  const [downvotes, setDownvotes] = useState(salary.downvotes);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  const formattedSalary = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(salary.monthlySalaryLKR);

  async function handleVote(type: 'up' | 'down') {
    if (!mockToken || voted) return;
    setLoading(true);
    try {
      // TODO: replace with vote(salary.id, type, mockToken) from lib/api
      await new Promise((r) => setTimeout(r, 500));
      if (type === 'up') setUpvotes((v) => v + 1);
      else setDownvotes((v) => v + 1);
      setVoted(true);
    } finally {
      setLoading(false);
    }
  }

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
          <span
            className={`${styles.statusBadge} ${
              salary.status === 'APPROVED' ? styles.statusApproved : styles.statusPending
            }`}
          >
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

          {mockToken ? (
            <>
              <div className={styles.voteButtons}>
                <button
                  className={`${styles.voteBtn} ${styles.voteUp}`}
                  onClick={() => handleVote('up')}
                  disabled={voted || loading}
                >
                  ▲ Upvote ({upvotes})
                </button>
                <button
                  className={`${styles.voteBtn} ${styles.voteDown}`}
                  onClick={() => handleVote('down')}
                  disabled={voted || loading}
                >
                  ▼ Downvote ({downvotes})
                </button>
              </div>
              {voted && <p className={styles.voted}>Thanks for voting!</p>}
            </>
          ) : (
            <div className={styles.loginPrompt}>
              <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to vote on
              this submission. Current votes: ▲ {upvotes} · ▼ {downvotes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
