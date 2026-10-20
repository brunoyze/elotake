"use client";

import { Choice, Pills, Section, Toggle } from "@/components/ui";
import { EFFECT_LABELS, type Brief, type Catalog, type Effects, type PlatformId } from "@/lib/api";

const PLATFORM_HINTS: Record<PlatformId, string> = {
  reels: "Vertical, curto, gancho no 1º segundo",
  ads: "Gancho → problema → solução → chamada",
  youtube: "Horizontal, raciocínio completo",
  feed: "4:5, direto ao ponto",
  podcast: "Natural, só limpa pausas e tropeços",
};

const ORDER: PlatformId[] = ["reels", "ads", "youtube", "feed", "podcast"];

function Frame({ w, h }: { w: number; h: number }) {
  const scale = 36 / Math.max(w, h);
  return (
    <span className="flex h-10 items-center">
      <span
        className="block rounded-[3px] border-2 border-current opacity-70"
        style={{ width: w * scale, height: h * scale }}
      />
    </span>
  );
}

/** Formulário do pedido: destino, objetivo e efeitos deste vídeo. */
export function BriefForm({
  catalog,
  brief,
  onChange,
  defaultEffects,
}: {
  catalog: Catalog;
  brief: Brief;
  onChange: (b: Brief) => void;
  defaultEffects: Effects;
}) {
  const effects = brief.efeitos ?? defaultEffects;
  const platforms = ORDER.map((id) => catalog.plataformas.find((p) => p.id === id)!).filter(Boolean);

  return (
    <div className="space-y-8">
      <Section title="Para onde vai este vídeo?">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {platforms.map((p) => (
            <Choice
              key={p.id}
              active={brief.plataforma === p.id}
              onClick={() => onChange({ ...brief, plataforma: p.id })}
              title={p.nome}
              hint={PLATFORM_HINTS[p.id]}
            >
              <Frame w={p.largura} h={p.altura} />
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="Qual é o objetivo?" hint="Uma frase basta. É isso que guia o que fica e o que sai.">
        <textarea
          value={brief.objetivo}
          onChange={(e) => onChange({ ...brief, objetivo: e.target.value })}
          rows={3}
          placeholder="Ex.: anúncio do meu curso de confeitaria para iniciantes, chamar para o link da bio."
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-rec"
        />
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2 text-muted">
            Duração máxima
            <input
              type="number"
              min={5}
              placeholder="auto"
              value={brief.duracao_max ?? ""}
              onChange={(e) =>
                onChange({ ...brief, duracao_max: e.target.value ? Number(e.target.value) : null })
              }
              className="w-20 rounded-lg border border-line bg-panel px-2 py-1 text-fg outline-none focus:border-rec"
            />
            s
          </label>
          <span className="flex items-center gap-2 text-muted">
            Se o formato mudar
            <Pills
              value={brief.reenquadrar}
              onChange={(v) => onChange({ ...brief, reenquadrar: v })}
              options={[
                { value: "crop", label: "Cortar para preencher" },
                { value: "blur", label: "Encaixar com fundo desfocado" },
              ]}
            />
          </span>
        </div>
      </Section>

      <Section title="Efeitos deste vídeo" hint="Vêm do seu estilo; mude só se quiser algo diferente aqui.">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(EFFECT_LABELS) as (keyof Effects)[]).map((k) => (
            <Toggle
              key={k}
              checked={effects[k]}
              onChange={(v) => onChange({ ...brief, efeitos: { ...effects, [k]: v } })}
              label={EFFECT_LABELS[k].nome}
              hint={EFFECT_LABELS[k].dica}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
