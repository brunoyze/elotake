// Onde o motor roda.
//
// - Na Vercel: cada trabalho ganha uma Vercel Sandbox (máquina temporária). A API
//   copia o código do motor para lá, roda o worker em segundo plano e lê o
//   progresso do arquivo status.json dentro da máquina.
// - Em desenvolvimento: um processo Python local (engine/.venv).

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Sandbox } from "@vercel/sandbox";
import engineBundle from "@/generated/engine.json";
import type { WorkerStatus } from "@/lib/types";

export type JobHandle = { kind: "sandbox" | "local"; id: string; iniciado_em: number };

export type WorkerJob = {
  tipo: "editar" | "referencia";
  profile?: unknown;
  brief?: unknown;
  use_ai?: boolean;
  entradas: Record<string, string | null>;
  saidas?: Record<string, string>;
};

const SANDBOX_DIR = "/vercel/elotake";
const SANDBOX_JOB = "/vercel/job";
// O plano Hobby limita cada sessão de Sandbox a 45 minutos.
export const JOB_TIMEOUT_MS = 44 * 60 * 1000;

function workerEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ELOTAKE_LANG: process.env.ELOTAKE_LANG ?? "pt",
    ELOTAKE_WHISPER_MODEL: process.env.ELOTAKE_WHISPER_MODEL ?? "small",
  };
  if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  return env;
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ELOTAKE_USE_AI !== "0";
}

const runsInSandbox = () => Boolean(process.env.VERCEL) || process.env.ELOTAKE_RUNNER === "sandbox";

async function startSandbox(job: WorkerJob): Promise<JobHandle> {
  const snapshotId = process.env.ELOTAKE_SNAPSHOT_ID;
  const sandbox = await Sandbox.create({
    ...(snapshotId
      ? { source: { type: "snapshot" as const, snapshotId } }
      : { image: "vercel/sandbox/ubuntu" }),
    resources: { vcpus: Number(process.env.ELOTAKE_VCPUS ?? 4) },
    timeout: JOB_TIMEOUT_MS,
    persistent: false,
  });
  for (const dir of [SANDBOX_DIR, `${SANDBOX_DIR}/elotake_engine`, SANDBOX_JOB]) {
    await sandbox.mkDir(dir).catch(() => undefined);
  }
  await sandbox.writeFiles([
    ...engineBundle.files.map((f) => ({ path: `${SANDBOX_DIR}/${f.path}`, content: Buffer.from(f.content) })),
    {
      path: `${SANDBOX_JOB}/job.json`,
      content: Buffer.from(JSON.stringify({ ...job, status_local: `${SANDBOX_JOB}/status.json` })),
    },
  ]);
  await sandbox.runCommand({
    cmd: "bash",
    args: [`${SANDBOX_DIR}/run.sh`, `${SANDBOX_JOB}/job.json`],
    env: workerEnv(),
    detached: true,
  });
  return { kind: "sandbox", id: sandbox.name, iniciado_em: Date.now() };
}

// ---- modo local ------------------------------------------------------------

const engineDir = () => resolve(process.env.ELOTAKE_ENGINE_DIR ?? join(process.cwd(), "..", "engine"));
const localJobDir = (id: string) =>
  join(resolve(process.env.ELOTAKE_DATA ?? join(process.cwd(), ".data")), "jobs", id.replace(/[^\w-]/g, ""));

async function startLocal(job: WorkerJob, key: string): Promise<JobHandle> {
  const dir = localJobDir(key);
  await mkdir(dir, { recursive: true });
  const jobFile = join(dir, "job.json");
  await writeFile(jobFile, JSON.stringify({ ...job, status_local: join(dir, "status.json") }));
  const python = process.env.ELOTAKE_PYTHON ?? join(engineDir(), ".venv", "bin", "python");
  const { openSync } = await import("node:fs");
  const log = openSync(join(dir, "worker.log"), "a");
  const child = spawn(python, ["-m", "elotake_engine.worker", jobFile], {
    cwd: engineDir(),
    env: { ...process.env, ...workerEnv() },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return { kind: "local", id: key, iniciado_em: Date.now() };
}

// ---- interface pública -----------------------------------------------------

export async function startJob(job: WorkerJob, key: string): Promise<JobHandle> {
  return runsInSandbox() ? startSandbox(job) : startLocal(job, key);
}

/** Lê o progresso do trabalho. null quando a máquina já não existe. */
export async function readJobStatus(handle: JobHandle): Promise<WorkerStatus | null> {
  try {
    if (handle.kind === "local") {
      return JSON.parse(await readFile(join(localJobDir(handle.id), "status.json"), "utf8"));
    }
    const sandbox = await Sandbox.get({ name: handle.id });
    if (sandbox.status !== "running") return null;
    const buf = await sandbox.readFileToBuffer({ path: `${SANDBOX_JOB}/status.json` });
    return buf ? JSON.parse(buf.toString("utf8")) : null;
  } catch {
    return null;
  }
}

export async function stopJob(handle: JobHandle) {
  if (handle.kind !== "sandbox") return;
  try {
    const sandbox = await Sandbox.get({ name: handle.id });
    await sandbox.stop();
  } catch {
    // já parou ou expirou
  }
}
