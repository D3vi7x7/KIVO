import { test, expect, type Page, type Request, type Response } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { performance as nodePerf } from "node:perf_hooks";

const BASE = process.env.BENCH_BASE_URL || "http://localhost:3000";
const ROUTE = process.env.BENCH_ROUTE || "/dashboard/spaces";
const RUNS = Math.max(1, Number(process.env.BENCH_RUNS || 5));
const OUTPUT = process.env.BENCH_OUTPUT || "artifacts/dashboard-benchmark.json";

// Optional: set BENCH_READY_SELECTOR to a stable selector that represents
// the actual dashboard content, e.g. '[data-testid="spaces-dashboard"]'.
// If omitted, the test uses a conservative fallback.
const READY_SELECTOR = process.env.BENCH_READY_SELECTOR;

type Metric = { label: string; ms: number };
type ApiMetric = {
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  failed?: string;
};

type RunResult = {
  run: number;
  kind: "cold_navigation" | "warm_reload";
  navigationMs: number;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  readyContentMs: number;
  fcpMs: number | null;
  lcpMs: number | null;
  domInteractiveMs: number | null;
  responseStartMs: number | null;
  transferSizeBytes: number | null;
  resourceCount: number | null;
  apiRequests: ApiMetric[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  instrumented: Metric[];
};

const results: RunResult[] = [];

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function summarize(values: number[]) {
  if (!values.length) {
    return { count: 0, min: null, median: null, p95: null, max: null, mean: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function rounded(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

async function waitForDashboardReady(page: Page) {
  if (READY_SELECTOR) {
    await page.locator(READY_SELECTOR).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    return;
  }

  // Prefer a stable app-owned marker if available. This fallback only proves
  // that a main landmark or dashboard route content is visible, not that every
  // background request or widget has finished.
  const candidates = [
    "main",
    '[role="main"]',
    '[data-testid="dashboard"]',
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.waitFor({ state: "visible", timeout: 10_000 });
      return;
    }
  }

  // Last-resort readiness signal; customize this for the app.
  await page.locator("body").waitFor({ state: "visible" });
}

async function collectBrowserMetrics(page: Page) {
  return page.evaluate(() => {
    const nav = (window as any).performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paint = (window as any).performance.getEntriesByType("paint");
    const fcp = paint.find((entry: PerformanceEntry) => entry.name === "first-contentful-paint");

    const lcpEntries = (window as any).__benchLcpEntries as
      | Array<{ startTime: number }>
      | undefined;
    const lcp = lcpEntries?.length
      ? lcpEntries[lcpEntries.length - 1].startTime
      : null;

    const resources = (window as any).performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const transferSize = resources.reduce(
      (sum, entry) => sum + (entry.transferSize || 0),
      0,
    );

    return {
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      loadEventMs: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : null,
      domInteractiveMs: nav ? nav.domInteractive : null,
      responseStartMs: nav ? nav.responseStart : null,
      fcpMs: fcp?.startTime ?? null,
      lcpMs: lcp,
      transferSizeBytes: transferSize,
      resourceCount: resources.length,
    };
  });
}

async function runMeasurement(
  page: Page,
  run: number,
  kind: RunResult["kind"],
): Promise<RunResult> {
  const apiRequests: ApiMetric[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestStart = new Map<Request, number>();

  const onRequest = (request: Request) => {
    requestStart.set(request, nodePerf.now());
  };

  const onResponse = (response: Response) => {
    const request = response.request();
    const started = requestStart.get(request);
    if (started == null) return;

    const url = response.url();
    if (request.resourceType() === "xhr" || request.resourceType() === "fetch") {
      apiRequests.push({
        method: request.method(),
        url,
        status: response.status(),
        durationMs: nodePerf.now() - started,
      });
    }
    requestStart.delete(request);
  };

  const onRequestFailed = (request: Request) => {
    const started = requestStart.get(request);
    if (started != null) {
      failedRequests.push(
        `${request.method()} ${request.url()} — ${request.failure()?.errorText || "request failed"}`,
      );
      requestStart.delete(request);
    }
  };

  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };

  const onPageError = (error: Error) => pageErrors.push(error.message);

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  // Capture LCP using the PerformanceObserver before navigation.
  await page.addInitScript(() => {
    (window as any).__benchLcpEntries = [];
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        (window as any).__benchLcpEntries.push(
          ...entries.map((entry: any) => ({ startTime: entry.startTime })),
        );
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Some browsers/environments do not support LCP entries.
    }
  });

  const start = nodePerf.now();

  if (kind === "cold_navigation") {
    await page.goto(ROUTE, { waitUntil: "load" });
  } else {
    await page.reload({ waitUntil: "load" });
  }

  const navigationMs = nodePerf.now() - start;

  await waitForDashboardReady(page);
  const readyContentMs = nodePerf.now() - start;

  // Give the browser a short window to publish paint/LCP entries. This is not
  // a guarantee that all async application work has finished.
  await page.waitForTimeout(100);
  const browserMetrics = await collectBrowserMetrics(page);

  const instrumented = await page.evaluate(() => {
    const getter = (window as any).__KIVO_BENCHMARK__?.get;
    return typeof getter === "function" ? getter() : [];
  }).catch(() => []);

  page.off("request", onRequest);
  page.off("response", onResponse);
  page.off("requestfailed", onRequestFailed);
  page.off("console", onConsole);
  page.off("pageerror", onPageError);

  return {
    run,
    kind,
    navigationMs,
    domContentLoadedMs: browserMetrics.domContentLoadedMs,
    loadEventMs: browserMetrics.loadEventMs,
    readyContentMs,
    fcpMs: browserMetrics.fcpMs,
    lcpMs: browserMetrics.lcpMs,
    domInteractiveMs: browserMetrics.domInteractiveMs,
    responseStartMs: browserMetrics.responseStartMs,
    transferSizeBytes: browserMetrics.transferSizeBytes,
    resourceCount: browserMetrics.resourceCount,
    apiRequests,
    consoleErrors,
    pageErrors,
    failedRequests,
    instrumented: Array.isArray(instrumented) ? instrumented : [],
  };
}

test.describe("Dashboard performance benchmark", () => {
  test.use({
    baseURL: BASE,
    // Keep normal browser cache behavior within a run. A new browser context
    // is created by Playwright for this test, but server/CDN caches may be warm.
  });

  test("measures cold navigation and warm reloads", async ({ page, context }) => {
    test.setTimeout(120_000);

    // Start with a clean context state. This does not clear server-side caches.
    // await context.clearCookies();

    // Record failed HTTP responses too; 4xx/5xx do not always emit requestfailed.
    const httpErrors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400) {
        httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    // First navigation: cold browser-context navigation.
    const first = await runMeasurement(page, 1, "cold_navigation");
    results.push(first);

    // Subsequent reloads: browser/app may have warmed caches.
    for (let i = 1; i < RUNS; i++) {
      await page.waitForTimeout(150);
      const result = await runMeasurement(page, i + 1, "warm_reload");
      results.push(result);
    }

    const report = {
      metadata: {
        baseURL: BASE,
        route: ROUTE,
        runsRequested: RUNS,
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || null,
        note:
          "Cold means first navigation in this Playwright context, not a guaranteed cold server/CDN/database cache. FCP/LCP are browser metrics and may be null in unsupported/headless environments.",
      },
      summary: {
        navigationMs: summarize(results.map((r) => r.navigationMs)),
        readyContentMs: summarize(results.map((r) => r.readyContentMs)),
        fcpMs: summarize(results.map((r) => r.fcpMs).filter((n): n is number => n != null)),
        lcpMs: summarize(results.map((r) => r.lcpMs).filter((n): n is number => n != null)),
        responseStartMs: summarize(
          results.map((r) => r.responseStartMs).filter((n): n is number => n != null),
        ),
      },
      httpErrors,
      runs: results,
    };

    const outputPath = path.resolve(OUTPUT);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

    console.log("\n=== DASHBOARD PERFORMANCE BENCHMARK ===");
    console.log(`URL: ${BASE}${ROUTE}`);
    console.log(`Runs: ${RUNS}`);
    console.log(`JSON report: ${outputPath}`);
    console.log("\nMetric (ms)              Min      Median   p95      Max      Mean");
    console.log("----------------------------------------------------------------");
    for (const [label, values] of [
      ["Navigation", results.map((r) => r.navigationMs)],
      ["Ready content", results.map((r) => r.readyContentMs)],
      ["FCP", results.map((r) => r.fcpMs).filter((n): n is number => n != null)],
      ["LCP", results.map((r) => r.lcpMs).filter((n): n is number => n != null)],
      ["Response start", results.map((r) => r.responseStartMs).filter((n): n is number => n != null)],
    ] as Array<[string, number[]]>) {
      const s = summarize(values);
      const fmt = (n: number | null) => (n == null ? "n/a" : n.toFixed(2).padStart(8));
      console.log(
        `${label.padEnd(23)} ${fmt(s.min)} ${fmt(s.median)} ${fmt(s.p95)} ${fmt(s.max)} ${fmt(s.mean)}`,
      );
    }

    console.log("\nErrors:");
    console.log(`HTTP errors: ${httpErrors.length}`);
    console.log(`Console errors: ${results.reduce((n, r) => n + r.consoleErrors.length, 0)}`);
    console.log(`Page errors: ${results.reduce((n, r) => n + r.pageErrors.length, 0)}`);
    console.log(`Failed requests: ${results.reduce((n, r) => n + r.failedRequests.length, 0)}`);
    console.log("=======================================\n");

    // Functional assertions: benchmark results are useful only if the route works.
    expect(page.url()).toContain(ROUTE);
    expect(results[0].navigationMs).toBeLessThan(30_000);
    expect(results[0].readyContentMs).toBeLessThan(30_000);

    // Optional strict error gate:
    // Uncomment after fixing existing app warnings/errors.
    // expect(httpErrors, "HTTP responses >= 400").toEqual([]);
    // expect(results.flatMap((r) => r.pageErrors), "uncaught page errors").toEqual([]);
  });
});
