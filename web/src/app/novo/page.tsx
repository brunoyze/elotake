"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BriefForm } from "@/components/BriefForm";
import { Button, ErrorNote, Section, Spinner, cx } from "@/components/ui";
import { api, PROFILE_ID, type Brief, type Catalog, type StyleProfile } from "@/lib/api";

function formatSize(bytes: number) {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export default function NovoPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [brief, setBrief] = useState<Brief>({
    plataforma: "reels",
    objetivo: "",
    duracao_max: null,
    reenquadrar: "crop",
    efeitos: null,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.catalog(), api.getProfile()])
      .then(([cat, saved]) => {
        setCatalog(cat);
        if (saved) {
          setProfile(saved);
        } else {
          // Sem estilo salvo: usa o primeiro preset até a pessoa configurar o dela.
          const p = cat.estilos[0];
          setProfile({
            id: p.id, nome: p.nome, preset: p.id, ritmo: p.ritmo, legenda: p.legenda,
            cor_destaque: "#FFD400", fonte: "Inter", cor: p.cor, clima_musica: "energetico",
            referencias: [], observacoes: "", efeitos: p.efeitos,
          });
        }
      })
      .catch(() => setError("Não consegui falar com o motor de edição. Ele está rodando?"));
  }, []);

  async function submit() {
    if (!video || !profile) return;
    setSending(true);
    setError(null);
    try {
      const project = await api.createProject(video, profile.id, brief, music);
      router.push(`/projetos/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  }

  if (!catalog || !profile) {
    return error ? <ErrorNote message={error} /> : <p className="text-muted">Carregando…</p>;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Novo vídeo</h1>
          <p className="mt-2 text-muted">
            Estilo:{" "}
            <Link href="/estilo" className="text-fg underline decoration-rec underline-offset-4">
              {profile.id === PROFILE_ID ? profile.nome : `${profile.nome} (padrão)`}
            </Link>
          </p>
        </div>
      </div>

      <Section title="Vídeo bruto">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f?.type.startsWith("video/")) setVideo(f);
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition",
            dragging ? "border-rec bg-rec-soft" : "border-line bg-panel hover:border-muted",
          )}
        >
          {video ? (
            <>
              <span className="font-medium">{video.name}</span>
              <span className="text-sm text-muted">{formatSize(video.size)} · clique para trocar</span>
            </>
          ) : (
            <>
              <span className="text-lg font-medium">Arraste o vídeo aqui</span>
              <span className="text-sm text-muted">ou clique para escolher · MP4, MOV, até alguns GB</span>
            </>
          )}
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && setVideo(e.target.files[0])}
          />
        </label>
      </Section>

      <BriefForm catalog={catalog} brief={brief} onChange={setBrief} defaultEffects={profile.efeitos} />

      <Section title="Música (opcional)" hint="Suba uma faixa que você tem direito de usar. Ela abaixa sozinha quando você fala.">
        <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2 text-sm hover:bg-panel-2">
          {music ? music.name : "Escolher faixa"}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => setMusic(e.target.files?.[0] ?? null)}
          />
        </label>
      </Section>

      <ErrorNote message={error} />
      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={submit} disabled={!video || sending} className="px-6 py-3 text-base shadow-xl">
          {sending ? <Spinner /> : null}
          {sending ? "Enviando…" : "Editar meu vídeo"}
        </Button>
      </div>
    </div>
  );
}
