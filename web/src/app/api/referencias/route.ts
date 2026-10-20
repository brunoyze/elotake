// Mede o ritmo de corte de um vídeo de referência (roda o motor numa máquina temporária).
import { withUser } from "@/lib/server/auth";
import { isUploadPath } from "@/lib/server/projects";
import { type JobHandle, readJobStatus, startJob, stopJob } from "@/lib/server/runner";
import { storage } from "@/lib/server/storage";
import { TERMINAL } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withUser(async (user, req) => {
  const { video } = (await req.json()) as { video?: string };
  if (!isUploadPath(video, user.id)) return Response.json({ detail: "envie o vídeo primeiro" }, { status: 400 });
  const key = `ref-${crypto.randomUUID().slice(0, 8)}`;
  const handle = await startJob(
    { tipo: "referencia", entradas: { video: await storage().downloadTarget(video) } },
    key,
  );
  return Response.json({ job: handle });
});

export const GET = withUser(async (user, req) => {
  const url = new URL(req.url);
  const handle: JobHandle = {
    kind: url.searchParams.get("kind") === "local" ? "local" : "sandbox",
    id: url.searchParams.get("id") ?? "",
    iniciado_em: 0,
  };
  const status = await readJobStatus(handle);
  if (status && TERMINAL.includes(status.status)) {
    await stopJob(handle);
    const video = url.searchParams.get("video");
    if (isUploadPath(video, user.id)) await storage().deletePrefix(video.slice(0, video.lastIndexOf("/") + 1));
  }
  return Response.json(status ?? { status: "preparando", progresso: 0 });
});
