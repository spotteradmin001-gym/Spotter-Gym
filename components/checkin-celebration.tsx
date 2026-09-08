"use client";

import { type CSSProperties, useEffect, useSyncExternalStore } from "react";

const SEEN_PREFIX = "spotter:celebrated:";

const PIECE_COLORS = [
  "var(--color-success)",
  "var(--color-primary)",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
];

// Pre-computed spread so the burst is deterministic (no Math.random in render).
const PIECES = Array.from({ length: 12 }, (_, i) => ({
  spin: `${120 + i * 40}deg`,
  dist: `${52 + (i % 4) * 12}px`,
  delay: `${(i % 6) * 35}ms`,
  color: PIECE_COLORS[i % PIECE_COLORS.length]!,
  rotate: i * 30,
}));

function markSeen(key: string | undefined) {
  if (!key) return;
  try {
    sessionStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    /* private mode / storage disabled — the celebration just shows again */
  }
}

function wasSeen(key: string): boolean {
  try {
    return sessionStorage.getItem(SEEN_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export function CheckinCelebration({
  streak,
  quote,
  tone = "fresh",
  seenKey,
}: {
  streak: number | null;
  quote: string;
  /** `fresh` = new check-in (full burst); `repeat` = already checked in today. */
  tone?: "fresh" | "repeat";
  /** When set, records the celebration as seen for this session. */
  seenKey?: string;
}) {
  useEffect(() => {
    markSeen(seenKey);
  }, [seenKey]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {tone === "fresh" &&
          PIECES.map((p, i) => (
            <span
              key={i}
              className="celebrate-piece"
              style={
                {
                  background: p.color,
                  animationDelay: p.delay,
                  transform: `translate(-50%, -50%) rotate(${p.rotate}deg)`,
                  "--spin": p.spin,
                  "--dist": p.dist,
                } as CSSProperties
              }
            />
          ))}
        <span className="celebrate-badge flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
            <path
              className="celebrate-check-path"
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      <p className="celebrate-line text-lg font-semibold text-success">
        {tone === "repeat" ? "Already checked in today" : "Checked in"}
      </p>

      {streak != null && (
        <p className="celebrate-line text-sm font-medium">
          {streak} day{streak === 1 ? "" : "s"} in a row
        </p>
      )}

      <p className="celebrate-line max-w-xs text-sm text-muted">{quote}</p>
    </div>
  );
}

/**
 * `/m` wrapper: shows the celebration once per session for a given date, then
 * stays out of the way on later visits that day.
 */
const NOOP = () => () => {};

export function DailyCheckinCelebration({
  streak,
  quote,
  date,
}: {
  streak: number | null;
  quote: string;
  date: string;
}) {
  // Client-only: render on the server as absent, then reveal once per session.
  const show = useSyncExternalStore(
    NOOP,
    () => !wasSeen(date),
    () => false,
  );

  if (!show) return null;

  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-4">
      <CheckinCelebration streak={streak} quote={quote} seenKey={date} />
    </div>
  );
}
