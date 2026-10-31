import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// The shader components need WebGL, which jsdom does not provide.
vi.mock("@paper-design/shaders-react", () => ({
  GrainGradient: () => null,
}));

// jsdom does not implement matchMedia, which the sidebar's mobile detection
// relies on.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
