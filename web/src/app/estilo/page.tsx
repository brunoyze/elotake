"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StylePreview } from "@/components/StylePreview";
import { Button, Choice, ErrorNote, Pills, Section, Spinner, Toggle, cx } from "@/components/ui";
import {
  api,
  CAPTION_LABELS,
  COLOR_LABELS,
  EFFECT_LABELS,
  MUSIC_MOODS,
  PACE_LABELS,
  PROFILE_ID,
  type Catalog,
  type CaptionStyle,
  type Effects,
  type Pace,
  type ReferenceInsight,
  type StylePreset,
  type StyleProfile,
} from "@/lib/api";

const STEPS = ["Ponto de partida", "Ajuste fino", "Referências"];
const HIGHLIGHTS = ["#FFD400", "#FF4D2E", "#3DFF8B", "#3DD6FF", "#FFFFFF"];

function fromPreset(p: StylePreset, current?: StyleProfile | null): StyleProfile {
  return {
    id: PROFILE_ID,
    nome: current?.nome || "Meu estilo",
    preset: p.id,
    ritmo: p.ritmo,
    legenda: p.legenda,
    cor_destaque: current?.cor_destaque ?? "#FFD400",
    fonte: "Inter",
    cor: p.cor,
    clima_musica: current?.clima_musica ?? "energetico",
    referencias: current?.referencias ?? [],
    observacoes: current?.observacoes ?? "",
    efeitos: { ...p.efeitos },
  };
}

export default function EstiloPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refLink, setRefLink] = useState("");
  const [refInsight, setRefInsight] = useState<ReferenceInsight | null>(null);
  const [refLoading, setRefLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.catalog(), api.getProfile()])
      .then(([cat, saved]) => {
        setCatalog(cat);
        setProfile(saved ?? fromPreset(cat.estilos[0]));
      })
      .catch(() => setError("Não consegui falar com o motor de edição. Ele está rodando?"));
  }, []);

  if (!catalog || !profile) {
    return error ? <ErrorNote message={error} /> : <p className="text-muted">Carregando…</p>;
  }

  const set = <K extends keyof StyleProfile>(key: K, value: StyleProfile[K]) =>
    setProfile({ ...profile, [key]: value });
  const setFx = (key: keyof Effects, value: boolean) =>
    setProfile({ ...profile, efeitos: { ...profile.efeitos, [key]: value } });

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveProfile(profile);
      router.push("/novo");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function onReference(file: File) {
    if (!profile) return;
    setRefLoading(true);
    setError(null);
    try {
      const insight = await api.analyzeReference(file);
      setRefInsight(insight);
      setProfile({ ...profile, ritmo: insight.ritmo_sugerido, referencias: [...profile.referencias, file.name] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefLoading(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Seu DNA de edição</h1>
          <p className="mt-2 text-muted">Configure uma vez. Todo vídeo que você subir sai assim.</p>
        </div>

        <ol className="flex gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cx(
                  "rounded-full border px-3 py-1",
                  i === step ? "border-rec bg-rec-soft text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Section title="Escolha um ponto de partida" hint="Você ajusta tudo no próximo passo.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {catalog.estilos.map((p) => (
                <Choice
                  key={p.id}
                  active={profile.preset === p.id}
                  onClick={() => setProfile(fromPreset(p, profile))}
                  title={p.nome}
                  hint={p.descricao}
                >
                  <StylePreview cor={p.cor} legenda={p.legenda} barras={p.efeitos.barras_cinema} />
                </Choice>
              ))}
            </div>
          </Section>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <Section title="Ritmo" hint="Quanto de pausa a edição tolera e com que frequência muda o enquadramento.">
              <Pills<Pace>
                value={profile.ritmo}
                onChange={(v) => set("ritmo", v)}
                options={catalog.ritmos.map((r) => ({ value: r, label: PACE_LABELS[r] }))}
              />
            </Section>
            <Section title="Legenda">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {catalog.legendas.map((c) => (
                  <Choice
                    key={c}
                    active={profile.legenda === c}
                    onClick={() => set("legenda", c as CaptionStyle)}
                    title={CAPTION_LABELS[c].nome}
                    hint={CAPTION_LABELS[c].dica}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted">Cor do destaque</span>
                {HIGHLIGHTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`cor ${c}`}
                    onClick={() => set("cor_destaque", c)}
                    className={cx(
                      "h-7 w-7 rounded-full border-2",
                      profile.cor_destaque === c ? "border-fg" : "border-transparent",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Section>
            <Section title="Cor do vídeo">
              <Pills
                value={profile.cor}
                onChange={(v) => set("cor", v)}
                options={catalog.cores.map((c) => ({ value: c, label: COLOR_LABELS[c] ?? c }))}
              />
            </Section>
            <Section title="Clima da música">
              <Pills
                value={profile.clima_musica}
                onChange={(v) => set("clima_musica", v)}
                options={Object.entries(MUSIC_MOODS).map(([value, label]) => ({ value, label }))}
              />
            </Section>
            <Section title="Efeitos padrão" hint="Você ainda pode mudar em cada vídeo.">
              <div className="grid gap-2 md:grid-cols-2">
                {(Object.keys(EFFECT_LABELS) as (keyof Effects)[]).map((k) => (
                  <Toggle
                    key={k}
                    checked={profile.efeitos[k]}
                    onChange={(v) => setFx(k, v)}
                    label={EFFECT_LABELS[k].nome}
                    hint={EFFECT_LABELS[k].dica}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <Section
              title="Vídeos que você ama"
              hint="Suba um vídeo de referência e a Elotake mede o ritmo de corte dele para copiar no seu."
            >
              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-panel p-6 text-sm text-muted hover:border-muted">
                {refLoading ? <Spinner /> : "Escolher vídeo de referência"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && onReference(e.target.files[0])}
                />
              </label>
              {refInsight && (
                <p className="rounded-lg border border-line bg-panel-2 p-3 text-sm">
                  {refInsight.cortes_por_minuto} cortes por minuto, formato {refInsight.formato}. Ajustei seu
                  ritmo para <strong>{PACE_LABELS[refInsight.ritmo_sugerido].toLowerCase()}</strong>.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={refLink}
                  onChange={(e) => setRefLink(e.target.value)}
                  placeholder="ou cole um link (YouTube, Instagram, TikTok)"
                  className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-rec"
                />
                <Button
                  variant="ghost"
                  disabled={!refLink.trim()}
                  onClick={() => {
                    set("referencias", [...profile.referencias, refLink.trim()]);
                    setRefLink("");
                  }}
                >
                  Adicionar
                </Button>
              </div>
              {profile.referencias.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {profile.referencias.map((r, i) => (
                    <li key={`${r}-${i}`} className="flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-xs">
                      <span className="max-w-[240px] truncate">{r}</span>
                      <button
                        type="button"
                        aria-label="remover"
                        className="text-muted hover:text-fg"
                        onClick={() => set("referencias", profile.referencias.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Instruções para o editor" hint="Fale como falaria com um editor humano.">
              <textarea
                value={profile.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                rows={4}
                placeholder="Ex.: meu público é iniciante, nunca corte as piadas, prefiro finais com chamada para o link da bio."
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-rec"
              />
            </Section>
          </div>
        )}

        <ErrorNote message={error} />
        <div className="flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Continuar</Button>
          ) : (
            <Button onClick={save} disabled={saving}>
              {saving && <Spinner />} Salvar meu estilo
            </Button>
          )}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">Prévia</p>
          <StylePreview
            cor={profile.cor}
            legenda={profile.legenda}
            destaque={profile.cor_destaque}
            barras={profile.efeitos.barras_cinema}
            className="rounded-2xl border border-line"
          />
          <p className="text-sm text-muted">
            {PACE_LABELS[profile.ritmo]} · {CAPTION_LABELS[profile.legenda].nome} · {COLOR_LABELS[profile.cor]}
          </p>
        </div>
      </aside>
    </div>
  );
}
