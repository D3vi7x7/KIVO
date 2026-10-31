import { test, expect } from "@playwright/test";

const BASE = process.env.BENCH_BASE_URL || "http://localhost:3000";

test.use({ baseURL: BASE });

test("benchmark dashboard page load and refresh", async ({ page }) => {
  const timings: Array<{ label: string; ms: number }> = [];

  page.on("console", (msg) => {
    const text = msg.text();
    const match = text.match(/\[bench\] (.+): ([\d.]+) ms/);
    if (match) {
      timings.push({ label: match[1], ms: parseFloat(match[2]) });
    }
  });

  // Cold load
  const loadStart = Date.now();
  await page.goto("/dashboard/spaces");
  const loadEnd = Date.now();
  timings.push({ label: "cold_page_load", ms: loadEnd - loadStart });

  // Refresh
  const refreshStart = Date.now();
  await page.reload();
  const refreshEnd = Date.now();
  timings.push({ label: "hot_page_refresh", ms: refreshEnd - refreshStart });

  // Harvest instrumented timings
  const instrumented = await page.evaluate(() => {
    return (window as any).__KIVO_BENCHMARK__?.get?.() ?? [];
  });
  for (const t of instrumented) {
    timings.push({ label: t.label, ms: t.ms });
  }

  // Log results
  console.log("\n=== BENCHMARK RESULTS ===");
  for (const t of timings) {
    console.log(`${t.label.padEnd(30)} ${t.ms.toFixed(2)} ms`);
  }
  console.log("=========================\n");

  // Soft assertions: page should load within a reasonable window
  expect(timings.find((t) => t.label === "cold_page_load")?.ms).toBeLessThan(30000);
});
