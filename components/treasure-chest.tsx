const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(periodMonth: string | null): string | null {
  if (!periodMonth) return null;
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return `${MONTHS[m - 1]} ${y}`;
}

export type TreasureChestProps = {
  /** From `memberRewardOverview(...).chest.state`. */
  state: "off" | "locked" | "pending" | "earned" | "missed";
  redeemPeriod: string | null;
  /** The earned reward's percent (only meaningful when `state === "earned"`). */
  percent: number | null;
};

/**
 * Streak reward treasure chest for `/m` (CR-9 / 9d). Closed and dim while the
 * cycle is still being earned, swings open at cycle close — sparkling on a win,
 * empty on a miss. Renders nothing when the gym has the feature off.
 */
export function TreasureChest({ state, redeemPeriod, percent }: TreasureChestProps) {
  if (state === "off") return null;

  const open = state === "earned" || state === "missed";
  const won = state === "earned";
  const month = monthLabel(redeemPeriod);

  const heading =
    state === "locked"
      ? "Reward chest — locked"
      : state === "pending"
        ? "Reward chest — scoring…"
        : won
          ? "Reward unlocked!"
          : "Chest is empty this time";

  const body =
    state === "locked"
      ? "Check in on every open day this cycle to earn a fee discount."
      : state === "pending"
        ? "Your last cycle is being scored — check back soon."
        : won
          ? percent && month
            ? `${percent}% off your ${month} payment.`
            : "A fee discount is on the way."
          : "The streak broke last cycle. Fresh chest, fresh start this cycle.";

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 64 56"
        className={`size-16 shrink-0 ${open ? "" : "opacity-70"}`}
        aria-hidden="true"
      >
        {won && (
          <g className="text-primary">
            <path
              className="chest-sparkle"
              d="M14 10l1.6 3.4L19 15l-3.4 1.6L14 20l-1.6-3.4L9 15l3.4-1.6z"
              fill="currentColor"
              style={{ animationDelay: "520ms" }}
            />
            <path
              className="chest-sparkle"
              d="M52 4l1.2 2.6L56 8l-2.8 1.2L52 12l-1.2-2.8L48 8l2.8-1.4z"
              fill="currentColor"
              style={{ animationDelay: "820ms" }}
            />
          </g>
        )}

        {/* chest base */}
        <rect x="10" y="26" width="44" height="26" rx="3" fill="#b45309" />
        <rect x="10" y="26" width="44" height="26" rx="3" fill="none" stroke="#7c2d12" strokeWidth="2" />
        <rect x="28" y="34" width="8" height="12" rx="1.5" fill="#fbbf24" stroke="#7c2d12" strokeWidth="1.5" />

        {won && open && (
          <g>
            <circle cx="24" cy="24" r="3.5" fill="#fbbf24" />
            <circle cx="34" cy="26" r="3" fill="#fde68a" />
            <circle cx="41" cy="23" r="2.5" fill="#fbbf24" />
          </g>
        )}

        {/* lid */}
        <g className={open ? "chest-lid-open" : undefined}>
          <path
            d="M10 26a22 12 0 0 1 44 0v2H10z"
            fill="#d97706"
            stroke="#7c2d12"
            strokeWidth="2"
          />
        </g>
      </svg>

      <div className="flex flex-col gap-0.5">
        <p className={`text-sm font-semibold ${won ? "text-primary" : ""}`}>
          {heading}
        </p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}
