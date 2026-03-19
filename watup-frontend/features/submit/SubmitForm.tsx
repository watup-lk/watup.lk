'use client';

import { useLingui } from '@lingui/react';
import { useSubmitForm } from './useSubmitForm';
import { ExperienceLevel, WorkType } from '@/types';
import styles from './SubmitForm.module.css';

const STEPS = [
  { n: 1, labelKey: 'ROLE' },
  { n: 2, labelKey: 'COMPENSATION' },
  { n: 3, labelKey: 'DETAILS' },
  { n: 4, labelKey: 'REVIEW' },
] as const;

const EXP_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'principal', label: 'Principal' },
];

const WORK_TYPES: WorkType[] = ['Remote', 'Hybrid', 'Onsite'];

export default function SubmitForm() {
  const { _ } = useLingui();
  const { step, setStep, form, set, loading, submitted, error, reset, handleSubmit } = useSubmitForm();

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <p className={styles.successIcon}>✓</p>
          <h2>{_('Submission received!')}</h2>
          <p>{_('Your salary is set to')} <strong>PENDING</strong> {_('until community approves (5 upvotes).')}</p>
          <button className={styles.btnPrimary} onClick={reset}>
            {_('Submit another')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{_('Submit Your Salary')}</h1>
        <p className={styles.subtitle}>{_('100% anonymous · No login required · Identity never linked')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.stepTabs}>
          {STEPS.map(s => (
            <button
              key={s.n}
              className={`${styles.stepTab} ${step === s.n ? styles.stepTabActive : ''} ${step > s.n ? styles.stepTabDone : ''}`}
              onClick={() => step > s.n && setStep(s.n)}
            >
              {s.n} {s.labelKey}
            </button>
          ))}
        </div>

        <div className={styles.formBody}>
          {step === 1 && (
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label}>{_('JOB TITLE / ROLE')}</label>
                <input className={styles.input} placeholder={_('e.g. Senior Backend Developer')} value={form.role} onChange={e => set('role', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('EXPERIENCE LEVEL')}</label>
                <select className={styles.input} value={form.experienceLevel} onChange={e => set('experienceLevel', e.target.value)}>
                  {EXP_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('COMPANY')}</label>
                <input className={styles.input} placeholder={_('e.g. Company name or type')} value={form.company} onChange={e => set('company', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('COUNTRY')}</label>
                <input className={styles.input} value={form.country} onChange={e => set('country', e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label}>{_('MONTHLY SALARY (GROSS)')}</label>
                <input className={styles.input} type="number" placeholder="e.g. 350000" value={form.monthlySalaryLKR} onChange={e => set('monthlySalaryLKR', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('CURRENCY')}</label>
                <input className={styles.input} value={form.currency} onChange={e => set('currency', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('YEARS OF EXPERIENCE')}</label>
                <input className={styles.input} type="number" min="0" max="50" placeholder="e.g. 4" value={form.yearsOfExperience} onChange={e => set('yearsOfExperience', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>{_('WORK TYPE')}</label>
                <select className={styles.input} value={form.workType} onChange={e => set('workType', e.target.value as WorkType)}>
                  {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.detailsStep}>
              <div className={styles.anonymizeRow}>
                <div>
                  <p className={styles.anonymizeTitle}>🔒 {_('Anonymize Submission')}</p>
                  <p className={styles.anonymizeDesc}>{_('When enabled, company name generalized in public results')}</p>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${form.anonymize ? styles.toggleOn : ''}`}
                  onClick={() => set('anonymize', !form.anonymize)}
                  aria-label={_('Toggle anonymize')}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <div className={styles.privacyNotice}>
                {_('No email, user ID, or personal info stored with this submission.')}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className={styles.reviewStep}>
              <table className={styles.reviewTable}>
                <tbody>
                  <tr><td className={styles.reviewKey}>{_('Role')}</td><td className={styles.reviewVal}>{form.role || '—'}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Company')}</td><td className={styles.reviewVal}>{form.anonymize ? `(${form.company})` : form.company || '—'}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Level')}</td><td className={styles.reviewVal}>{form.experienceLevel}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Experience')}</td><td className={styles.reviewVal}>{form.yearsOfExperience || '—'} {_('years')}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Salary')}</td><td className={styles.reviewVal}>{form.currency} {form.monthlySalaryLKR || '—'} /month</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Country')}</td><td className={styles.reviewVal}>{form.country}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Work type')}</td><td className={styles.reviewVal}>{form.workType}</td></tr>
                  <tr><td className={styles.reviewKey}>{_('Anonymous')}</td><td className={styles.reviewVal}>{form.anonymize ? _('Yes') : _('No')}</td></tr>
                </tbody>
              </table>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.reviewActions}>
                <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                  {loading ? _('Submitting...') : _('Submit Anonymously →')}
                </button>
                <button className={styles.cancelBtn} onClick={() => setStep(1)}>{_('Cancel')}</button>
              </div>
              <p className={styles.pendingNote}>
                {_('Submission will be set to PENDING until community approves (5 upvotes)')}
              </p>
            </div>
          )}

          {step < 4 && (
            <div className={styles.navRow}>
              {step > 1 && (
                <button className={styles.backBtn} onClick={() => setStep((step - 1) as 1 | 2 | 3)}>
                  {_('← Back')}
                </button>
              )}
              <button className={styles.nextBtn} onClick={() => setStep((step + 1) as 2 | 3 | 4)}>
                {_('Next →')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
