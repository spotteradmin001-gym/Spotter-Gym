import { cn } from "@/lib/cn";
import type { DayState, MonthGrid } from "@/lib/streak-calendar";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const STATE_STYLE: Record<DayState, string> = {
  checked_in: "bg-success text-white font-semibold",
  missed_open: "bg-destructive/15 text-destructive",
  rest_day: "bg-muted-background text-muted",
  upcoming: "text-muted",
};

const LEGEND: { state: DayState; label: string }[] = [
  { state: "checked_in", label: "Checked in" },
  { state: "missed_open", label: "Missed" },
  { state: "rest_day", label: "Rest day" },
  { state: "upcoming", label: "Upcoming" },
];

export function StreakCalendar({ grid }: { grid: MonthGrid }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{grid.label}</p>

      <div className="grid grid-cols-7 gap-1 text-center">
        {grid.weekdayOrder.map((wd, i) => (
          <div key={i} className="pb-1 text-xs font-medium text-muted">
            {WEEKDAY_LABELS[wd]}
          </div>
        ))}

        {grid.weeks.flat().map((day) => (
          <div
            key={day.date}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md text-sm",
              day.inMonth ? STATE_STYLE[day.state] : "text-transparent",
            )}
            aria-label={day.inMonth ? `${day.date}: ${day.state.replace("_", " ")}` : undefined}
          >
            {day.dayOfMonth}
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {LEGEND.map(({ state, label }) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block size-3 rounded-sm",
                state === "upcoming"
                  ? "border border-border"
                  : STATE_STYLE[state].split(" ")[0],
              )}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
