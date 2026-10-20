// Upload do vídeo bruto e da música.
// Na Vercel, o navegador manda o arquivo direto para o Blob com um token de upload
// de uso único que esta rota emite (o arquivo não passa pela função). Em desenvolvimento, recebe o arquivo aqui.
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { requestHasAccess } from "@/lib/access";
import { isUploadPath } from "@/lib/server/projects";
import { storage } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 ** 3;

export async function POST(request: Request) {
  if (!(await requestHasAccess(request))) return Response.json({ detail: "sem acesso" }, { status: 401 });
  if (storage().kind === "local") {
    const form = await request.formData();
    const file = form.get("file");
    const pathname = form.get("pathname");
    if (!(file instanceof File) || !isUploadPath(pathname)) {
      return Response.json({ detail: "upload inválido" }, { status: 400 });
    }
    await storage().saveUpload(pathname, file);
    return Response.json({ pathname });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPath(pathname)) throw new Error("caminho de upload inválido");
        return {
          allowedContentTypes: ["video/*", "audio/*"],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 2 * 60 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ detail: (err as Error).message }, { status: 400 });
  }
}
