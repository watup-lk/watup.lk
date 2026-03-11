'use client';

import { useState } from 'react';
import { login, signup } from '@/lib/api';
import styles from './page.module.css';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (tab === 'register') {
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const user = await login(email, password);
        if (remember) localStorage.setItem('token', user.token);
        else sessionStorage.setItem('token', user.token);
      } else {
        const user = await signup(email, password);
        sessionStorage.setItem('token', user.token);
      }
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.brand}>
          <span className={styles.brandIcon}>≈</span> Watup.lk
        </h1>
        <p className={styles.tagline}>Sri Lanka&apos;s tech salary transparency platform</p>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            LOGIN
          </button>
          <button
            className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >
            REGISTER
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>EMAIL</label>
            <input
              type="email"
              className={styles.input}
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>PASSWORD</label>
            <input
              type="password"
              className={styles.input}
              placeholder="••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {tab === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>CONFIRM PASSWORD</label>
              <input
                type="password"
                className={styles.input}
                placeholder="••••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          {tab === 'login' && (
            <div className={styles.row}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <button type="button" className={styles.forgotLink}>Forgot password?</button>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>

          {tab === 'login' && (
            <p className={styles.hint}>Login only required for voting &amp; community actions</p>
          )}
        </form>

        <div className={styles.divider} />

        <div className={styles.oauthRow}>
          <button className={styles.oauthBtn}>
            <span>G</span> Google
          </button>
          <button className={styles.oauthBtn}>
            <span>⌥</span> GitHub
          </button>
        </div>
      </div>

      <p className={styles.securityNote}>
        🔒 Passwords hashed with bcrypt · JWT auth · Identity isolated from salary data
      </p>
    </div>
  );
}
