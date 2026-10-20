"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorNote } from "@/components/ui";
import { api, STATUS_LABELS, type Project } from "@/lib/api";

export default function ProjetosPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .listProjects()
        .then((p) => alive && setProjects(p))
        .catch(() => alive && setError("Não consegui falar com o motor de edição. Ele está rodando?"));
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Projetos</h1>
      <ErrorNote message={error} />
      {projects?.length === 0 && (
        <p className="text-muted">
          Nenhum vídeo ainda.{" "}
          <Link href="/novo" className="text-fg underline decoration-rec underline-offset-4">
            Edite o primeiro
          </Link>
          .
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {projects?.map((p) => (
          <Link
            key={p.id}
            href={`/projetos/${p.id}`}
            className="group overflow-hidden rounded-xl border border-line bg-panel hover:border-muted/60"
          >
            <div className="relative aspect-video bg-panel-2">
              {p.status === "pronto" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.fileUrl(p, "thumb.jpg")} alt="" className="h-full w-full object-cover" />
              )}
              {p.status !== "pronto" && p.status !== "erro" && (
                <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-rec transition-all" style={{ width: `${p.progresso * 100}%` }} />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium">{p.plano?.titulo || p.nome}</p>
              <p className="text-xs text-muted">
                {STATUS_LABELS[p.status]} · {p.brief.plataforma}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
