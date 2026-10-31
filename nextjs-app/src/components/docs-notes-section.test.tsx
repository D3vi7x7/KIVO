import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DocsNotesSection } from "@/components/docs-notes-section";
import type { Note } from "@/lib/notes";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    space_id: "space-1",
    project_id: null,
    title: "Sprint notes",
    content: "<p>Hello</p>",
    background: "#fff3bf",
    color: "#000000",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DocsNotesSection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the create button", () => {
    render(<DocsNotesSection spaceId="space-1" />);

    expect(
      screen.getByRole("button", { name: /Create a note\/doc/ }),
    ).toBeInTheDocument();
  });

  it("lists existing notes with their background colour", () => {
    render(<DocsNotesSection spaceId="space-1" initialNotes={[makeNote()]} />);

    expect(screen.getByText("Sprint notes")).toBeInTheDocument();
  });

  it("opens the editor when the create button is clicked", async () => {
    const user = userEvent.setup();
    render(<DocsNotesSection spaceId="space-1" />);

    await user.click(screen.getByRole("button", { name: /Create a note\/doc/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Create a note/doc")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Title")).toBeInTheDocument();
  });

  it("saves a new note and adds it to the list", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeNote({ id: "note-2", title: "Fresh note" })),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<DocsNotesSection spaceId="space-1" />);

    await user.click(screen.getByRole("button", { name: /Create a note\/doc/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Title"), "Fresh note");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/spaces/space-1/notes",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title).toBe("Fresh note");
    expect(body.background).toBe("#ffffff");

    await waitFor(() => {
      expect(screen.getByText("Fresh note")).toBeInTheDocument();
    });
  });

  it("surfaces a save error", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Space not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<DocsNotesSection spaceId="space-1" />);

    await user.click(screen.getByRole("button", { name: /Create a note\/doc/ }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(within(dialog).getByText("Space not found")).toBeInTheDocument();
    });
  });
});
