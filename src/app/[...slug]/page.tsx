import { ProjectHubApp } from "@/components/projecthub-app";

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  return <ProjectHubApp slug={slug} />;
}
