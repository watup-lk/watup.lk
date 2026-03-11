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

const MOCK_DATA: AnalyticsData = {
  medianSalaryLKR: 320000,
  p25SalaryLKR: 180000,
  p75SalaryLKR: 520000,
  approvedEntries: 1247,
  approvedEntriesChange: 89,
  medianChange: 8,
  byRole: [
    { role: 'Backend Developer',  country: 'LK', count: 120, averageSalaryLKR: 350000, medianSalaryLKR: 350000, p25SalaryLKR: 240000, p75SalaryLKR: 470000 },
    { role: 'Frontend Developer', country: 'LK', count: 95,  averageSalaryLKR: 280000, medianSalaryLKR: 280000, p25SalaryLKR: 180000, p75SalaryLKR: 400000 },
    { role: 'DevOps / SRE',       country: 'LK', count: 60,  averageSalaryLKR: 400000, medianSalaryLKR: 400000, p25SalaryLKR: 260000, p75SalaryLKR: 530000 },
    { role: 'Data Engineer',      country: 'LK', count: 45,  averageSalaryLKR: 380000, medianSalaryLKR: 380000, p25SalaryLKR: 250000, p75SalaryLKR: 510000 },
    { role: 'QA Engineer',        country: 'LK', count: 80,  averageSalaryLKR: 220000, medianSalaryLKR: 220000, p25SalaryLKR: 140000, p75SalaryLKR: 310000 },
    { role: 'Mobile Developer',   country: 'LK', count: 55,  averageSalaryLKR: 300000, medianSalaryLKR: 300000, p25SalaryLKR: 200000, p75SalaryLKR: 420000 },
  ],
  trend: [
    { month: 'Jan', medianLKR: 295000 },
    { month: 'Feb', medianLKR: 298000 },
    { month: 'Mar', medianLKR: 302000 },
    { month: 'Apr', medianLKR: 299000 },
    { month: 'May', medianLKR: 308000 },
    { month: 'Jun', medianLKR: 312000 },
    { month: 'Jul', medianLKR: 315000 },
    { month: 'Aug', medianLKR: 318000 },
    { month: 'Sep', medianLKR: 316000 },
    { month: 'Oct', medianLKR: 320000 },
    { month: 'Nov', medianLKR: 325000 },
    { month: 'Dec', medianLKR: 332000 },
  ],
  byExperience: [
    { level: 'junior',    label: 'Junior (0-2y)', percentage: 22, color: '#3fb950' },
    { level: 'mid',       label: 'Mid (2-5y)',    percentage: 38, color: '#00d4d4' },
    { level: 'senior',    label: 'Senior (5-8y)', percentage: 28, color: '#bc8cff' },
    { level: 'lead',      label: 'Lead (8y+)',    percentage: 12, color: '#e3b341' },
  ],
};

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
  const [data, setData] = useState<AnalyticsData>(MOCK_DATA);
  const [country, setCountry] = useState('Sri Lanka');
  const [role, setRole] = useState('');
  const [year, setYear] = useState(2025);

  useEffect(() => {
    getAnalytics({ country, role: role || undefined, year })
      .then(setData)
      .catch(() => {/* use mock */});
  }, [country, role, year]);

  // Transform byRole for horizontal bar chart
  const roleChartData = data.byRole.map(r => ({
    role: r.role,
    rangeStart: r.p25SalaryLKR / 1000,
    rangeSize: (r.p75SalaryLKR - r.p25SalaryLKR) / 1000,
    median: r.medianSalaryLKR / 1000,
    label: `${Math.round(r.medianSalaryLKR / 1000)}K`,
  }));

  const trendData = data.trend.map(t => ({
    month: t.month,
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
            <option value="Sri Lanka">Sri Lanka ▼</option>
            <option value="Global">Global</option>
          </select>
          <select className={styles.filterSelect} value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All Roles ▼</option>
            {MOCK_DATA.byRole.map(r => <option key={r.role} value={r.role}>{r.role}</option>)}
          </select>
          <select className={styles.filterSelect} value={year} onChange={e => setYear(Number(e.target.value))}>
            <option value={2025}>2025 ▼</option>
            <option value={2024}>2024</option>
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>MEDIAN SALARY</p>
          <p className={`${styles.statValue} ${styles.statPrimary}`}>LKR {fmt(data.medianSalaryLKR)}</p>
          <p className={styles.statChange}>+{data.medianChange}% vs last year</p>
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
          <p className={styles.statChange}>+{data.approvedEntriesChange} this month</p>
        </div>
      </div>

      {/* Charts */}
      <div className={styles.chartsGrid}>
        {/* Role distribution */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>SALARY DISTRIBUTION BY ROLE (APPROVED DATA)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              layout="vertical"
              data={roleChartData}
              margin={{ top: 8, right: 70, left: 100, bottom: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="role" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} width={95} />
              <Tooltip content={<CustomTooltip />} />
              {/* Invisible base bar to position range */}
              <Bar dataKey="rangeStart" stackId="a" fill="transparent" isAnimationActive={false} />
              {/* Visible range bar */}
              <Bar dataKey="rangeSize" stackId="a" fill="var(--color-primary)" fillOpacity={0.5} radius={[0, 4, 4, 0]} isAnimationActive={true}>
              </Bar>
              <ReferenceLine x={0} stroke="var(--color-border)" />
            </ComposedChart>
          </ResponsiveContainer>
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

        {/* Right column */}
        <div className={styles.rightCol}>
          {/* Trend */}
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

          {/* Experience breakdown */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>BY EXPERIENCE LEVEL</h2>
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
          </div>
        </div>
      </div>
    </div>
  );
}
