import type { AppUser, Role } from "@/types";

/** Minimal session shape used by permission helpers. */
export type Viewer = { uid: string; role: Role };

export function canManageUsers(viewer: Viewer): boolean {
  return viewer.role === "admin";
}

export function canManageProjects(viewer: Viewer): boolean {
  return viewer.role === "admin" || viewer.role === "manager";
}

export function canUploadFiles(viewer: Viewer): boolean {
  return canManageProjects(viewer);
}

export function canSeeAdminAccounts(viewer: Viewer): boolean {
  return viewer.role === "admin";
}

/** Hide admins from non-admins everywhere (directory, friends, chat). */
export function isUserVisibleTo(viewer: Viewer, target: Pick<AppUser, "id" | "role">): boolean {
  if (target.id === viewer.uid) return true;
  if (target.role === "admin" && !canSeeAdminAccounts(viewer)) return false;
  return true;
}

export function visibleUsersFor(viewer: Viewer, users: AppUser[]): AppUser[] {
  return users.filter((user) => isUserVisibleTo(viewer, user));
}

/** Directory listing: never include self; hide admins for non-admins. */
export function directoryUsersFor(viewer: Viewer, users: AppUser[]): AppUser[] {
  return users.filter((user) => user.id !== viewer.uid && isUserVisibleTo(viewer, user));
}

export function canAccessProject(
  viewer: Viewer,
  project: { memberIds?: string[] },
): boolean {
  if (viewer.role !== "user") return true;
  return Array.isArray(project.memberIds) && project.memberIds.includes(viewer.uid);
}
