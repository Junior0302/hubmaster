export type Role = "admin" | "manager" | "user";
export type ProjectStatus = "active" | "archived" | "draft";

export interface AppUser {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
  avatar?: string;
  createdAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  extension: string;
  size: number;
  url: string;
  uploadedBy: string;
  createdAt: string;
  folder?: string;
  /** Full Supabase object path, e.g. projects/{id}/{uuid}-name.pdf */
  storagePath?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  category?: string;
  client?: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  memberIds: string[];
  files: ProjectFile[];
}
