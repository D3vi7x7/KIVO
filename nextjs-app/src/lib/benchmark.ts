"use client"

/**
 * Page load / refresh benchmark helper.
 *
 * Call measure(label, fn) around navigations or data fetches to record
 * timings. Results are logged to the console and exposed on
 * window.__KIVO_BENCHMARK__ for harvesting by Playwright.
 */

type Timing = { label: string; start: number; end: number; ms: number }

const store: Timing[] = []

export function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  return fn().then(
    (value) => {
      const end = performance.now()
      store.push({ label, start, end, ms: end - start })
      console.log(`[bench] ${label}: ${(end - start).toFixed(2)} ms`)
      return value
    },
    (err) => {
      const end = performance.now()
      store.push({ label, start, end, ms: end - start })
      console.log(`[bench] ${label}: FAILED after ${(end - start).toFixed(2)} ms`)
      throw err
    },
  )
}

export function getBenchmarks(): Timing[] {
  return store
}

if (typeof window !== "undefined") {
  ;(window as any).__KIVO_BENCHMARK__ = {
    get: getBenchmarks,
    clear: () => {
      store.length = 0
    },
  }
}
