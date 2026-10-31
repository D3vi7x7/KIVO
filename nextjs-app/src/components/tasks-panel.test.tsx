import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TasksPanel } from "@/components/tasks-panel";
import { TaskOptionsProvider } from "@/hooks/use-task-options";
import type { Task } from "@/lib/projects";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    space_id: "space-1",
    title: "Ship landing page",
    description: "",
    assignee: "Harshit",
    assigned_to: "Design team",
    priority: "high",
    status: "in_progress",
    due_date: "2026-11-20",
    subtasks: [
      { id: "s1", title: "Copy", done: true },
      { id: "s2", title: "Hero", done: false },
    ],
    progress: 50,
    order: 0,
    owner: "user@example.com",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const taskOptionsResponse = () =>
  new Response(
    JSON.stringify([
      { id: "priority:low", kind: "priority", value: "low", name: "Low", color: "#868e96", builtin: true },
      { id: "priority:medium", kind: "priority", value: "medium", name: "Medium", color: "#1971c2", builtin: true },
      { id: "priority:high", kind: "priority", value: "high", name: "High", color: "#f08c00", builtin: true },
      { id: "priority:urgent", kind: "priority", value: "urgent", name: "Urgent", color: "#e03131", builtin: true },
      { id: "status:todo", kind: "status", value: "todo", name: "To do", color: "#868e96", builtin: true },
      { id: "status:in_progress", kind: "status", value: "in_progress", name: "In progress", color: "#1971c2", builtin: true },
      { id: "status:review", kind: "status", value: "review", name: "Review", color: "#9c36b5", builtin: true },
      { id: "status:done", kind: "status", value: "done", name: "Done", color: "#2f9e44", builtin: true },
    ]),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

function renderPanel(props: { initialTasks?: Task[]; projectId?: string } = {}) {
  return render(
    <TaskOptionsProvider>
      <TasksPanel projectId={props.projectId ?? "project-1"} initialTasks={props.initialTasks} />
    </TaskOptionsProvider>,
  );
}

describe("TasksPanel", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/task-options")) {
        return Promise.resolve(taskOptionsResponse());
      }
      if (typeof url === "string" && url.includes("/api/tasks/") && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              makeTask({
                subtasks: [
                  { id: "s1", title: "Copy", done: true },
                  { id: "s2", title: "Hero", done: true },
                ],
                progress: 100,
              }),
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (typeof url === "string" && url.includes("/api/projects/") && url.includes("/tasks") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(makeTask({ id: "task-9", title: "New one" })), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(undefined as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the three view tabs", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendar" })).toBeInTheDocument();
  });

  it("lists tasks in a table with their fields", () => {
    renderPanel({ initialTasks: [makeTask()] });
    expect(screen.getByText("Ship landing page")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Harshit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Design team")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows subtasks indented under their task with a checkbox", () => {
    renderPanel({
      initialTasks: [
        makeTask({
          subtasks: [
            { id: "s1", title: "Copy", done: true },
            { id: "s2", title: "Hero", done: false },
          ],
        }),
      ],
    });
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Copy" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Hero" })).not.toBeChecked();
  });

  it("marks a subtask complete and updates progress", async () => {
    const user = userEvent.setup();
    renderPanel({
      initialTasks: [
        makeTask({
          subtasks: [
            { id: "s1", title: "Copy", done: true },
            { id: "s2", title: "Hero", done: false },
          ],
        }),
      ],
    });

    await user.click(screen.getByRole("checkbox", { name: "Hero" }));

    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  it("groups tasks into status columns in the board view", async () => {
    const user = userEvent.setup();
    renderPanel({
      initialTasks: [
        makeTask(),
        makeTask({ id: "task-2", title: "Write copy", status: "todo" }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(screen.getByText("Write copy")).toBeInTheDocument();
  });

  it("shows tasks on their due date in the calendar view", async () => {
    const user = userEvent.setup();
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    renderPanel({ initialTasks: [makeTask({ due_date: due })] });
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    const monthLabel = now.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    expect(screen.getByText(monthLabel)).toBeInTheDocument();
    expect(screen.getByText("Ship landing page")).toBeInTheDocument();
  });

  it("creates a task through the form", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Add task" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("What needs doing?"),
      "New one",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("New one")).toBeInTheDocument();
    });
  });

  it("reports progress from the completion checklist", () => {
    renderPanel({
      initialTasks: [
        makeTask({
          subtasks: [
            { id: "s1", title: "a", done: true },
            { id: "s2", title: "b", done: true },
            { id: "s3", title: "c", done: false },
          ],
          progress: 67,
        }),
      ],
    });
    expect(screen.getByText("67%")).toBeInTheDocument();
  });
});
