import { describe, expect, it } from "vitest";

type Comment = {
  id: string;
  task_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  content: string;
  author_email: string;
  created_at: string;
};

describe("Comment threading and hierarchy", () => {
  const sampleComments: Comment[] = [
    {
      id: "c1",
      task_id: "t1",
      project_id: "p1",
      parent_id: null,
      content: "Initial task discussion",
      author_email: "alice@test.com",
      created_at: new Date().toISOString(),
    },
    {
      id: "c2",
      task_id: "t1",
      project_id: "p1",
      parent_id: "c1",
      content: "Reply to alice @alice@test.com",
      author_email: "bob@test.com",
      created_at: new Date().toISOString(),
    },
    {
      id: "c3",
      task_id: null,
      project_id: "p1",
      parent_id: null,
      content: "General project comment",
      author_email: "carol@test.com",
      created_at: new Date().toISOString(),
    },
  ];

  it("correctly separates top-level comments and child replies", () => {
    const topLevel = sampleComments.filter((c) => !c.parent_id);
    const repliesByParent = sampleComments.reduce<Record<string, Comment[]>>(
      (acc, c) => {
        if (c.parent_id) {
          (acc[c.parent_id] ??= []).push(c);
        }
        return acc;
      },
      {},
    );

    expect(topLevel.length).toBe(2);
    expect(topLevel.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(repliesByParent["c1"].length).toBe(1);
    expect(repliesByParent["c1"][0].id).toBe("c2");
    expect(repliesByParent["c3"]).toBeUndefined();
  });

  it("handles general project comments without task_id", () => {
    const generalComments = sampleComments.filter((c) => !c.task_id);
    expect(generalComments.length).toBe(1);
    expect(generalComments[0].project_id).toBe("p1");
  });

  it("extracts mentions from content", () => {
    const content = "Hey @alice@test.com and @bob@test.com check this out";
    const parts = content.split(/(@\S+)/);
    const mentions = parts.filter((p) => p.startsWith("@") && p.length > 1);

    expect(mentions).toEqual(["@alice@test.com", "@bob@test.com"]);
  });
});

