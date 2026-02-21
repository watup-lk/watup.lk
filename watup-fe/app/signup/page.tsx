'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

interface FormErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(data: FormData): FormErrors {
    const errs: FormErrors = {};
    const email = data.get('email') as string;
    const password = data.get('password') as string;
    const confirm = data.get('confirm') as string;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
    if (!password || password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (password !== confirm) errs.confirm = 'Passwords do not match';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError('');
    const data = new FormData(e.currentTarget);
    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      // TODO: replace with signup(email, password) from lib/api
      // const user = await signup(data.get('email') as string, data.get('password') as string);
      await new Promise((r) => setTimeout(r, 600)); // mock delay
      console.log('signup:', data.get('email'));
    } catch (err: unknown) {
      setApiError((err as { message?: string }).message ?? 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create an account</h1>
        <p className={styles.subtitle}>Sign up to vote on salary submissions.</p>

        <div className={styles.notice}>
          Your email is stored separately from all salary data. Your identity is never linked to
          any submission.
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="you@example.com" />
            {errors.email && <span className={styles.fieldError}>{errors.email}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" placeholder="Min. 8 characters" />
            {errors.password && <span className={styles.fieldError}>{errors.password}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm">Confirm Password</label>
            <input id="confirm" name="confirm" type="password" placeholder="Repeat password" />
            {errors.confirm && <span className={styles.fieldError}>{errors.confirm}</span>}
          </div>

          {apiError && <div className={styles.apiError}>{apiError}</div>}

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
