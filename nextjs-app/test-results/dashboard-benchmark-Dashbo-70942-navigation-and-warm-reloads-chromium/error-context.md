# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard-benchmark.spec.ts >> Dashboard performance benchmark >> measures cold navigation and warm reloads
- Location: tests\dashboard-benchmark.spec.ts:264:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "/dashboard/spaces"
Received string:    "http://localhost:3000/auth"
```

# Page snapshot

```yaml
- generic [active] [ref=f4e1]:
  - generic [ref=f4e4]:
    - generic [ref=f4e6]:
      - generic [ref=f4e7]:
        - heading "Welcome back" [level=1] [ref=f4e8]
        - paragraph [ref=f4e9]: Brainstrom in chat, build in cowork
      - generic [ref=f4e10]:
        - button "Continue with Google" [ref=f4e11]
        - button "Continue with Apple" [ref=f4e17]
      - generic [ref=f4e23]: or
      - generic [ref=f4e24]:
        - generic [ref=f4e25]:
          - textbox "Email" [ref=f4e26]:
            - /placeholder: you@example.com
          - generic [ref=f4e27]: Email
        - generic [ref=f4e29]:
          - checkbox "By creating an account, you agree to our Terms and Services and Privacy Policy" [ref=f4e31]
          - generic [ref=f4e32]:
            - text: By creating an account, you agree to our
            - link "Terms and Services" [ref=f4e33] [cursor=pointer]:
              - /url: "#"
            - text: and
            - link "Privacy Policy" [ref=f4e34] [cursor=pointer]:
              - /url: "#"
        - button "Continue with email" [ref=f4e35]
      - paragraph [ref=f4e36]:
        - text: New to KIVO?
        - button "Create an account" [ref=f4e37]
    - generic [ref=f4e41]:
      - heading "Think fast, Build faster" [level=2] [ref=f4e42]: Think fast,Build faster
      - link "Download the windows app" [ref=f4e43] [cursor=pointer]:
        - /url: "#"
  - button "Open Next.js Dev Tools" [ref=f4e55] [cursor=pointer]
  - alert [ref=f4e59]
```

# Test source

```ts
  244 |     lcpMs: browserMetrics.lcpMs,
  245 |     domInteractiveMs: browserMetrics.domInteractiveMs,
  246 |     responseStartMs: browserMetrics.responseStartMs,
  247 |     transferSizeBytes: browserMetrics.transferSizeBytes,
  248 |     resourceCount: browserMetrics.resourceCount,
  249 |     apiRequests,
  250 |     consoleErrors,
  251 |     pageErrors,
  252 |     failedRequests,
  253 |     instrumented: Array.isArray(instrumented) ? instrumented : [],
  254 |   };
  255 | }
  256 | 
  257 | test.describe("Dashboard performance benchmark", () => {
  258 |   test.use({
  259 |     baseURL: BASE,
  260 |     // Keep normal browser cache behavior within a run. A new browser context
  261 |     // is created by Playwright for this test, but server/CDN caches may be warm.
  262 |   });
  263 | 
  264 |   test("measures cold navigation and warm reloads", async ({ page, context }) => {
  265 |     test.setTimeout(120_000);
  266 | 
  267 |     // Start with a clean context state. This does not clear server-side caches.
  268 |     // await context.clearCookies();
  269 | 
  270 |     // Record failed HTTP responses too; 4xx/5xx do not always emit requestfailed.
  271 |     const httpErrors: string[] = [];
  272 |     page.on("response", (response) => {
  273 |       if (response.status() >= 400) {
  274 |         httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  275 |       }
  276 |     });
  277 | 
  278 |     // First navigation: cold browser-context navigation.
  279 |     const first = await runMeasurement(page, 1, "cold_navigation");
  280 |     results.push(first);
  281 | 
  282 |     // Subsequent reloads: browser/app may have warmed caches.
  283 |     for (let i = 1; i < RUNS; i++) {
  284 |       await page.waitForTimeout(150);
  285 |       const result = await runMeasurement(page, i + 1, "warm_reload");
  286 |       results.push(result);
  287 |     }
  288 | 
  289 |     const report = {
  290 |       metadata: {
  291 |         baseURL: BASE,
  292 |         route: ROUTE,
  293 |         runsRequested: RUNS,
  294 |         timestamp: new Date().toISOString(),
  295 |         nodeEnv: process.env.NODE_ENV || null,
  296 |         note:
  297 |           "Cold means first navigation in this Playwright context, not a guaranteed cold server/CDN/database cache. FCP/LCP are browser metrics and may be null in unsupported/headless environments.",
  298 |       },
  299 |       summary: {
  300 |         navigationMs: summarize(results.map((r) => r.navigationMs)),
  301 |         readyContentMs: summarize(results.map((r) => r.readyContentMs)),
  302 |         fcpMs: summarize(results.map((r) => r.fcpMs).filter((n): n is number => n != null)),
  303 |         lcpMs: summarize(results.map((r) => r.lcpMs).filter((n): n is number => n != null)),
  304 |         responseStartMs: summarize(
  305 |           results.map((r) => r.responseStartMs).filter((n): n is number => n != null),
  306 |         ),
  307 |       },
  308 |       httpErrors,
  309 |       runs: results,
  310 |     };
  311 | 
  312 |     const outputPath = path.resolve(OUTPUT);
  313 |     fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  314 |     fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  315 | 
  316 |     console.log("\n=== DASHBOARD PERFORMANCE BENCHMARK ===");
  317 |     console.log(`URL: ${BASE}${ROUTE}`);
  318 |     console.log(`Runs: ${RUNS}`);
  319 |     console.log(`JSON report: ${outputPath}`);
  320 |     console.log("\nMetric (ms)              Min      Median   p95      Max      Mean");
  321 |     console.log("----------------------------------------------------------------");
  322 |     for (const [label, values] of [
  323 |       ["Navigation", results.map((r) => r.navigationMs)],
  324 |       ["Ready content", results.map((r) => r.readyContentMs)],
  325 |       ["FCP", results.map((r) => r.fcpMs).filter((n): n is number => n != null)],
  326 |       ["LCP", results.map((r) => r.lcpMs).filter((n): n is number => n != null)],
  327 |       ["Response start", results.map((r) => r.responseStartMs).filter((n): n is number => n != null)],
  328 |     ] as Array<[string, number[]]>) {
  329 |       const s = summarize(values);
  330 |       const fmt = (n: number | null) => (n == null ? "n/a" : n.toFixed(2).padStart(8));
  331 |       console.log(
  332 |         `${label.padEnd(23)} ${fmt(s.min)} ${fmt(s.median)} ${fmt(s.p95)} ${fmt(s.max)} ${fmt(s.mean)}`,
  333 |       );
  334 |     }
  335 | 
  336 |     console.log("\nErrors:");
  337 |     console.log(`HTTP errors: ${httpErrors.length}`);
  338 |     console.log(`Console errors: ${results.reduce((n, r) => n + r.consoleErrors.length, 0)}`);
  339 |     console.log(`Page errors: ${results.reduce((n, r) => n + r.pageErrors.length, 0)}`);
  340 |     console.log(`Failed requests: ${results.reduce((n, r) => n + r.failedRequests.length, 0)}`);
  341 |     console.log("=======================================\n");
  342 | 
  343 |     // Functional assertions: benchmark results are useful only if the route works.
> 344 |     expect(page.url()).toContain(ROUTE);
      |                        ^ Error: expect(received).toContain(expected) // indexOf
  345 |     expect(results[0].navigationMs).toBeLessThan(30_000);
  346 |     expect(results[0].readyContentMs).toBeLessThan(30_000);
  347 | 
  348 |     // Optional strict error gate:
  349 |     // Uncomment after fixing existing app warnings/errors.
  350 |     // expect(httpErrors, "HTTP responses >= 400").toEqual([]);
  351 |     // expect(results.flatMap((r) => r.pageErrors), "uncaught page errors").toEqual([]);
  352 |   });
  353 | });
  354 | 
```