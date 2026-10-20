// Cliente da API da Elotake (rotas em src/app/api).

import { upload } from "@vercel/blob/client";
import type {
  Brief,
  Catalog,
  Project,
  ReferenceInsight,
  StyleProfile,
  WorkerStatus,
} from "./types";
import { PROFILE_ID, TERMINAL } from "./types";

export * from "./types";

type Config = { storage: "blob" | "local"; ia: boolean };
type Progress = (fraction: number) => void;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

let configPromise: Promise<Config> | null = null;
const config = () => (configPromise ??= request<Config>("/api/config"));

function safeName(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .slice(-80);
  return clean || "arquivo";
}

/** Envia um arquivo e devolve o caminho dele no armazenamento. */
async function uploadFile(file: File, onProgress?: Progress): Promise<string> {
  const pathname = `uploads/${crypto.randomUUID()}/${safeName(file.name)}`;
  if ((await config()).storage === "blob") {
    const result = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/upload",
      contentType: file.type || undefined,
      multipart: file.size > 50 * 1024 * 1024,
      onUploadProgress: (e) => onProgress?.(e.percentage / 100),
    });
    return result.pathname;
  }
  const form = new FormData();
  form.append("file", file);
  form.append("pathname", pathname);
  const result = await request<{ pathname: string }>("/api/upload", { method: "POST", body: form });
  onProgress?.(1);
  return result.pathname;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  config,
  catalog: () => request<Catalog>("/api/catalogo"),
  // Perfis salvos ou presets; null quando a pessoa ainda não salvou o estilo dela.
  getProfile: (id = PROFILE_ID) => request<StyleProfile>(`/api/perfis/${id}`).catch(() => null),
  saveProfile: (profile: StyleProfile) => request<StyleProfile>(`/api/perfis/${profile.id}`, json("PUT", profile)),

  async analyzeReference(file: File, onProgress?: Progress): Promise<ReferenceInsight> {
    const video = await uploadFile(file, (p) => onProgress?.(p * 0.3));
    const { job } = await request<{ job: { kind: string; id: string } }>("/api/referencias", json("POST", { video }));
    const query = new URLSearchParams({ kind: job.kind, id: job.id, video });
    for (let i = 0; i < 200; i++) {
      await sleep(3000);
      const status = await request<WorkerStatus>(`/api/referencias?${query}`);
      onProgress?.(0.3 + 0.7 * (status.progresso ?? 0));
      if (status.status === "erro") throw new Error(status.erro ?? "não consegui analisar a referência");
      if (TERMINAL.includes(status.status) && status.resultado) return status.resultado;
    }
    throw new Error("a análise da referência demorou demais");
  },

  async createProject(
    video: File,
    profileId: string,
    brief: Brief,
    music?: File | null,
    onProgress?: Progress,
  ): Promise<Project> {
    const videoPath = await uploadFile(video, (p) => onProgress?.(p * (music ? 0.9 : 1)));
    const musicPath = music ? await uploadFile(music, (p) => onProgress?.(0.9 + p * 0.1)) : null;
    return request<Project>(
      "/api/projetos",
      json("POST", {
        nome: video.name.replace(/\.[^.]+$/, ""),
        profile_id: profileId,
        brief,
        video: videoPath,
        musica: musicPath,
      }),
    );
  },

  listProjects: () => request<Project[]>("/api/projetos"),
  getProject: (id: string) => request<Project>(`/api/projetos/${id}`),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projetos/${id}`, { method: "DELETE" }),
  redo: (id: string, body: { brief?: Brief; profile_id?: string }) =>
    request<Project>(`/api/projetos/${id}/refazer`, json("POST", body)),
  fileUrl: (p: Project, name: "final.mp4" | "thumb.jpg") => `/api/projetos/${p.id}/arquivos/${name}?v=${p.versao}`,
};
