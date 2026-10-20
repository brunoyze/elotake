import { loadProfile, saveProfile } from "@/lib/server/projects";
import type { StyleProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const profile = await loadProfile((await params).id);
  return profile ? Response.json(profile) : Response.json({ detail: "perfil não encontrado" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const body = (await req.json()) as StyleProfile;
    return Response.json(await saveProfile((await params).id, body));
  } catch (err) {
    return Response.json({ detail: (err as Error).message }, { status: 400 });
  }
}
