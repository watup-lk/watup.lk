"use client";

import { useEffect, useState } from "react";
import { getVotingQueue, vote } from "@/lib/api";
import { SalarySubmission, VoteFilter } from "@/types";
import styles from "./page.module.css";
import Link from "next/link";

const FILTERS: { value: VoteFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs-vote", label: "Needs 1 More Vote" },
  { value: "recently-approved", label: "Recently Approved" },
  { value: "reported", label: "Reported" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return "just now";
}

export default function VotingPage() {
  const [filter, setFilter] = useState<VoteFilter>("all");
  const [items, setItems] = useState<SalarySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, "UP" | "DOWN">>({});

  useEffect(() => {
    const token =
      localStorage.getItem("token") ?? sessionStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Login required to view voting queue");
      return;
    }
    setLoading(true);
    setError(null);
    getVotingQueue(filter, token)
      .then(setItems)
      .catch(() => setError("Failed to load submissions"))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleVote(id: string, type: "UP" | "DOWN") {
    const token =
      localStorage.getItem("token") ?? sessionStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    if (voted[id]) return;

    setVoted((v) => ({ ...v, [id]: type }));
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          upvotes: type === "UP" ? item.upvotes + 1 : item.upvotes,
          downvotes: type === "DOWN" ? item.downvotes + 1 : item.downvotes,
        };
      }),
    );

    try {
      await vote(id, type, token);
    } catch {
      setVoted((v) => {
        const n = { ...v };
        delete n[id];
        return n;
      });
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            upvotes: type === "UP" ? item.upvotes - 1 : item.upvotes,
            downvotes: type === "DOWN" ? item.downvotes - 1 : item.downvotes,
          };
        }),
      );
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Community Voting</h1>
          <p className={styles.subtitle}>
            Help verify salary data · Login required
          </p>
        </div>
        <Link href="/submit">
          <button className={styles.filterBtn}>+ Submit Salary</button>
        </Link>
      </div>

      <div className={styles.filterTabs}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`${styles.filterTab} ${filter === f.value ? styles.filterTabActive : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className={styles.loadingNote}>Loading…</p>}
      {error && <p className={styles.loadingNote}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className={styles.loadingNote}>No submissions found</p>
      )}

      <div className={styles.list}>
        {items.map((item) => {
          const myVote = voted[item.id];
          const totalVotes = item.upvotes - item.downvotes;
          const needed = Math.max(0, 5 - item.upvotes);

          return (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardLeft}>
                  <div className={styles.cardTitleRow}>
                    <h2 className={styles.cardRole}>{item.role}</h2>
                    <span className={`${styles.badge} ${styles.badgePending}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className={styles.cardMeta}>
                    {item.anonymize ? `(${item.company})` : item.company}
                    {" · "}
                    {item.experienceLevel}
                    {" · "}
                    {item.yearsOfExperience} yrs
                    {" · "}
                    {item.workType ?? "Remote"}
                  </p>
                  <p className={styles.cardSalary}>
                    LKR{" "}
                    {new Intl.NumberFormat("en-LK").format(
                      item.monthlySalaryLKR,
                    )}
                    <span className={styles.salaryUnit}> /month gross</span>
                  </p>
                </div>

                <div className={styles.voteGroup}>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnUp} ${myVote === "UP" ? styles.votedUp : ""}`}
                    onClick={() => handleVote(item.id, "UP")}
                    disabled={!!myVote}
                  >
                    ▲
                  </button>
                  <span className={styles.voteCount}>{totalVotes}</span>
                  <button
                    className={`${styles.voteBtn} ${styles.voteBtnDown} ${myVote === "DOWN" ? styles.votedDown : ""}`}
                    onClick={() => handleVote(item.id, "DOWN")}
                    disabled={!!myVote}
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.cardActions}>
                  <button className={styles.reportBtn}>⚑ Report as fake</button>
                  <button className={styles.commentBtn}>☐ Comment</button>
                </div>
                <p className={styles.cardTime}>
                  Submitted {timeAgo(item.createdAt)} · {needed} to approve
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
