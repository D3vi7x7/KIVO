import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { EMPTY_SPACE_DATA, SpaceBento } from "@/components/space-bento";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function gridClasses() {
  const { container } = render(
    <SpaceBento spaceId="space-1" data={EMPTY_SPACE_DATA} />,
  );
  const grid = container.querySelector('[class*="lg:grid-cols-6"]');

  return Array.from(grid?.querySelectorAll(':scope > *') ?? []).map(
    (el) => el.className,
  );
}

describe("SpaceBento", () => {
  it("renders the projects and notes it is given", () => {
    render(
      <SpaceBento
        spaceId="space-1"
        data={EMPTY_SPACE_DATA}
        projects={[
          {
            id: "project-1",
            space_id: "space-1",
            name: "Website redesign",
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
          },
        ]}
        notes={[
          {
            id: "note-1",
            space_id: "space-1",
            project_id: null,
            title: "Sprint notes",
            content: "<p>hi</p>",
            background: "#ffffff",
            color: "#000000",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Website redesign")).toBeInTheDocument();
    expect(screen.getByText("Sprint notes")).toBeInTheDocument();
  });

  it("renders all six sections", () => {
    render(<SpaceBento spaceId="space-1" data={EMPTY_SPACE_DATA} />);

    expect(screen.getByText("Recents")).toBeInTheDocument();
    expect(screen.getByText("Upcoming deadlines")).toBeInTheDocument();
    expect(screen.getByText("Docs & notes")).toBeInTheDocument();
    expect(screen.getByText("Folders & projects")).toBeInTheDocument();
    expect(screen.getByText("Workload by status")).toBeInTheDocument();
    expect(screen.getByText("Attachments")).toBeInTheDocument();
  });

  it("lays out the first row as three equal columns with a min height", () => {
    const classes = gridClasses();

    // Recents, deadlines, docs
    for (const index of [0, 1, 2]) {
      expect(classes[index]).toContain("lg:col-span-2");
      expect(classes[index]).toContain("min-h-[350px]");
    }
  });

  it("spans folders and projects across the full width", () => {
    const classes = gridClasses();

    expect(classes[3]).toContain("lg:col-span-6");
    expect(classes[3]).not.toContain("min-h-[350px]");
  });

  it("places workload and attachments side by side", () => {
    const classes = gridClasses();

    expect(classes[4]).toContain("lg:col-span-3");
    expect(classes[5]).toContain("lg:col-span-3");
  });
});
