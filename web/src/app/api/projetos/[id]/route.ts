import { withUser } from "@/lib/server/auth";
import { deleteProject, getProject, publicProject, refreshProject } from "@/lib/server/projects";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req, { params }: Ctx) => {
  const project = await getProject(user.id, (await params).id);
  if (!project) return Response.json({ detail: "projeto não encontrado" }, { status: 404 });
  return Response.json(publicProject(await refreshProject(project)));
});

export const DELETE = withUser(async (user, _req, { params }: Ctx) => {
  const project = await getProject(user.id, (await params).id);
  if (!project) return Response.json({ detail: "projeto não encontrado" }, { status: 404 });
  await deleteProject(project);
  return Response.json({ ok: true });
});
