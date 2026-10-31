import "server-only";

import { cookies } from "next/headers";

import { API_URL } from "@/lib/api";
import type { Note } from "@/lib/notes";
import type { Project, ProjectResource, Task } from "@/lib/projects";
import type { Space } from "@/lib/spaces";

export type SessionUser = {
  email: string;
};

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSpaces(): Promise<Space[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/spaces`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Space[];
  } catch {
    return [];
  }
}

export async function getSpace(spaceId: string): Promise<Space | null> {
  const token = await getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/spaces/${spaceId}`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as Space;
  } catch {
    return null;
  }
}

export async function getNotes(
  spaceId: string,
  projectId?: string | null,
): Promise<Note[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const query = projectId ? `?project_id=${projectId}` : "";
    const res = await fetch(
      `${API_URL}/spaces/${spaceId}/notes${query}`,
      {
        headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Note[];
  } catch {
    return [];
  }
}

export async function getSpaceProjects(spaceId: string): Promise<Project[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/spaces/${spaceId}/projects`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Project[];
  } catch {
    return [];
  }
}

export async function getProjects(): Promise<Project[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/projects`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Project[];
  } catch {
    return [];
  }
}

export async function getProject(projectId: string): Promise<Project | null> {  const token = await getAccessToken();

  if (!token) {
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/projects/${projectId}`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as Project;
  } catch {
    return null;
  }
}

export async function getTasks(projectId: string): Promise<Task[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/tasks`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Task[];
  } catch {
    return [];
  }
}

export async function getResources(projectId: string): Promise<ProjectResource[]> {
  const token = await getAccessToken();

  if (!token) {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/resources`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as ProjectResource[];
  } catch {
    return [];
  }
}
