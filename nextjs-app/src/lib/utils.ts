export { cn } from "cn";

/**
 * Normalises text that may contain literal backslash-n escape sequences
 * (e.g. `\n`) into real line breaks. This prevents `\n` from being rendered
 * as literal text in the UI when data is serialised/deserialised between
 * systems.
 */
export function normalizeNewlines(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\\n/g, "\n");
}
