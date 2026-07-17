import type { Role } from "@/types";

export function roleLabel(role: Role): string {
  return { admin: "Administrateur", manager: "Manager", user: "Utilisateur" }[role];
}
