'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react';
import { useTheme } from '@/lib/theme-context';
import { useLocale } from '@/lib/i18n';
import SearchModal from '@/components/SearchModal/SearchModal';
import styles from './Navbar.module.css';

const PUBLIC_LINKS = [
  { labelKey: 'Submit', href: '/submit' },
  { labelKey: 'Analytics', href: '/analytics' },
];

const AUTH_LINKS = [
  { labelKey: 'Dashboard', href: '/dashboard' },
  { labelKey: 'Voting', href: '/voting' },
  { labelKey: 'Admin', href: '/admin' },
];

export default function Navbar() {
  const { _ } = useLingui();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale } = useLocale();
  const [searchOpen, setSearchOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    setLoggedIn(!!token);
  }, [pathname]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const navLinks = [...PUBLIC_LINKS, ...(loggedIn ? AUTH_LINKS : [])];

  return (
    <>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>≈</span>
          Watup.lk
        </Link>

        <div className={styles.links}>
          {navLinks.map(({ labelKey, href }) => (
            <Link key={href} href={href} className={`${styles.link} ${pathname === href ? styles.active : ''}`}>
              {labelKey}
            </Link>
          ))}
          <button className={`${styles.link} ${styles.searchLink}`} onClick={() => setSearchOpen(true)} aria-label={_('Open search')}>
            {_('Search')}
          </button>
        </div>

        <div className={styles.actions}>
          {/* <button
            className={styles.themeToggle}
            onClick={toggleLocale}
            aria-label={_('Toggle language')}
            title={locale === 'en' ? _('Switch to Sinhala') : _('Switch to English')}
          >
            {locale === 'en' ? 'සිං' : 'EN'}
          </button> */}
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={_('Toggle theme')}
            title={theme === 'dark' ? _('Switch to light mode') : _('Switch to dark mode')}
          >
            {theme === 'dark' ? '☀' : '◑'}
          </button>
          <span className={styles.statusChip}>OK</span>
          {loggedIn ? (
            <button
              className={styles.logoutLink}
              onClick={() => {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                window.location.href = '/login';
              }}
            >
              {_('Logout')}
            </button>
          ) : (
            <Link href="/login" className={styles.link}>{_('Login')}</Link>
          )}
        </div>
      </nav>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
