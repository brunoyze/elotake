import { deleteProject, getProject, publicProject, refreshProject } from "@/lib/server/projects";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const project = await getProject((await params).id);
  if (!project) return Response.json({ detail: "projeto não encontrado" }, { status: 404 });
  return Response.json(publicProject(await refreshProject(project)));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const project = await getProject((await params).id);
  if (!project) return Response.json({ detail: "projeto não encontrado" }, { status: 404 });
  await deleteProject(project);
  return Response.json({ ok: true });
}
