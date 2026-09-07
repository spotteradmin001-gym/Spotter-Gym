"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Phase = "locating" | "sending" | "ok" | "already" | "error" | "denied";

export function CheckinClient({
  gymSlug,
  token,
}: {
  gymSlug: string;
  token: string;
}) {
  const [phase, setPhase] = useState<Phase>("locating");
  const [message, setMessage] = useState("");
  const [streak, setStreak] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setPhase("denied");
      setMessage("This device can't share its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase("sending");
        try {
          const res = await fetch("/api/checkin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              gymSlug,
              token,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setPhase("error");
            setMessage(data.error ?? "Check-in failed.");
            return;
          }
          setStreak(data.streak ?? null);
          setPhase(data.status === "already" ? "already" : "ok");
        } catch {
          setPhase("error");
          setMessage("Network error — try again.");
        }
      },
      () => {
        setPhase("denied");
        setMessage("Allow location access to check in.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [gymSlug, token]);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    start();
  }, [attempt, start]);

  const retry = () => {
    setPhase("locating");
    setMessage("");
    setAttempt((a) => a + 1);
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {phase === "locating" && <p>Getting your location…</p>}
      {phase === "sending" && <p>Checking you in…</p>}
      {phase === "ok" && (
        <>
          <p className="text-lg font-semibold text-success">Checked in ✓</p>
          {streak != null && (
            <p className="text-sm">Streak: {streak} day{streak === 1 ? "" : "s"}</p>
          )}
        </>
      )}
      {phase === "already" && (
        <>
          <p className="text-lg font-semibold">Already checked in today</p>
          {streak != null && (
            <p className="text-sm">Streak: {streak} day{streak === 1 ? "" : "s"}</p>
          )}
        </>
      )}
      {(phase === "error" || phase === "denied") && (
        <>
          <p className="text-sm text-destructive">{message}</p>
          <Button size="sm" onClick={retry}>Try again</Button>
        </>
      )}
    </div>
  );
}
