import { createProject, isUploadPath, listProjects, loadProfile, publicProject } from "@/lib/server/projects";
import type { Brief } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json((await listProjects()).map(publicProject));
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    nome?: string;
    profile_id?: string;
    brief?: Brief;
    video?: string;
    musica?: string | null;
  };
  if (!isUploadPath(body.video) || (body.musica && !isUploadPath(body.musica))) {
    return Response.json({ detail: "envie o vídeo antes de criar o projeto" }, { status: 400 });
  }
  const profileId = body.profile_id ?? "dinamico";
  if (!(await loadProfile(profileId))) {
    return Response.json({ detail: "perfil de estilo não encontrado" }, { status: 404 });
  }
  const project = await createProject({
    nome: body.nome ?? "vídeo",
    profile_id: profileId,
    brief: {
      plataforma: "reels",
      objetivo: "",
      duracao_max: null,
      reenquadrar: "crop",
      efeitos: null,
      ...body.brief,
    },
    source: body.video,
    music: body.musica ?? null,
  });
  return Response.json(publicProject(project));
}
