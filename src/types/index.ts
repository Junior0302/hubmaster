export type Role = "admin" | "manager" | "user";
export type ProjectStatus = "active" | "archived" | "draft";
export type FriendshipStatus = "pending" | "accepted" | "declined";

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

export interface Friendship {
  id: string;
  pairKey: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  /** Populated for API responses */
  otherUser?: AppUser;
}

export interface Conversation {
  id: string;
  pairKey: string;
  participantIds: string[];
  updatedAt: string;
  lastMessage?: string;
  lastSenderId?: string;
  lastReadAt?: Record<string, string>;
  otherUser?: AppUser;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}
