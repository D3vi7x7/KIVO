export type TaskOptionKind = "priority" | "status";

export interface TaskOption {
  id: string;
  kind: TaskOptionKind;
  value: string;
  name: string;
  color: string;
  builtin: boolean;
}

export const OPTION_COLORS = {
  low: "#868e96",
  medium: "#1971c2",
  high: "#f08c00",
  urgent: "#e03131",
  todo: "#868e96",
  in_progress: "#1971c2",
  review: "#9c36b5",
  done: "#2f9e44",
} as const;

/**
 * Fallback colours for the built-in options, used until the options have
 * loaded from the API.
 */
export const BUILTIN_OPTION_COLORS: Record<string, string> = {
  low: OPTION_COLORS.low,
  medium: OPTION_COLORS.medium,
  high: OPTION_COLORS.high,
  urgent: OPTION_COLORS.urgent,
  todo: OPTION_COLORS.todo,
  in_progress: OPTION_COLORS.in_progress,
  review: OPTION_COLORS.review,
  done: OPTION_COLORS.done,
};

export const BUILTIN_OPTION_NAMES: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const DEFAULT_PRIORITY_VALUE = "medium";
export const DEFAULT_STATUS_VALUE = "todo";
