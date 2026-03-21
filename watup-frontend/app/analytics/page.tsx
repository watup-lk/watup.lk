'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import { getAnalytics } from '@/lib/api';
import { AnalyticsData } from '@/types';
import styles from './page.module.css';

function fmt(n: number) {
  return new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 0 }).format(n);
}

// Tooltip for the role median bar chart — shows P25 / Median / P75
const RoleTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { role: string; median: number; p25: number; p75: number } }[] }) => {
  if (active && payload?.[0]) {
    const d = payload[0].payload;
    return (
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
      }}>
        <p style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: 6 }}>{d.role}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>P25 &nbsp;&nbsp; LKR {fmt(d.p25)}</p>
        <p style={{ color: 'var(--color-primary)' }}>Median  LKR {fmt(d.median)}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>P75 &nbsp;&nbsp; LKR {fmt(d.p75)}</p>
      </div>
    );
  }
  return null;
};

// Tooltip for trend line chart
const TrendTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload?.[0]) {
    return (
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
      }}>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
        <p style={{ color: 'var(--color-primary)' }}>LKR {new Intl.NumberFormat('en-LK').format(payload[0].value * 1000)}</p>
      </div>
    );
  }
  return null;
};

// Tooltip for the company bar chart — shows count + median + P25/P75
const CompanyTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { company: string; median: number; p25: number; p75: number; count: number } }[] }) => {
  if (active && payload?.[0]) {
    const d = payload[0].payload;
    return (
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
      }}>
        <p style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: 6 }}>{d.company}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>Entries &nbsp;{d.count}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>P25 &nbsp;&nbsp; LKR {fmt(d.p25)}</p>
        <p style={{ color: 'var(--color-primary)' }}>Median  LKR {fmt(d.median)}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>P75 &nbsp;&nbsp; LKR {fmt(d.p75)}</p>
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [country, setCountry] = useState('LK');
  const [role, setRole]       = useState('');
  const [year, setYear]       = useState(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAnalytics({ country, role: role || undefined, year })
      .then(setData)
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [country, role, year]);

  // Sort roles by median salary descending for a clear ranking view
  const roleChartData = [...(data?.byRole ?? [])]
    .sort((a, b) => b.medianSalaryLKR - a.medianSalaryLKR)
    .map(r => ({
      role:   r.role,
      median: r.medianSalaryLKR,
      p25:    r.p25SalaryLKR,
      p75:    r.p75SalaryLKR,
    }));

  const roleDomainMax = roleChartData.length
    ? Math.ceil(Math.max(...roleChartData.map(r => r.p75)) * 1.2)
    : 700000;

  const chartHeight = Math.max(280, roleChartData.length * 40);

  const trendData = (data?.trend ?? []).map(t => ({
    month:  t.month,
    median: t.medianLKR / 1000,
  }));

  const companyChartData = (data?.byCompany ?? []).map(c => ({
    company: c.company,
    median:  c.medianSalaryLKR,
    p25:     c.p25SalaryLKR,
    p75:     c.p75SalaryLKR,
    count:   c.count,
  }));

  const companyDomainMax = companyChartData.length
    ? Math.ceil(Math.max(...companyChartData.map(c => c.p75)) * 1.2)
    : 700000;

  const companyChartHeight = Math.max(240, companyChartData.length * 40);

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
            {roleChartData.map(r => (
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
              {data.medianChange !== 0 && (
                <p className={styles.statChange}>{data.medianChange > 0 ? '+' : ''}{data.medianChange}% vs last month</p>
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
            {/* ── Median salary by role ── */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>MEDIAN SALARY BY ROLE</h2>
              <p className={styles.panelSubtitle}>Sorted by median · hover for P25 / P75</p>
              {roleChartData.length === 0
                ? <p className={styles.loadingNote}>No role data available</p>
                : (
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <ComposedChart
                      layout="vertical"
                      data={roleChartData}
                      margin={{ top: 4, right: 72, left: 130, bottom: 4 }}
                    >
                      <XAxis
                        type="number"
                        domain={[0, roleDomainMax]}
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
                        tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="role"
                        tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                        width={125}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<RoleTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar
                        dataKey="median"
                        fill="var(--color-primary)"
                        fillOpacity={0.85}
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={true}
                        label={{
                          position: 'right',
                          fill: 'var(--color-text-muted)',
                          fontSize: 11,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter: (v: any) => v != null ? `${Math.round(Number(v) / 1000)}K` : '',
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            <div className={styles.rightCol}>
              {/* ── Monthly trend ── */}
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>SALARY TREND (MONTHLY MEDIAN)</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<TrendTooltip />} />
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

              {/* ── By experience level ── */}
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>BY EXPERIENCE LEVEL</h2>
                {data.byExperience.length === 0
                  ? <p className={styles.loadingNote}>No experience data available</p>
                  : (
                    <div className={styles.expList}>
                      {data.byExperience
                        .sort((a, b) => b.percentage - a.percentage)
                        .map(e => (
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

          {/* ── Top companies by median salary ── */}
          {companyChartData.length > 0 && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>TOP COMPANIES BY MEDIAN SALARY</h2>
              <p className={styles.panelSubtitle}>Top 10 · hover for P25 / P75 · filtered by current selection</p>
              <ResponsiveContainer width="100%" height={companyChartHeight}>
                <ComposedChart
                  layout="vertical"
                  data={companyChartData}
                  margin={{ top: 4, right: 72, left: 150, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    domain={[0, companyDomainMax]}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="company"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                    width={145}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CompanyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar
                    dataKey="median"
                    fill="var(--color-primary)"
                    fillOpacity={0.7}
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={true}
                    label={{
                      position: 'right',
                      fill: 'var(--color-text-muted)',
                      fontSize: 11,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter: (v: any) => v != null ? `${Math.round(Number(v) / 1000)}K` : '',
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
