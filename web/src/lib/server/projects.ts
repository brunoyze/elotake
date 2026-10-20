// Projetos: o estado fica no banco (db.ts), os arquivos no armazenamento.
//
//   projects/<id>/v<n>/final.mp4 ...        saídas de cada versão (escritas pelo worker)
//   uploads/<user>/<uuid>/<arquivo>         vídeo bruto e música enviados pelo navegador

import catalog from "@/lib/catalog.json";
import type { Brief, Catalog, Project, StyleProfile, WorkerStatus } from "@/lib/types";
import { TERMINAL } from "@/lib/types";
import { db, type StoredProject } from "./db";
import { aiEnabled, JOB_TIMEOUT_MS, readJobStatus, startJob, stopJob } from "./runner";
import { storage } from "./storage";

export type { StoredProject };

const OUTPUTS = ["final.mp4", "thumb.jpg", "plan.json", "analysis.json", "status.json"] as const;
const PROFILE_ID_RE = /^[a-z0-9_-]{1,40}$/;
const ID_RE = /^[a-f0-9]{12}$/;

export const versionPath = (id: string, v: number, name: string) => `projects/${id}/v${v}/${name}`;

/** Caminho de um upload desta pessoa (cada um só usa os próprios arquivos). */
export function isUploadPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string") return false;
  const match = /^uploads\/([\w-]+)\/[\w-]+\/[^/]+$/.exec(path);
  return match?.[1] === userId;
}

export function publicProject(p: StoredProject): Project {
  const { source: _s, music: _m, job: _j, user_id: _u, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

// ---- perfis de estilo ------------------------------------------------------

export async function loadProfile(userId: string, id: string): Promise<StyleProfile | null> {
  if (!PROFILE_ID_RE.test(id)) return null;
  const saved = await db().getProfile(userId, id);
  return saved ?? (catalog as unknown as Catalog).perfis[id] ?? null;
}

export async function saveProfile(userId: string, id: string, profile: StyleProfile): Promise<StyleProfile> {
  if (!PROFILE_ID_RE.test(id)) throw new Error("id de perfil inválido");
  const base = (catalog as unknown as Catalog).perfis[profile.preset] ?? (catalog as unknown as Catalog).perfis.dinamico;
  const merged: StyleProfile = { ...base, ...profile, efeitos: { ...base.efeitos, ...profile.efeitos }, id };
  await db().saveProfile(userId, id, merged);
  return merged;
}

// ---- projetos --------------------------------------------------------------

export async function getProject(userId: string, id: string): Promise<StoredProject | null> {
  if (!ID_RE.test(id)) return null;
  return db().getProject(userId, id);
}

async function launch(p: StoredProject): Promise<StoredProject> {
  const profile = await loadProfile(p.user_id, p.profile_id);
  if (!profile) throw new Error("perfil de estilo não encontrado");
  const s = storage();
  const v = p.versao;
  const saidas: Record<string, string> = {};
  for (const name of OUTPUTS) saidas[name] = await s.uploadTarget(versionPath(p.id, v, name));
  const job = {
    tipo: "editar" as const,
    profile,
    brief: p.brief,
    use_ai: aiEnabled(),
    entradas: {
      video: await s.downloadTarget(p.source),
      musica: p.music ? await s.downloadTarget(p.music) : null,
      analise: v > 0 ? await s.downloadTarget(versionPath(p.id, v - 1, "analysis.json")) : null,
    },
    saidas,
  };
  try {
    p.job = await startJob(job, `${p.id}-v${v}`);
    p.status = "preparando";
  } catch (err) {
    p.status = "erro";
    p.erro = `Não consegui ligar a máquina de edição: ${(err as Error).message}`;
  }
  await db().saveProject(p);
  await db().startVersion(p);
  if (p.status === "erro") await db().finishVersion(p);
  return p;
}

export async function createProject(userId: string, input: {
  nome: string;
  profile_id: string;
  brief: Brief;
  source: string;
  music: string | null;
}): Promise<StoredProject> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const project: StoredProject = {
    id,
    user_id: userId,
    nome: input.nome.slice(0, 80) || "vídeo",
    criado_em: Date.now() / 1000,
    profile_id: input.profile_id,
    brief: input.brief,
    status: "na_fila",
    progresso: 0,
    erro: null,
    plano: null,
    duracao_original: null,
    versao: 0,
    source: input.source,
    music: input.music,
    job: null,
  };
  return launch(project);
}

export async function redoProject(p: StoredProject, changes: { brief?: Brief; profile_id?: string }) {
  if (!TERMINAL.includes(p.status)) throw new Error("o projeto ainda está sendo editado");
  if (changes.profile_id) p.profile_id = changes.profile_id;
  if (changes.brief) p.brief = changes.brief;
  // Só cria uma nova versão se a anterior terminou bem; senão refaz a mesma.
  if (p.status === "pronto") p.versao += 1;
  Object.assign(p, { status: "na_fila", progresso: 0, erro: null, plano: null, job: null });
  return launch(p);
}

/** Atualiza o projeto com o progresso do worker; finaliza quando o worker termina. */
export async function refreshProject(p: StoredProject): Promise<StoredProject> {
  if (TERMINAL.includes(p.status) || !p.job) return p;
  let status: WorkerStatus | null = await readJobStatus(p.job);
  if (!status) {
    // A máquina já parou: o worker deixa o status final no armazenamento.
    status = await storage().readJSON<WorkerStatus>(versionPath(p.id, p.versao, "status.json"), true);
  }
  if (status) {
    p.status = status.status;
    p.progresso = status.progresso ?? p.progresso;
    if (status.status === "erro") p.erro = status.erro ?? "erro desconhecido";
    if (status.plano) p.plano = status.plano;
    if (status.duracao_original) p.duracao_original = status.duracao_original;
  } else if (Date.now() - p.job.iniciado_em > JOB_TIMEOUT_MS + 60_000) {
    p.status = "erro";
    p.erro = "A edição passou do tempo limite. Tente um vídeo mais curto.";
  }
  if (TERMINAL.includes(p.status)) {
    await stopJob(p.job);
    await db().saveProject(p);
    await db().finishVersion(p);
  }
  return p;
}

export function listProjects(userId: string): Promise<StoredProject[]> {
  return db().listProjects(userId);
}

export async function deleteProject(p: StoredProject) {
  if (p.job && !TERMINAL.includes(p.status)) await stopJob(p.job);
  const s = storage();
  await s.deletePrefix(`projects/${p.id}/`);
  await db().deleteProject(p);
  for (const upload of [p.source, p.music]) {
    if (upload) await s.deletePrefix(upload.slice(0, upload.lastIndexOf("/") + 1));
  }
}
