// Upload do vídeo bruto e da música.
// Na Vercel, o navegador manda o arquivo direto para o Blob com uma URL assinada que
// esta rota emite (o arquivo não passa pela função). Em desenvolvimento, recebe o arquivo aqui.
import { issueSignedToken } from "@vercel/blob";
import { type HandleUploadPresignedBody, handleUploadPresigned } from "@vercel/blob/client";
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

  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!isUploadPath(pathname)) throw new Error("caminho de upload inválido");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil: Date.now() + 2 * 60 * 60 * 1000,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ["video/*", "audio/*"],
            maximumSizeInBytes: MAX_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ detail: (err as Error).message }, { status: 400 });
  }
}
