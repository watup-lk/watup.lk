'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { searchSalaries } from '@/lib/api';
import { ExperienceLevel, SearchResult, WorkType } from '@/types';
import styles from './SearchModal.module.css';

interface SearchModalProps {
  onClose: () => void;
}

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['junior', 'mid', 'senior', 'lead', 'principal'];
const WORK_TYPES: WorkType[] = ['Remote', 'Hybrid', 'Onsite'];

function formatSalary(n: number) {
  return new Intl.NumberFormat('en-LK').format(n);
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | undefined>();
  const [workType, setWorkType] = useState<WorkType | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string, level?: ExperienceLevel, wt?: WorkType) => {
    if (!q.trim() && !level && !wt) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await searchSalaries({ query: q, experienceLevel: level, workType: wt });
      setResults(data);
      setSelectedIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, experienceLevel, workType), 300);
  }

  function handleLevelChange(level: ExperienceLevel) {
    const next = experienceLevel === level ? undefined : level;
    setExperienceLevel(next);
    doSearch(query, next, workType);
  }

  function handleWorkTypeChange(wt: WorkType) {
    const next = workType === wt ? undefined : wt;
    setWorkType(next);
    doSearch(query, experienceLevel, next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  const hasFilters = !!experienceLevel || !!workType;
  const showResults = !!query || hasFilters;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search salaries by role, company, level..."
            value={query}
            onChange={handleQueryChange}
            autoComplete="off"
          />
          <div className={styles.shortcuts}>
            <kbd>ESC</kbd>
          </div>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <span className={styles.filterLabel}>Level:</span>
          {EXPERIENCE_LEVELS.map(level => (
            <button
              key={level}
              className={`${styles.filterChip} ${experienceLevel === level ? styles.filterChipActive : styles.filterChipInactive}`}
              onClick={() => handleLevelChange(level)}
            >
              {level}
            </button>
          ))}
          <span className={styles.filterDivider} />
          {WORK_TYPES.map(wt => (
            <button
              key={wt}
              className={`${styles.filterChip} ${workType === wt ? styles.filterChipActive : styles.filterChipInactive}`}
              onClick={() => handleWorkTypeChange(wt)}
            >
              {wt}
            </button>
          ))}
        </div>

        {/* Results */}
        {showResults && (
          <div className={styles.results}>
            <div className={styles.resultsMeta}>
              <span>{loading ? 'Searching...' : `${results.length} results · Showing approved only`}</span>
              <span className={styles.sortLabel}>Sort: Salary ↓</span>
            </div>

            {results.length === 0 && !loading && (
              <div className={styles.empty}>No results found</div>
            )}

            {results?.map((r, idx) => (
              <div
                key={r.id}
                className={`${styles.result} ${idx === selectedIdx ? styles.resultSelected : ''}`}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <div className={styles.resultLeft}>
                  <span className={styles.resultRole}>{r.role}</span>
                  {r.anonymize && <span className={styles.anonBadge}>ANON</span>}
                  <span className={styles.resultMeta}>
                    {r.anonymize ? `(${r.company})` : r.company} · {r.experienceLevel} · {r.yearsOfExperience}y · {r.workType ?? 'Remote'}
                  </span>
                </div>
                <div className={styles.resultRight}>
                  <span className={styles.resultSalary}>LKR {formatSalary(r.monthlySalaryLKR)}</span>
                  <span className={styles.resultVotes}>▲ {r.votes ?? r.upvotes} votes · APPROVED</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!query && (
          <div className={styles.hint}>
            Search queries: salary schema (APPROVED only)
          </div>
        )}
      </div>
    </div>
  );
}
