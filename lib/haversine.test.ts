import { describe, expect, it } from "vitest";

import { haversineMetres } from "./haversine";

describe("haversineMetres", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMetres({ lat: 12.9, lng: 77.6 }, { lat: 12.9, lng: 77.6 })).toBeLessThan(1);
  });

  it("~111 m per 0.001° of latitude", () => {
    const d = haversineMetres({ lat: 12.9, lng: 77.6 }, { lat: 12.901, lng: 77.6 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("matches a known city pair within 1%", () => {
    // Bengaluru ↔ Mysuru ≈ 128 km
    const d = haversineMetres({ lat: 12.9716, lng: 77.5946 }, { lat: 12.2958, lng: 76.6394 });
    expect(d).toBeGreaterThan(125_000);
    expect(d).toBeLessThan(131_000);
  });
});
