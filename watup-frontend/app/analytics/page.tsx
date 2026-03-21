'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  ReferenceLine,
} from 'recharts';
import { getAnalytics } from '@/lib/api';
import { AnalyticsData } from '@/types';
import styles from './page.module.css';

function fmt(n: number) {
  return new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 0 }).format(n);
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text)',
      }}>
        <p style={{ marginBottom: 4, color: 'var(--color-text-muted)' }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: 'var(--color-primary)' }}>
            LKR {new Intl.NumberFormat('en-LK').format(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState('LK');
  const [role, setRole] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAnalytics({ country, role: role || undefined, year })
      .then(setData)
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [country, role, year]);

  const roleChartData = (data?.byRole ?? []).map(r => ({
    role:       r.role,
    rangeStart: r.p25SalaryLKR / 1000,
    rangeSize:  (r.p75SalaryLKR - r.p25SalaryLKR) / 1000,
    median:     r.medianSalaryLKR / 1000,
    label:      `${Math.round(r.medianSalaryLKR / 1000)}K`,
  }));

  const trendData = (data?.trend ?? []).map(t => ({
    month:  t.month,
    median: t.medianLKR / 1000,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Salary Analytics</h1>
          <p className={styles.subtitle}>Based on approved &amp; verified data only</p>
        </div>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={country} onChange={e => setCountry(e.target.value)}>
            <option value="LK">Sri Lanka ▼</option>
            <option value="Global">Global</option>
          </select>
          <select className={styles.filterSelect} value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All Roles ▼</option>
            {(data?.byRole ?? []).map(r => (
              <option key={r.role} value={r.role}>{r.role}</option>
            ))}
          </select>
          <select className={styles.filterSelect} value={year} onChange={e => setYear(Number(e.target.value))}>
            <option value={new Date().getFullYear()}>{new Date().getFullYear()} ▼</option>
            <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
          </select>
        </div>
      </div>

      {loading && <p className={styles.loadingNote}>Loading…</p>}
      {error   && <p className={styles.loadingNote}>{error}</p>}

      {data && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>MEDIAN SALARY</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>LKR {fmt(data.medianSalaryLKR)}</p>
              {data.medianChange > 0 && (
                <p className={styles.statChange}>+{data.medianChange}% vs last year</p>
              )}
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>P25 (25TH %)</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>LKR {fmt(data.p25SalaryLKR)}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>P75 (75TH %)</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>LKR {fmt(data.p75SalaryLKR)}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>APPROVED ENTRIES</p>
              <p className={styles.statValue}>{data.approvedEntries.toLocaleString()}</p>
              {data.approvedEntriesChange > 0 && (
                <p className={styles.statChange}>+{data.approvedEntriesChange} this month</p>
              )}
            </div>
          </div>

          <div className={styles.chartsGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>SALARY DISTRIBUTION BY ROLE (APPROVED DATA)</h2>
              {roleChartData.length === 0
                ? <p className={styles.loadingNote}>No role data available</p>
                : (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart
                      layout="vertical"
                      data={roleChartData}
                      margin={{ top: 8, right: 70, left: 100, bottom: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="role" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} width={95} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="rangeStart" stackId="a" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="rangeSize" stackId="a" fill="var(--color-primary)" fillOpacity={0.5} radius={[0, 4, 4, 0]} isAnimationActive={true} />
                      <ReferenceLine x={0} stroke="var(--color-border)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )
              }
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ background: 'var(--color-primary)', opacity: 0.5 }} />
                  P25-P75 Range
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendLine} />
                  Median
                </span>
              </div>
            </div>

            <div className={styles.rightCol}>
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>SALARY TREND (MONTHLY MEDIAN)</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="median"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--color-primary)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>BY EXPERIENCE LEVEL</h2>
                {data.byExperience.length === 0
                  ? <p className={styles.loadingNote}>No experience data available</p>
                  : (
                    <div className={styles.expList}>
                      {data.byExperience.map(e => (
                        <div key={e.level} className={styles.expRow}>
                          <span className={styles.expLabel}>{e.label}</span>
                          <div className={styles.expBar}>
                            <div
                              className={styles.expFill}
                              style={{ width: `${e.percentage}%`, background: e.color }}
                            />
                          </div>
                          <span className={styles.expPct}>{e.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
