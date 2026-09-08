import { DailyCheckinCelebration } from "@/components/checkin-celebration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { closedDates, getGym, listRecentCheckins, memberStreak } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { pickQuote } from "@/lib/quotes";
import { addDays, longestStreak } from "@/lib/streak";
import { buildMonthGrid } from "@/lib/streak-calendar";
import { requireCompleteProfile } from "@/src/features/auth/member-scope";

import { StreakCalendar } from "./streak-calendar";

export const dynamic = "force-dynamic";

export default async function MemberHomePage() {
  const { member } = await requireCompleteProfile();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const [gym, streak, recent] = await Promise.all([
    getGym(member.gymId),
    memberStreak(member.gymId, member.id),
    listRecentCheckins(member.gymId, member.id, 400),
  ]);

  const checkinDates = recent.map((c) => c.date);
  const earliest = checkinDates.length
    ? checkinDates.reduce((a, b) => (a < b ? a : b))
    : today;
  // Wide enough to cover the grid's leading / trailing padding and the whole
  // check-in history the longest-streak calc walks.
  const from = earliest < `${month}-01` ? earliest : `${month}-01`;
  const to = addDays(`${month}-01`, 45);
  const closed = await closedDates(member.gymId, from, to);

  const grid = buildMonthGrid({ month, today, checkins: checkinDates, closed });
  const best = longestStreak({ checkins: checkinDates, closed, today });
  const checkedInToday = checkinDates.includes(today);

  return (
    <div className="flex flex-col gap-4">
      {checkedInToday && (
        <DailyCheckinCelebration
          streak={streak}
          quote={pickQuote(today)}
          date={today}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Hi {member.name.split(" ")[0]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p><span className="text-muted">Gym:</span> {gym?.name}</p>
          <p><span className="text-muted">Monthly fee:</span> {formatPaise(member.resolvedFeePaise)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your streak</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-6">
            <div>
              <p className="text-2xl font-semibold">{streak}</p>
              <p className="text-xs text-muted">
                current day{streak === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{best}</p>
              <p className="text-xs text-muted">
                longest day{best === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <StreakCalendar grid={grid} />
          {recent.length === 0 && (
            <p className="text-sm text-muted">
              Scan the QR at the gym entrance to check in.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
