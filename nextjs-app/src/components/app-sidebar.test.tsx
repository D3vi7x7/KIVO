import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

function renderSidebar(props: { email?: string } = {}) {
  const result = render(
    <SidebarProvider>
      <AppSidebar email={props.email ?? "harshit.sharma@example.com"} />
    </SidebarProvider>,
  );

  const footer = result.container.querySelector(
    '[data-slot="sidebar-footer"]',
  ) as HTMLElement;

  return { ...result, footer };
}

describe("AppSidebar", () => {
  it("shows the Work section with Spaces and Boards", () => {
    renderSidebar();

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Spaces")).toBeInTheDocument();
    expect(screen.getByText("Boards")).toBeInTheDocument();
  });

  it("shows the App section with nothing under it", () => {
    const { container } = renderSidebar();

    expect(screen.getByText("App")).toBeInTheDocument();

    const groups = container.querySelectorAll('[data-slot="sidebar-group"]');
    const appGroup = Array.from(groups).find((group) =>
      group.textContent?.includes("App"),
    );

    expect(appGroup).toBeDefined();
    // The label is present, but no menu items live under it.
    expect(
      appGroup?.querySelectorAll('[data-slot="sidebar-menu-item"]'),
    ).toHaveLength(0);
  });

  it("shows the account email and initials in the footer", () => {
    const { footer } = renderSidebar();

    expect(within(footer).getByText("harshit.sharma@example.com")).toBeInTheDocument();
    expect(within(footer).getByText("HS")).toBeInTheDocument();
  });

  it("falls back to initials when there is no email", () => {
    const { footer } = renderSidebar({ email: "" });

    expect(within(footer).getByText("K")).toBeInTheDocument();
  });

  it("opens the account menu with a settings item", async () => {
    const user = userEvent.setup();
    const { footer } = renderSidebar();

    const trigger = within(footer).getByRole("button", {
      name: /harshit\.sharma@example\.com/i,
    });

    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });
});
