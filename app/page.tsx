import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Spotter</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Gym membership, payments, and WhatsApp reminders. Sign-in arrives in
          Phase 1.
        </CardContent>
      </Card>
    </main>
  );
}
