import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SpacesNav } from "@/components/spaces-nav";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";
import type { Space } from "@/lib/spaces";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    space_id: "space-1",
    name: "Website",
    kind: "project",
    description: "",
    color: "#e4e4e9",
    owner: "user@example.com",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    task_count: 0,
    open_task_count: 0,
    resource_count: 0,
    note_count: 0,
    ...overrides,
  };
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: "space-1",
    name: "Product Launch",
    description: "",
    owner: "user@example.com",
    created_at: "2026-01-01T00:00:00Z",
    item_count: 0,
    ...overrides,
  };
}

function renderSpacesNav(
  props: { initialSpaces?: Space[]; initialProjects?: Project[] } = {},
) {
  return render(
    <SidebarProvider>
      <SpacesNav
        initialSpaces={props.initialSpaces}
        initialProjects={props.initialProjects}
      />
    </SidebarProvider>,
  );
}

describe("SpacesNav", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/dashboard");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Spaces trigger", () => {
    renderSpacesNav();

    expect(screen.getByText("Spaces")).toBeInTheDocument();
  });

  it("lists spaces when expanded", async () => {
    const user = userEvent.setup();
    renderSpacesNav({ initialSpaces: [makeSpace()] });

    const trigger = screen.getByRole("button", { name: /Spaces/ });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Product Launch")).toBeInTheDocument();
    });
  });

  it("links each space to its page", async () => {
    const user = userEvent.setup();
    renderSpacesNav({ initialSpaces: [makeSpace()] });

    await user.click(screen.getByRole("button", { name: /Spaces/ }));

    const link = await screen.findByRole("link", { name: "Product Launch" });
    expect(link).toHaveAttribute("href", "/dashboard/spaces/space-1");
  });

  it("nests a project's link under the space that owns it", async () => {
    const user = userEvent.setup();
    renderSpacesNav({
      initialSpaces: [makeSpace()],
      initialProjects: [
        makeProject({ id: "project-1", space_id: "space-1", name: "Website" }),
        makeProject({ id: "project-2", space_id: "other-space", name: "Elsewhere" }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /Spaces/ }));

    const projectLink = await screen.findByRole("link", { name: "Website" });
    expect(projectLink).toHaveAttribute(
      "href",
      "/dashboard/spaces/space-1/projects/project-1",
    );

    // A project belonging to a different space is not listed here.
    expect(screen.queryByRole("link", { name: "Elsewhere" })).toBeNull();
  });

  it("opens the create dialog and creates a space", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeSpace({ id: "space-2", name: "Design" })), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderSpacesNav({ initialSpaces: [makeSpace()] });

    await user.click(screen.getByRole("button", { name: /Spaces/ }));
    await user.click(await screen.findByRole("button", { name: /New space/ }));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByPlaceholderText("Space name");

    await user.type(input, "Design");
    await user.click(within(dialog).getByRole("button", { name: "Create space" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/spaces",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Design" });

    await waitFor(() => {
      expect(screen.getByText("Design")).toBeInTheDocument();
    });
  });

  it("surfaces a server error when creation fails", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "A space with that name already exists" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderSpacesNav();

    await user.click(screen.getByRole("button", { name: /Spaces/ }));
    await user.click(await screen.findByRole("button", { name: /New space/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Space name"), "Dup");
    await user.click(within(dialog).getByRole("button", { name: "Create space" }));

    await waitFor(() => {
      expect(
        within(dialog).getByText("A space with that name already exists"),
      ).toBeInTheDocument();
    });
  });
});
