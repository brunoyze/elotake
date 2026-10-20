// Banco de dados: estilos, projetos, versões e consumo, sempre por pessoa.
//
// - Com Supabase: Postgres (supabase/migrations). A API usa a chave secreta e filtra
//   por user_id em toda consulta; o RLS garante que, pelo navegador, cada pessoa só
//   leia o que é dela.
// - Sem Supabase (desenvolvimento local): JSON no armazenamento, como no MVP.
//
//   users/<user>/profiles/<slug>.json
//   users/<user>/projects/<id>.json

import { supabaseEnabled } from "@/lib/supabase/config";
import { adminClient } from "@/lib/supabase/server";
import type { Project, StyleProfile } from "@/lib/types";
import type { JobHandle } from "./runner";
import { storage } from "./storage";

export type StoredProject = Project & {
  user_id: string;
  source: string;
  music: string | null;
  job: JobHandle | null;
};

export interface Db {
  getProfile(userId: string, slug: string): Promise<StyleProfile | null>;
  saveProfile(userId: string, slug: string, profile: StyleProfile): Promise<void>;
  getProject(userId: string, id: string): Promise<StoredProject | null>;
  listProjects(userId: string): Promise<StoredProject[]>;
  saveProject(p: StoredProject): Promise<void>;
  deleteProject(p: StoredProject): Promise<void>;
  /** Registra o início de uma versão (a primeira edição ou um "refazer"). */
  startVersion(p: StoredProject): Promise<void>;
  /** Fecha a versão e, se ficou pronta, conta os minutos editados. */
  finishVersion(p: StoredProject): Promise<void>;
}

// ---- Supabase --------------------------------------------------------------

type ProjectRow = Omit<StoredProject, "criado_em"> & { criado_em: string };

const toRow = ({ criado_em, ...p }: StoredProject): ProjectRow => ({
  ...p,
  criado_em: new Date(criado_em * 1000).toISOString(),
});
const fromRow = ({ criado_em, ...row }: ProjectRow): StoredProject => ({
  ...row,
  criado_em: new Date(criado_em).getTime() / 1000,
});

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(`banco de dados: ${error.message}`);
  return data;
}

class SupabaseDb implements Db {
  private get sb() {
    return adminClient();
  }

  async getProfile(userId: string, slug: string) {
    const row = check(
      await this.sb.from("estilos").select("dados").eq("user_id", userId).eq("slug", slug).maybeSingle(),
    );
    return (row?.dados as StyleProfile | undefined) ?? null;
  }

  async saveProfile(userId: string, slug: string, profile: StyleProfile) {
    check(
      await this.sb
        .from("estilos")
        .upsert({ user_id: userId, slug, dados: profile, atualizado_em: new Date().toISOString() }),
    );
  }

  async getProject(userId: string, id: string) {
    const row = check(
      await this.sb.from("projetos").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
    );
    return row ? fromRow(row as ProjectRow) : null;
  }

  async listProjects(userId: string) {
    const rows = check(
      await this.sb.from("projetos").select("*").eq("user_id", userId).order("criado_em", { ascending: false }),
    );
    return (rows as ProjectRow[]).map(fromRow);
  }

  async saveProject(p: StoredProject) {
    check(await this.sb.from("projetos").upsert(toRow(p)));
  }

  async deleteProject(p: StoredProject) {
    check(await this.sb.from("projetos").delete().eq("user_id", p.user_id).eq("id", p.id));
  }

  async startVersion(p: StoredProject) {
    check(
      await this.sb.from("versoes").upsert({
        projeto_id: p.id,
        versao: p.versao,
        user_id: p.user_id,
        profile_id: p.profile_id,
        brief: p.brief,
        status: p.status,
        erro: null,
        plano: null,
        duracao_original: null,
        iniciado_em: new Date().toISOString(),
        terminado_em: null,
      }),
    );
  }

  async finishVersion(p: StoredProject) {
    check(
      await this.sb
        .from("versoes")
        .update({
          status: p.status,
          erro: p.erro,
          plano: p.plano,
          duracao_original: p.duracao_original,
          terminado_em: new Date().toISOString(),
        })
        .eq("projeto_id", p.id)
        .eq("versao", p.versao),
    );
    if (p.status === "pronto" && p.duracao_original) {
      check(
        await this.sb.from("consumo").upsert(
          {
            user_id: p.user_id,
            projeto_id: p.id,
            versao: p.versao,
            minutos: Math.round((p.duracao_original / 60) * 100) / 100,
          },
          { onConflict: "projeto_id,versao", ignoreDuplicates: true },
        ),
      );
    }
  }
}

// ---- local -----------------------------------------------------------------

class LocalDb implements Db {
  private profilePath = (userId: string, slug: string) => `users/${userId}/profiles/${slug}.json`;
  private projectPath = (userId: string, id: string) => `users/${userId}/projects/${id}.json`;

  getProfile(userId: string, slug: string) {
    return storage().readJSON<StyleProfile>(this.profilePath(userId, slug), true);
  }

  saveProfile(userId: string, slug: string, profile: StyleProfile) {
    return storage().writeJSON(this.profilePath(userId, slug), profile);
  }

  getProject(userId: string, id: string) {
    return storage().readJSON<StoredProject>(this.projectPath(userId, id), true);
  }

  async listProjects(userId: string) {
    const s = storage();
    const paths = (await s.list(`users/${userId}/projects/`)).filter((path) => path.endsWith(".json"));
    const projects = await Promise.all(paths.map((path) => s.readJSON<StoredProject>(path, true)));
    return projects.filter((p): p is StoredProject => p !== null).sort((a, b) => b.criado_em - a.criado_em);
  }

  saveProject(p: StoredProject) {
    return storage().writeJSON(this.projectPath(p.user_id, p.id), p);
  }

  deleteProject(p: StoredProject) {
    return storage().deletePrefix(this.projectPath(p.user_id, p.id));
  }

  async startVersion() {}

  async finishVersion() {}
}

let instance: Db | null = null;

export function db(): Db {
  instance ??= supabaseEnabled() ? new SupabaseDb() : new LocalDb();
  return instance;
}
