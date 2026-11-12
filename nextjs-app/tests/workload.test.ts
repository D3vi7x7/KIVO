import { describe, expect, it } from "vitest";

describe("Workload calculations", () => {
  it("calculates weekly breakdown correctly", () => {
    const weeklyCounts: Record<string, number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    };

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // 2026-11-09 is a Monday
    const testDates = ["2026-11-09T10:00:00Z", "2026-11-10T12:00:00Z", "2026-11-13T15:00:00Z"];

    for (const d of testDates) {
      const day = dayNames[new Date(d).getDay()];
      if (weeklyCounts[day] !== undefined) {
        weeklyCounts[day] += 1;
      }
    }

    expect(weeklyCounts.Mon).toBe(1);
    expect(weeklyCounts.Tue).toBe(1);
    expect(weeklyCounts.Fri).toBe(1);
    expect(weeklyCounts.Wed).toBe(0);

    const maxVal = Math.max(...Object.values(weeklyCounts), 0);
    const chartMax = Math.max(maxVal, 4);
    const midTick = Math.ceil(chartMax / 2);

    expect(chartMax).toBe(4);
    expect(midTick).toBe(2);
    // Ticks: 4, 2, 0 - never duplicating 1, 1, 0!
    expect(new Set([chartMax, midTick, 0]).size).toBe(3);
  });

  it("calculates dynamic capacity status", () => {
    function getStatus(pct: number) {
      if (pct === 0) return "Ready";
      if (pct <= 40) return "Light";
      if (pct <= 75) return "Balanced";
      return "Heavy";
    }

    expect(getStatus(0)).toBe("Ready");
    expect(getStatus(25)).toBe("Light");
    expect(getStatus(65)).toBe("Balanced");
    expect(getStatus(85)).toBe("Heavy");
  });
});

