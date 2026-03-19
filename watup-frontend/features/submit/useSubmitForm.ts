'use client';

import { useState } from 'react';
import { submitSalary } from '@/lib/api';
import { ExperienceLevel, WorkType } from '@/types';

export type Step = 1 | 2 | 3 | 4;

export interface FormData {
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
  country: 'LK',
  monthlySalaryLKR: '',
  currency: 'LKR',
  yearsOfExperience: '',
  workType: 'Remote',
  anonymize: true,
};

export function useSubmitForm() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof FormData, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function reset() {
    setSubmitted(false);
    setForm(INITIAL);
    setStep(1);
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

  return { step, setStep, form, set, loading, submitted, error, reset, handleSubmit };
}
