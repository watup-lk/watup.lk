import Link from 'next/link';
import { SalarySubmission } from '@/types';
import styles from './SalaryCard.module.css';

interface Props {
  salary: SalarySubmission;
}

const LEVEL_LABELS: Record<string, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal',
};

export default function SalaryCard({ salary }: Props) {
  const formattedSalary = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(salary.monthlySalaryLKR);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.role}>{salary.role}</div>
          <div className={styles.company}>
            {salary.anonymize ? '(Company hidden)' : salary.company}
          </div>
        </div>
        <div className={styles.salary}>{formattedSalary}<small>/mo</small></div>
      </div>

      <div className={styles.meta}>
        <span className={styles.badge}>{salary.country}</span>
        <span className={styles.badge}>{LEVEL_LABELS[salary.experienceLevel]}</span>
        <span className={styles.badge}>{salary.yearsOfExperience} yrs exp</span>
        <span
          className={`${styles.statusBadge} ${
            salary.status === 'APPROVED' ? styles.statusApproved : styles.statusPending
          }`}
        >
          {salary.status}
        </span>
      </div>

      <div className={styles.footer}>
        <div className={styles.votes}>
          <span className={styles.voteUp}>▲ {salary.upvotes}</span>
          <span className={styles.voteDown}>▼ {salary.downvotes}</span>
        </div>
        <Link href={`/salaries/${salary.id}`} className={styles.viewLink}>
          View &amp; Vote →
        </Link>
      </div>
    </div>
  );
}
