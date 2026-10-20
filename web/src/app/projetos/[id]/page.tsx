"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { BriefForm } from "@/components/BriefForm";
import { Button, ErrorNote, Spinner, cx } from "@/components/ui";
import {
  api,
  STATUS_LABELS,
  type Brief,
  type Catalog,
  type EditPlan,
  type Project,
  type ProjectStatus,
  type StyleProfile,
} from "@/lib/api";

const PIPELINE: ProjectStatus[] = ["preparando", "analisando", "dirigindo", "renderizando", "pronto"];
// Sub-etapas que aparecem como parte de uma etapa visível.
const STAGE_OF: Partial<Record<ProjectStatus, ProjectStatus>> = {
  na_fila: "preparando",
  baixando: "preparando",
  enviando: "renderizando",
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}min ${r}s` : `${r}s`;
}

/** Mostra o bruto inteiro e, por cima, os trechos que ficaram no corte final. */
function Timeline({ plan, total }: { plan: EditPlan; total: number }) {
  return (
    <div className="space-y-2">
      <div className="relative h-8 overflow-hidden rounded-md bg-panel-2">
        {plan.segments.map((s, i) => (
          <div
            key={i}
            title={`${s.start.toFixed(1)}s–${s.end.toFixed(1)}s${s.zoom > 1 ? " · zoom" : ""}`}
            className={cx("absolute inset-y-0 border-x border-ink/60", s.zoom > 1 ? "bg-rec" : "bg-fg/70")}
            style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>0s</span>
        <span className="flex gap-4">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-fg/70" /> mantido
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rec" /> mantido com zoom
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-panel-2 ring-1 ring-line" /> cortado
          </span>
        </span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}

function Copyable({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        <button
          type="button"
          className="text-xs text-muted hover:text-fg"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "copiado" : "copiar"}
        </button>
      </div>
      <p className="whitespace-pre-line text-sm">{text}</p>
    </div>
  );
}

export default function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState<Brief | null>(null);
  const [redoing, setRedoing] = useState(false);
  const router = useRouter();

  const working = project && project.status !== "pronto" && project.status !== "erro";

  useEffect(() => {
    api.getProject(id).then(setProject).catch((e) => setError((e as Error).message));
    api.catalog().then(setCatalog).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (project) api.getProfile(project.profile_id).then(setProfile).catch(() => {});
  }, [project?.profile_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      api.getProject(id).then(setProject).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [id, working]);

  async function remove() {
    if (!window.confirm("Excluir este projeto e os vídeos dele? Não dá para desfazer.")) return;
    try {
      await api.deleteProject(id);
      router.push("/projetos");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function redo() {
    if (!draft) return;
    setRedoing(true);
    try {
      setProject(await api.redo(id, { brief: draft }));
      setAdjusting(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedoing(false);
    }
  }

  if (!project) return error ? <ErrorNote message={error} /> : <p className="text-muted">Carregando…</p>;

  const plan = project.plano;
  const vertical = ["reels", "ads"].includes(project.brief.plataforma);
  const currentStage = PIPELINE.indexOf(STAGE_OF[project.status] ?? project.status);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">
          {project.nome} · versão {project.versao + 1}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {plan?.titulo || (project.status === "pronto" ? project.nome : STATUS_LABELS[project.status])}
        </h1>
      </div>

      {working && (
        <div className="max-w-xl space-y-5 rounded-2xl border border-line bg-panel p-6">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-rec transition-all duration-700" style={{ width: `${project.progresso * 100}%` }} />
          </div>
          <ol className="space-y-3">
            {PIPELINE.slice(0, 4).map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                {i < currentStage ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rec text-[10px]">✓</span>
                ) : i === currentStage ? (
                  <Spinner />
                ) : (
                  <span className="h-5 w-5 rounded-full border border-line" />
                )}
                <span className={i <= currentStage ? "text-fg" : "text-muted"}>{STATUS_LABELS[s]}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            Pode fechar esta página; o vídeo continua sendo editado. A primeira etapa leva cerca de 1 minuto.
          </p>
        </div>
      )}

      {project.status === "erro" && (
        <div className="max-w-xl space-y-4">
          <ErrorNote message={`A edição falhou: ${project.erro}`} />
          <div className="flex gap-3">
            <Button onClick={() => api.redo(id, {}).then(setProject).catch((e) => setError((e as Error).message))}>
              Tentar de novo
            </Button>
            <Button variant="ghost" onClick={remove}>
              Excluir projeto
            </Button>
          </div>
        </div>
      )}

      {project.status === "pronto" && plan && (
        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
          <div className={cx("mx-auto w-full", vertical ? "max-w-[340px]" : "max-w-[640px]")}>
            <video
              key={project.versao}
              src={api.fileUrl(project, "final.mp4")}
              poster={api.fileUrl(project, "thumb.jpg")}
              controls
              playsInline
              className="w-full rounded-2xl border border-line bg-black"
            />
            <a
              href={api.fileUrl(project, "final.mp4")}
              download
              className="mt-3 flex w-full items-center justify-center rounded-lg bg-rec px-4 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              Baixar vídeo
            </a>
          </div>

          <div className="min-w-0 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Bruto", fmt(project.duracao_original ?? 0)],
                ["Final", fmt(plan.segments.reduce((a, s) => a + s.end - s.start, 0))],
                ["Cortes", String(plan.segments.length)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line bg-panel p-4">
                  <p className="text-xs text-muted">{k}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {project.duracao_original && <Timeline plan={plan} total={project.duracao_original} />}
            <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                O que eu fiz · {plan.autor === "claude" ? "diretor com IA" : "diretor automático"}
              </p>
              {plan.resumo_edicao}
            </div>
            <Copyable label="Título" text={plan.titulo} />
            <Copyable label="Descrição" text={plan.descricao} />
            <Copyable label="Hashtags" text={plan.hashtags.join(" ")} />

            {!adjusting && (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(project.brief);
                    setAdjusting(true);
                  }}
                >
                  Ajustar e refazer
                </Button>
                <Button variant="ghost" onClick={remove} className="text-muted">
                  Excluir projeto
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {adjusting && draft && catalog && profile && (
        <div className="space-y-6 rounded-2xl border border-line bg-panel/50 p-6">
          <BriefForm catalog={catalog} brief={draft} onChange={setDraft} defaultEffects={profile.efeitos} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setAdjusting(false)}>
              Cancelar
            </Button>
            <Button onClick={redo} disabled={redoing}>
              {redoing && <Spinner />} Refazer edição
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
