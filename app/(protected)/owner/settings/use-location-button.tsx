"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { accuracyWarning, formatAccuracy } from "@/lib/geo-accuracy";

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "done"; accuracy: number }
  | { kind: "error"; message: string };

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied. Allow it for this site in your browser settings, then try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your device could not get a location fix right now. Move near a window or go outside and try again.";
    case error.TIMEOUT:
      return "Getting your location took too long. Try again.";
    default:
      return "Could not get your location. Enter the coordinates by hand.";
  }
}

/**
 * Fills the gym check-in latitude / longitude inputs from the browser
 * Geolocation API. The person clicks it while standing at the gym. The manual
 * inputs stay editable for fine-tuning.
 */
export function UseLocationButton({
  latInputId,
  lngInputId,
}: {
  latInputId: string;
  lngInputId: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function setInput(id: string, value: number) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.value = String(value);
    // Nudge any listeners (and React, if the field is ever made controlled).
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus({
        kind: "error",
        message: "This browser has no location support. Enter the coordinates by hand.",
      });
      return;
    }

    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setInput(latInputId, Number(latitude.toFixed(6)));
        setInput(lngInputId, Number(longitude.toFixed(6)));
        setStatus({ kind: "done", accuracy });
      },
      (error) => {
        setStatus({ kind: "error", message: geolocationMessage(error) });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const warning =
    status.kind === "done" ? accuracyWarning(status.accuracy) : null;

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={locate}
        disabled={status.kind === "locating"}
        aria-busy={status.kind === "locating"}
        className="self-start"
      >
        {status.kind === "locating" ? "Getting location…" : "Use my current location"}
      </Button>

      {status.kind === "done" && (
        <p className={warning ? "text-sm text-destructive" : "text-sm text-success"}>
          {warning ?? `Location set (${formatAccuracy(status.accuracy)}).`}
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
      <p className="text-xs text-muted">
        Best done on a phone, standing at the gym entrance, with precise location
        allowed. You can still type the coordinates by hand.
      </p>
    </div>
  );
}
