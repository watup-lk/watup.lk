'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';
import { useLingui } from '@lingui/react';
import { getAdminStats, moderateEntry } from '@/lib/api';
import { AdminData, K8sService, ModerationItem } from '@/types';
import StatCard from '@/components/StatCard/StatCard';
import { formatNumber } from '@/utils/format';
import { getToken } from '@/hooks/useAuth';
import styles from './AdminView.module.css';

const MOCK: AdminData = {
  totalUsers: 2341, totalUsersChange: 127, pendingReview: 43,
  approvedEntries: 1247, approvedEntriesChange: 89, reportsQueue: 7,
  k8sServices: [
    { name: 'frontend',     type: 'app',  cpuPercent: 12, memoryMB: 120,  status: 'healthy' },
    { name: 'bff-service',  type: 'app',  cpuPercent: 18, memoryMB: 256,  status: 'healthy' },
    { name: 'salary-svc',   type: 'app',  cpuPercent: 8,  memoryMB: 192,  status: 'healthy' },
    { name: 'identity-svc', type: 'app',  cpuPercent: 15, memoryMB: 210,  status: 'healthy' },
    { name: 'vote-svc',     type: 'app',  cpuPercent: 6,  memoryMB: 148,  status: 'healthy' },
    { name: 'search-svc',   type: 'app',  cpuPercent: 22, memoryMB: 288,  status: 'healthy' },
    { name: 'stats-svc',    type: 'app',  cpuPercent: 10, memoryMB: 195,  status: 'healthy' },
    { name: 'postgresql',   type: 'data', cpuPercent: 35, memoryMB: 512,  status: 'healthy' },
    { name: 'kafka',        type: 'msg',  cpuPercent: 28, memoryMB: 768,  status: 'healthy' },
    { name: 'prometheus',   type: 'mon',  cpuPercent: 14, memoryMB: 384,  status: 'healthy' },
  ],
  kafkaTopics: [
    { name: 'salary.submitted',    offset: 12847, lag: 0, ratePerMin: 3.2 },
    { name: 'vote.cast',           offset: 34291, lag: 2, ratePerMin: 8.7 },
    { name: 'submission.approved', offset: 1247,  lag: 0, ratePerMin: 1.1 },
    { name: 'user.registered',     offset: 2341,  lag: 0, ratePerMin: 0.4 },
  ],
  metrics: Array.from({ length: 20 }, (_, i) => ({
    time: i,
    requestsPerMin: 180 + Math.sin(i * 0.5) * 40 + Math.random() * 20,
    p95Latency: 320 + Math.sin(i * 0.3) * 60 + Math.random() * 30,
    errorRate: 1.2 + Math.sin(i * 0.7) * 0.8 + Math.random() * 0.5,
  })),
  moderationQueue: [
    { id: 'm1', role: 'CTO',      monthlySalaryLKR: 2500000, reason: 'Salary outlier' },
    { id: 'm2', role: 'Intern',   monthlySalaryLKR: 5000,    reason: 'Suspiciously low' },
    { id: 'm3', role: 'Engineer', monthlySalaryLKR: 350000,  reason: 'Duplicate entry' },
  ],
};

function K8sCard({ svc }: { svc: K8sService }) {
  return (
    <div className={styles.k8sCard}>
      <div className={styles.k8sInfo}>
        <span className={styles.k8sName}>{svc.name}</span>
        <span className={styles.k8sMeta}>{svc.type} · {svc.cpuPercent}% · {svc.memoryMB}Mi</span>
      </div>
      <span className={`${styles.statusDot} ${svc.status === 'healthy' ? styles.dotGreen : styles.dotRed}`} />
    </div>
  );
}

const MiniTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
        {payload[0].value.toFixed(1)}
      </div>
    );
  }
  return null;
};

export default function AdminView() {
  const { _ } = useLingui();
  const [data, setData] = useState<AdminData>(MOCK);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getAdminStats(token).then(setData).catch(() => {/* use mock */});
  }, []);

  async function handleModerate(item: ModerationItem) {
    const token = getToken();
    if (!token) return;
    setReviewed(prev => new Set(prev).add(item.id));
    try { await moderateEntry(item.id, 'reject', token); } catch { /* optimistic */ }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{_('Admin Panel')}</h1>
          <p className={styles.subtitle}>{_('System health · Moderation · Monitoring')}</p>
        </div>
        <button className={styles.actionBtn}>{_('Export Report')}</button>
      </div>

      <div className={styles.statsGrid}>
        <StatCard label={_('TOTAL USERS')} value={formatNumber(data.totalUsers)} change={`+${data.totalUsersChange} this month`} />
        <StatCard label={_('PENDING REVIEW')} value={data.pendingReview} variant="warning" />
        <StatCard label={_('APPROVED ENTRIES')} value={formatNumber(data.approvedEntries)} change={`+${data.approvedEntriesChange}`} />
        <StatCard label={_('REPORTS QUEUE')} value={data.reportsQueue} variant="danger" />
      </div>

      <div className={styles.midGrid}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{_('KUBERNETES CLUSTER STATUS')}</h2>
          <div className={styles.k8sGrid}>
            {data.k8sServices.map(svc => <K8sCard key={svc.name} svc={svc} />)}
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{_('SERVICE REQUEST METRICS (GRAFANA)')}</h2>
          {[
            { key: 'requestsPerMin', label: _('Requests/min — BFF Service'), color: 'var(--color-primary)' },
            { key: 'p95Latency', label: _('P95 Latency (ms) — All Services'), color: 'var(--color-warning)' },
            { key: 'errorRate', label: _('Error Rate % — Cluster'), color: 'var(--color-danger)' },
          ].map(({ key, label, color }) => (
            <div key={key} className={styles.metricBlock}>
              <p className={styles.metricLabel}>{label}</p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={data.metrics} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} />
                  <Tooltip content={<MiniTooltip />} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{_('KAFKA EVENT STREAM')}</h2>
          <div className={styles.kafkaList}>
            {data.kafkaTopics.map(topic => (
              <div key={topic.name} className={styles.kafkaRow}>
                <span className={styles.kafkaTopic}>{topic.name}</span>
                <div className={styles.kafkaMeta}>
                  <span>offset: {topic.offset.toLocaleString()}</span>
                  <span>lag: {topic.lag}</span>
                  <span>{topic.ratePerMin}/min</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{_('MODERATION QUEUE')}</h2>
          <div className={styles.modList}>
            {data.moderationQueue.map(item => (
              <div key={item.id} className={`${styles.modRow} ${reviewed.has(item.id) ? styles.modReviewed : ''}`}>
                <div className={styles.modInfo}>
                  <span className={styles.modRole}>{item.role} · LKR {formatNumber(item.monthlySalaryLKR)}</span>
                  <span className={styles.modReason}>{_('Reason:')} {item.reason}</span>
                </div>
                <button className={styles.reviewBtn} onClick={() => handleModerate(item)} disabled={reviewed.has(item.id)}>
                  {reviewed.has(item.id) ? _('Done') : _('REVIEW')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
