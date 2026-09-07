import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Spotter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted">
          <p>Gym membership, payments, and WhatsApp reminders.</p>
          <Link href="/login">
            <Button className="w-full">Sign in</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
