import { getProject, versionPath } from "@/lib/server/projects";
import { storage } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

const FILES = new Set(["final.mp4", "thumb.jpg", "plan.json"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!FILES.has(name)) return new Response("Não encontrado", { status: 404 });
  const project = await getProject(id, false);
  if (!project) return new Response("Não encontrado", { status: 404 });
  return storage().serve(versionPath(id, project.versao, name));
}
