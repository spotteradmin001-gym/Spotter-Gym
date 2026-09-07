"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. You can try again, and if it keeps
        happening, contact support
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
