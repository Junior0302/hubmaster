import type { AppUser, Project } from "@/types";

export const demoUsers: AppUser[] = [
  { id: "demo-admin", firstname: "John", lastname: "Martin", email: "admin@projecthub.fr", role: "admin", createdAt: "2026-01-08T10:00:00Z" },
  { id: "demo-manager", firstname: "Sophie", lastname: "Bernard", email: "sophie@projecthub.fr", role: "manager", createdAt: "2026-02-14T10:00:00Z" },
  { id: "demo-user", firstname: "Lucas", lastname: "Robert", email: "lucas@projecthub.fr", role: "user", createdAt: "2026-03-21T10:00:00Z" },
  { id: "u4", firstname: "Emma", lastname: "Petit", email: "emma@projecthub.fr", role: "user", createdAt: "2026-04-02T10:00:00Z" },
  { id: "u5", firstname: "Hugo", lastname: "Leroy", email: "hugo@projecthub.fr", role: "manager", createdAt: "2026-05-17T10:00:00Z" },
  { id: "u6", firstname: "Léa", lastname: "Moreau", email: "lea@projecthub.fr", role: "user", createdAt: "2026-06-09T10:00:00Z" },
];

export const demoProjects: Project[] = [
  {
    id: "alpha",
    title: "Projet Alpha",
    description: "Refonte complète de l’identité et du site de la marque.",
    category: "Design",
    client: "Maison Alpha",
    createdBy: "demo-admin",
    creatorName: "John Martin",
    createdAt: "2026-07-15T09:30:00Z",
    updatedAt: "2026-07-15T09:30:00Z",
    status: "active",
    memberIds: ["demo-admin", "demo-manager", "demo-user"],
    files: [
      { id: "f1", projectId: "alpha", filename: "cahier-des-charges.pdf", originalName: "Cahier des charges.pdf", extension: "pdf", size: 2400000, url: "#", uploadedBy: "demo-admin", createdAt: "2026-07-15T10:00:00Z" },
      { id: "f2", projectId: "alpha", filename: "logo.png", originalName: "Logo.png", extension: "png", size: 840000, url: "#", uploadedBy: "demo-manager", createdAt: "2026-07-15T11:00:00Z", folder: "images" },
      { id: "f3", projectId: "alpha", filename: "intro.mp4", originalName: "Intro.mp4", extension: "mp4", size: 18400000, url: "#", uploadedBy: "demo-user", createdAt: "2026-07-15T12:00:00Z", folder: "videos" },
    ],
  },
  {
    id: "beta",
    title: "Projet Beta",
    description: "Campagne de lancement du nouveau produit.",
    category: "Marketing",
    client: "Beta Studio",
    createdBy: "demo-manager",
    creatorName: "Sophie Bernard",
    createdAt: "2026-07-10T14:00:00Z",
    updatedAt: "2026-07-14T08:30:00Z",
    status: "active",
    memberIds: ["demo-admin", "demo-manager"],
    files: [],
  },
  {
    id: "nova",
    title: "Nova Mobile",
    description: "Application mobile de suivi client et espace fidélité.",
    category: "Application",
    client: "Nova Group",
    createdBy: "demo-admin",
    creatorName: "John Martin",
    createdAt: "2026-06-22T10:00:00Z",
    updatedAt: "2026-07-08T16:00:00Z",
    status: "draft",
    memberIds: ["demo-admin", "demo-user"],
    files: [],
  },
];
