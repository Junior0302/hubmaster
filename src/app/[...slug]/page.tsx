import { notFound } from "next/navigation";
import { ProjectHubApp } from "@/components/projecthub-app";

const allowed = new Set([
  "login",
  "signup",
  "dashboard",
  "projects",
  "users",
  "profile",
  "settings",
]);

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const root = slug[0];

  if (root === "api" || !allowed.has(root)) {
    notFound();
  }

  return <ProjectHubApp slug={slug} />;
}
