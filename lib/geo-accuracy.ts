/**
 * The browser Geolocation API reports a `coords.accuracy` in metres — the
 * radius of a 68% confidence circle around the fix. A phone with GNSS is
 * usually 5-20 m outdoors; a laptop on Wi-Fi or IP geolocation can be 30 m to
 * several km. The gym geo-fence is only as good as this fix, so warn the person
 * when it is too loose to set the fence from.
 *
 * Pure — no browser APIs. `accuracyWarning` returns the message to show, or
 * null when the fix is good enough.
 */

/** A fix looser than this (metres) is not trustworthy for the geo-fence. */
export const ACCURACY_THRESHOLD_M = 50;

export function accuracyWarning(metres: number): string | null {
  if (!Number.isFinite(metres) || metres <= 0) {
    return "The device did not report how accurate this location is. Check it against the map before saving.";
  }
  if (metres > ACCURACY_THRESHOLD_M) {
    return `This location is only accurate to about ${Math.round(
      metres,
    )} m — too rough for the check-in fence. Go outside, grant precise location, and try again from a phone if you can.`;
  }
  return null;
}

/** "±12 m" — a short label for the accuracy readout. */
export function formatAccuracy(metres: number): string {
  if (!Number.isFinite(metres) || metres <= 0) return "accuracy unknown";
  return `±${Math.round(metres)} m`;
}
