import { withUser } from "@/lib/server/auth";
import { getProject, loadProfile, publicProject, redoProject } from "@/lib/server/projects";
import type { Brief } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withUser(async (user, req, { params }: { params: Promise<{ id: string }> }) => {
  const project = await getProject(user.id, (await params).id);
  if (!project) return Response.json({ detail: "projeto não encontrado" }, { status: 404 });
  const body = (await req.json()) as { brief?: Brief; profile_id?: string };
  if (body.profile_id && !(await loadProfile(user.id, body.profile_id))) {
    return Response.json({ detail: "perfil de estilo não encontrado" }, { status: 404 });
  }
  try {
    return Response.json(publicProject(await redoProject(project, body)));
  } catch (err) {
    return Response.json({ detail: (err as Error).message }, { status: 409 });
  }
});
