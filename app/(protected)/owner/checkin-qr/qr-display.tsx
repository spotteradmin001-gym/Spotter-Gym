"use client";

import { useEffect, useState } from "react";

/** Refreshes the QR image well inside the token window so a scan always lands on a live code. */
export function QrDisplay({ slug }: { slug: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/checkin-qr/${slug}?ts=${tick}`}
        alt="Gym check-in QR code"
        width={320}
        height={320}
        className="rounded-md border border-border bg-white p-2"
      />
      <p className="text-xs text-muted">
        Refreshes automatically. Print or display this at the entrance.
      </p>
    </div>
  );
}
