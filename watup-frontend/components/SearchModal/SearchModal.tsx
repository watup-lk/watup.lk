'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { searchSalaries } from '@/lib/api';
import { formatNumber } from '@/utils/format';
import { SearchResult } from '@/types';
import styles from './SearchModal.module.css';

interface SearchModalProps {
  onClose: () => void;
}

const ACTIVE_FILTERS = ['Senior', 'LK', '2025'];

export default function SearchModal({ onClose }: SearchModalProps) {
  const { _ } = useLingui();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await searchSalaries({ query: q, country: 'LK' });
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
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Escape') { onClose(); }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder={_('Search salaries by role, company, level...')}
            value={query}
            onChange={handleQueryChange}
            autoComplete="off"
          />
          <div className={styles.shortcuts}>
            <kbd>⌘K</kbd>
            <kbd>ESC</kbd>
          </div>
        </div>

        <div className={styles.filters}>
          {ACTIVE_FILTERS.map(f => (
            <span key={f} className={styles.filterChip}>{f}</span>
          ))}
          <button className={styles.addFilter}>+ {_('Add filter')}</button>
        </div>

        {query && (
          <div className={styles.results}>
            <div className={styles.resultsMeta}>
              <span>{loading ? _('Searching...') : `${results.length} ${_('results · Showing approved only')}`}</span>
              <span className={styles.sortLabel}>{_('Sort: Salary ↓')}</span>
            </div>

            {results.length === 0 && !loading && (
              <div className={styles.empty}>{_('No results found')}</div>
            )}

            {results.map((r, idx) => (
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
                  <span className={styles.resultSalary}>LKR {formatNumber(r.monthlySalaryLKR)}</span>
                  <span className={styles.resultVotes}>▲ {r.votes ?? r.upvotes} {_('votes · APPROVED')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span>↑↓ {_('Navigate')}</span>
            <span>↵ {_('Select')}</span>
            <span>⌘F {_('Filter')}</span>
          </div>
          {results.length > 0 && (
            <button className={styles.viewAll}>{_('View Full Results →')}</button>
          )}
        </div>

        {!query && (
          <div className={styles.hint}>
            {_('Search queries: BFF → Search Service → salary schema (APPROVED only)')}
          </div>
        )}
      </div>
    </div>
  );
}
