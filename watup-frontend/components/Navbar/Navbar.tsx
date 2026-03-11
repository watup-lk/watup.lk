"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme-context";
import SearchModal from "@/components/SearchModal/SearchModal";
import styles from "./Navbar.module.css";

const PUBLIC_LINKS = [
  { label: "Submit", href: "/submit" },
  { label: "Analytics", href: "/analytics" },
];

const AUTH_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Voting", href: "/voting" },
  { label: "Admin", href: "/admin" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token =
      localStorage.getItem("token") ?? sessionStorage.getItem("token");
    setLoggedIn(!!token);
  }, [pathname]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const navLinks = [
    ...PUBLIC_LINKS,
    ...(loggedIn ? AUTH_LINKS : []),
  ];

  return (
    <>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>≈</span>
          Watup.lk
        </Link>

        <div className={styles.links}>
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.link} ${pathname === href ? styles.active : ""}`}
            >
              {label}
            </Link>
          ))}
          <button
            className={`${styles.link} ${styles.searchLink}`}
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
          >
            Search
          </button>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? "☀" : "◑"}
          </button>
          <span className={styles.statusChip}>OK</span>
          {loggedIn ? (
            <button
              className={styles.logoutLink}
              onClick={() => {
                localStorage.removeItem("token");
                sessionStorage.removeItem("token");
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          ) : (
            <Link href="/login" className={styles.link}>Login</Link>
          )}
        </div>
      </nav>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
