import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGym, listRecentCheckins, memberStreak } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireCompleteProfile } from "@/src/features/auth/member-scope";

export const dynamic = "force-dynamic";

export default async function MemberHomePage() {
  const { member } = await requireCompleteProfile();
  const [gym, streak, recent] = await Promise.all([
    getGym(member.gymId),
    memberStreak(member.gymId, member.id),
    listRecentCheckins(member.gymId, member.id, 10),
  ]);

  return (
    <div className="flex flex-col gap-4">
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
          <CardTitle>Streak: {streak} day{streak === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {recent.length === 0 ? (
            <p className="text-muted">
              Scan the QR at the gym entrance to check in.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((c) => (
                <li key={c.date} className="text-muted">
                  {c.date}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
