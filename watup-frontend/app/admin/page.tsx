'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from 'recharts';
import { getAdminStats, moderateEntry } from '@/lib/api';
import { AdminData, K8sService, ModerationItem } from '@/types';
import styles from './page.module.css';

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
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-primary)',
      }}>
        {payload[0].value.toFixed(1)}
      </div>
    );
  }
  return null;
};


export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    getAdminStats(token)
      .then(setData)
      .catch(() => setError('Failed to load admin data'))
      .finally(() => setLoading(false));
  }, []);

  async function handleModerate(item: ModerationItem) {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) return;
    setReviewed(prev => new Set(prev).add(item.id));
    try {
      await moderateEntry(item.id, 'reject', token);
    } catch {
      // optimistic update stands
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Admin Panel</h1>
          <p className={styles.subtitle}>System health · Moderation · Monitoring</p>
        </div>
        <button className={styles.actionBtn}>Export Report</button>
      </div>

      {loading && <p className={styles.loadingNote}>Loading…</p>}
      {error && !loading && <p className={styles.loadingNote}>{error}</p>}

      {!loading && data && (
        <>
          {/* Summary stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>TOTAL USERS</p>
              <p className={styles.statValue}>{data.totalUsers.toLocaleString()}</p>
              {data.totalUsersChange > 0 && (
                <p className={styles.statChange}>+{data.totalUsersChange} this month</p>
              )}
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>PENDING REVIEW</p>
              <p className={`${styles.statValue} ${styles.statWarning}`}>{data.pendingReview}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>APPROVED ENTRIES</p>
              <p className={styles.statValue}>{data.approvedEntries.toLocaleString()}</p>
              {data.approvedEntriesChange > 0 && (
                <p className={styles.statChange}>+{data.approvedEntriesChange}</p>
              )}
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>REPORTS QUEUE</p>
              <p className={`${styles.statValue} ${styles.statDanger}`}>{data.reportsQueue}</p>
            </div>
          </div>

          {/* Middle row: K8s + Grafana */}
          <div className={styles.midGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>KUBERNETES CLUSTER STATUS</h2>
              {data.k8sServices.length === 0
                ? <p className={styles.loadingNote}>No service data available</p>
                : (
                  <div className={styles.k8sGrid}>
                    {data.k8sServices.map(svc => <K8sCard key={svc.name} svc={svc} />)}
                  </div>
                )
              }
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>SERVICE REQUEST METRICS (GRAFANA)</h2>
              {data.metrics.length === 0
                ? <p className={styles.loadingNote}>No metrics data available</p>
                : (
                  <>
                    <div className={styles.metricBlock}>
                      <p className={styles.metricLabel}>Requests/min — BFF Service</p>
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={data.metrics} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <Line type="monotone" dataKey="requestsPerMin" stroke="var(--color-primary)" strokeWidth={1.5} dot={false} />
                          <Tooltip content={<MiniTooltip />} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className={styles.metricBlock}>
                      <p className={styles.metricLabel}>P95 Latency (ms) — All Services</p>
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={data.metrics} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <Line type="monotone" dataKey="p95Latency" stroke="var(--color-warning)" strokeWidth={1.5} dot={false} />
                          <Tooltip content={<MiniTooltip />} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className={styles.metricBlock}>
                      <p className={styles.metricLabel}>Error Rate % — Cluster</p>
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={data.metrics} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <Line type="monotone" dataKey="errorRate" stroke="var(--color-danger)" strokeWidth={1.5} dot={false} />
                          <Tooltip content={<MiniTooltip />} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )
              }
            </div>
          </div>

          {/* Bottom row: Kafka + Moderation */}
          <div className={styles.bottomGrid}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>KAFKA EVENT STREAM</h2>
              {data.kafkaTopics.length === 0
                ? <p className={styles.loadingNote}>No Kafka data available</p>
                : (
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
                )
              }
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>MODERATION QUEUE</h2>
              {data.moderationQueue.length === 0
                ? <p className={styles.loadingNote}>No items pending moderation</p>
                : (
                  <div className={styles.modList}>
                    {data.moderationQueue.map(item => (
                      <div key={item.id} className={`${styles.modRow} ${reviewed.has(item.id) ? styles.modReviewed : ''}`}>
                        <div className={styles.modInfo}>
                          <span className={styles.modRole}>{item.role} · LKR {new Intl.NumberFormat('en-LK').format(item.monthlySalaryLKR)}</span>
                          <span className={styles.modReason}>Reason: {item.reason}</span>
                        </div>
                        <button
                          className={styles.reviewBtn}
                          onClick={() => handleModerate(item)}
                          disabled={reviewed.has(item.id)}
                        >
                          {reviewed.has(item.id) ? 'Done' : 'REVIEW'}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}
