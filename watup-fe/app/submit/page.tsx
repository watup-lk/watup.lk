'use client';

import { useState } from 'react';
import { submitSalary } from '@/lib/api';
import { ExperienceLevel, WorkType } from '@/types';
import styles from './page.module.css';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, label: 'ROLE' },
  { n: 2, label: 'COMPENSATION' },
  { n: 3, label: 'DETAILS' },
  { n: 4, label: 'REVIEW' },
] as const;

const EXP_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'principal', label: 'Principal' },
];

const WORK_TYPES: WorkType[] = ['Remote', 'Hybrid', 'Onsite'];

interface FormData {
  role: string;
  experienceLevel: ExperienceLevel;
  company: string;
  country: string;
  monthlySalaryLKR: string;
  currency: string;
  yearsOfExperience: string;
  workType: WorkType;
  anonymize: boolean;
}

const INITIAL: FormData = {
  role: '',
  experienceLevel: 'mid',
  company: '',
  country: 'Sri Lanka',
  monthlySalaryLKR: '',
  currency: 'LKR',
  yearsOfExperience: '',
  workType: 'Remote',
  anonymize: true,
};

export default function SubmitPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof FormData, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await submitSalary({
        role: form.role,
        company: form.company,
        experienceLevel: form.experienceLevel,
        yearsOfExperience: Number(form.yearsOfExperience),
        monthlySalaryLKR: Number(form.monthlySalaryLKR),
        country: form.country,
        currency: form.currency,
        workType: form.workType,
        anonymize: form.anonymize,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <p className={styles.successIcon}>✓</p>
          <h2>Submission received!</h2>
          <p>Your salary is set to <strong>PENDING</strong> until community approves (5 upvotes).</p>
          <button className={styles.btnPrimary} onClick={() => { setSubmitted(false); setForm(INITIAL); setStep(1); }}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Submit Your Salary</h1>
        <p className={styles.subtitle}>100% anonymous · No login required · Identity never linked</p>
      </div>

      <div className={styles.card}>
        {/* Step tabs */}
        <div className={styles.stepTabs}>
          {STEPS.map(s => (
            <button
              key={s.n}
              className={`${styles.stepTab} ${step === s.n ? styles.stepTabActive : ''} ${step > s.n ? styles.stepTabDone : ''}`}
              onClick={() => step > s.n && setStep(s.n as Step)}
            >
              {s.n} {s.label}
            </button>
          ))}
        </div>

        <div className={styles.formBody}>
          {/* Step 1: Role */}
          {step === 1 && (
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label}>JOB TITLE / ROLE</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Senior Backend Developer"
                  value={form.role}
                  onChange={e => set('role', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>EXPERIENCE LEVEL</label>
                <select
                  className={styles.input}
                  value={form.experienceLevel}
                  onChange={e => set('experienceLevel', e.target.value)}
                >
                  {EXP_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>COMPANY</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Company name or type"
                  value={form.company}
                  onChange={e => set('company', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>COUNTRY</label>
                <input
                  className={styles.input}
                  value={form.country}
                  onChange={e => set('country', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Compensation */}
          {step === 2 && (
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label}>MONTHLY SALARY (GROSS)</label>
                <input
                  className={styles.input}
                  type="number"
                  placeholder="e.g. 350000"
                  value={form.monthlySalaryLKR}
                  onChange={e => set('monthlySalaryLKR', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>CURRENCY</label>
                <input
                  className={styles.input}
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>YEARS OF EXPERIENCE</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max="50"
                  placeholder="e.g. 4"
                  value={form.yearsOfExperience}
                  onChange={e => set('yearsOfExperience', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>WORK TYPE</label>
                <select
                  className={styles.input}
                  value={form.workType}
                  onChange={e => set('workType', e.target.value as WorkType)}
                >
                  {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className={styles.detailsStep}>
              <div className={styles.anonymizeRow}>
                <div>
                  <p className={styles.anonymizeTitle}>🔒 Anonymize Submission</p>
                  <p className={styles.anonymizeDesc}>When enabled, company name generalized in public results</p>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${form.anonymize ? styles.toggleOn : ''}`}
                  onClick={() => set('anonymize', !form.anonymize)}
                  aria-label="Toggle anonymize"
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <div className={styles.privacyNotice}>
                No email, user ID, or personal info stored with this submission.
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className={styles.reviewStep}>
              <table className={styles.reviewTable}>
                <tbody>
                  <tr><td className={styles.reviewKey}>Role</td><td className={styles.reviewVal}>{form.role || '—'}</td></tr>
                  <tr><td className={styles.reviewKey}>Company</td><td className={styles.reviewVal}>{form.anonymize ? `(${form.company})` : form.company || '—'}</td></tr>
                  <tr><td className={styles.reviewKey}>Level</td><td className={styles.reviewVal}>{form.experienceLevel}</td></tr>
                  <tr><td className={styles.reviewKey}>Experience</td><td className={styles.reviewVal}>{form.yearsOfExperience || '—'} years</td></tr>
                  <tr><td className={styles.reviewKey}>Salary</td><td className={styles.reviewVal}>{form.currency} {form.monthlySalaryLKR || '—'} /month</td></tr>
                  <tr><td className={styles.reviewKey}>Country</td><td className={styles.reviewVal}>{form.country}</td></tr>
                  <tr><td className={styles.reviewKey}>Work type</td><td className={styles.reviewVal}>{form.workType}</td></tr>
                  <tr><td className={styles.reviewKey}>Anonymous</td><td className={styles.reviewVal}>{form.anonymize ? 'Yes' : 'No'}</td></tr>
                </tbody>
              </table>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.reviewActions}>
                <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Anonymously →'}
                </button>
                <button className={styles.cancelBtn} onClick={() => setStep(1)}>Cancel</button>
              </div>
              <p className={styles.pendingNote}>
                Submission will be set to PENDING until community approves (5 upvotes)
              </p>
            </div>
          )}

          {/* Navigation */}
          {step < 4 && (
            <div className={styles.navRow}>
              {step > 1 && (
                <button className={styles.backBtn} onClick={() => setStep((step - 1) as Step)}>
                  ← Back
                </button>
              )}
              <button
                className={styles.nextBtn}
                onClick={() => setStep((step + 1) as Step)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
