import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  variant?: 'default' | 'primary' | 'warning' | 'danger';
}

export default function StatCard({ label, value, change, variant = 'default' }: StatCardProps) {
  const valueClass = {
    default: styles.value,
    primary: `${styles.value} ${styles.valuePrimary}`,
    warning: `${styles.value} ${styles.valueWarning}`,
    danger: `${styles.value} ${styles.valueDanger}`,
  }[variant];

  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={valueClass}>{value}</p>
      {change && <p className={styles.change}>{change}</p>}
    </div>
  );
}
