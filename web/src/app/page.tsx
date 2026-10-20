import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Defina seu estilo uma vez",
    text: "Escolha um ponto de partida, ajuste ritmo, legenda, cor e efeitos, e mostre vídeos que você ama. Esse é o seu DNA de edição.",
  },
  {
    n: "02",
    title: "Suba o vídeo bruto",
    text: "Diga para onde ele vai: YouTube, Reels, anúncio... e qual é o objetivo. Só isso.",
  },
  {
    n: "03",
    title: "Receba pronto",
    text: "A Elotake ouve, corta pausas e tropeços, escolhe o gancho, dá zoom, legenda, trata o áudio e entrega no formato certo.",
  },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="grid items-center gap-10 pt-6 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-rec" /> editor de vídeo com IA
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Você grava.
            <br />
            <span className="text-rec">A Elotake edita.</span>
          </h1>
          <p className="max-w-lg text-lg text-muted">
            Resultado de editor profissional, no seu estilo, sem abrir uma linha do tempo. Para quem
            cria conteúdo, vende com vídeo ou simplesmente não tem tempo de editar.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/estilo" className="rounded-lg bg-rec px-5 py-3 font-medium text-white hover:brightness-110">
              Configurar meu estilo
            </Link>
            <Link href="/novo" className="rounded-lg border border-line bg-panel px-5 py-3 font-medium hover:bg-panel-2">
              Editar um vídeo agora
            </Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[280px]">
          <div className="absolute -inset-8 rounded-[48px] bg-rec/20 blur-3xl" />
          <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-[#ff6a3d] via-[#ff2e7e] to-[#5b2bff] shadow-2xl">
            <div className="absolute left-1/2 top-[26%] h-[26%] w-[44%] -translate-x-1/2 rounded-full bg-black/25" />
            <div className="absolute left-1/2 top-[48%] h-[45%] w-[74%] -translate-x-1/2 rounded-t-full bg-black/25" />
            <p className="absolute inset-x-0 top-[66%] text-center text-2xl font-black uppercase tracking-tight [text-shadow:_0_2px_4px_#000]">
              isso <span className="text-gold">muda</span> tudo
            </p>
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 text-xs backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-rec" /> 42s · Reels · pronto
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-line bg-panel p-6">
            <p className="font-mono text-sm text-rec">{s.n}</p>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
