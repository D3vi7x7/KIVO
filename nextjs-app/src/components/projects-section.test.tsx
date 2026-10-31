import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectsSection } from "@/components/projects-section";
import type { Project } from "@/lib/projects";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: refreshMock, push: pushMock, replace: vi.fn() }),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    space_id: "space-1",
    name: "Website redesign",
    kind: "project",
    description: "",
    color: "#e4e4e9",
    owner: "user@example.com",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    task_count: 4,
    open_task_count: 2,
    resource_count: 3,
    note_count: 5,
    ...overrides,
  };
}

describe("ProjectsSection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the add project button", () => {
    render(<ProjectsSection spaceId="space-1" />);

    expect(
      screen.getByRole("button", { name: /Add project\/Folder/ }),
    ).toBeInTheDocument();
  });

  it("renders a folder card for each project", () => {
    render(
      <ProjectsSection
        spaceId="space-1"
        initialProjects={[
          makeProject(),
          makeProject({
            id: "p2",
            name: "Brand",
            task_count: 1,
            open_task_count: 0,
            resource_count: 0,
            note_count: 0,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Website redesign")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("4 tasks")).toBeInTheDocument();
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText("5 notes")).toBeInTheDocument();
  });

  it("opens the create dialog and posts the new project", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeProject({ id: "project-2", name: "Website redesign" })),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<ProjectsSection spaceId="space-1" />);

    await user.click(screen.getByRole("button", { name: /Add project\/Folder/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("Website redesign"),
      "Website redesign",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/spaces/space-1/projects",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: "Website redesign", kind: "project", color: "#e4e4e9" });
  });

  it("surfaces a create error", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "A project with that name already exists" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<ProjectsSection spaceId="space-1" />);

    await user.click(screen.getByRole("button", { name: /Add project\/Folder/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("Website redesign"),
      "Dup",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        within(dialog).getByText("A project with that name already exists"),
      ).toBeInTheDocument();
    });
  });

  it("toggles the folder on a single click instead of navigating", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProjectsSection spaceId="space-1" initialProjects={[makeProject()]} />,
    );

    const hit = container.querySelector(".gf-hit") as HTMLElement;
    expect(hit).toBeTruthy();

    await user.click(hit);

    // The folder opens, and nothing is pushed.
    await waitFor(() => {
      expect(container.querySelector(".gf-root")?.getAttribute("data-open")).toBe(
        "true",
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("opens the project on a double click", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProjectsSection spaceId="space-1" initialProjects={[makeProject()]} />,
    );

    const hit = container.querySelector(".gf-hit") as HTMLElement;

    await user.dblClick(hit);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/dashboard/spaces/space-1/projects/project-1",
      );
    });
  });

  it("refreshes the server components when a project is deleted", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Project deleted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <ProjectsSection spaceId="space-1" initialProjects={[makeProject()]} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remove Website redesign" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    // The sidebar is rendered by the server, so it only drops the project
    // once the server components are refreshed.
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
