import { withUser } from "@/lib/server/auth";
import { loadProfile, saveProfile } from "@/lib/server/projects";
import type { StyleProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser(async (user, _req, { params }: Ctx) => {
  const profile = await loadProfile(user.id, (await params).id);
  return profile ? Response.json(profile) : Response.json({ detail: "perfil não encontrado" }, { status: 404 });
});

export const PUT = withUser(async (user, req, { params }: Ctx) => {
  try {
    const body = (await req.json()) as StyleProfile;
    return Response.json(await saveProfile(user.id, (await params).id, body));
  } catch (err) {
    return Response.json({ detail: (err as Error).message }, { status: 400 });
  }
});
