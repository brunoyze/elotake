import type { CaptionStyle } from "@/lib/api";
import { cx } from "./ui";

const GRADES: Record<string, string> = {
  natural: "from-[#3b4a5a] via-[#58697a] to-[#2b3440]",
  vivo: "from-[#ff6a3d] via-[#ff2e7e] to-[#5b2bff]",
  filme: "from-[#2d3a3a] via-[#6b5a44] to-[#1d2526]",
  pb: "from-[#222] via-[#777] to-[#111]",
};

/** Miniatura vertical que mostra como o estilo vai ficar: cor, legenda e barras. */
export function StylePreview({
  cor,
  legenda,
  destaque = "#FFD400",
  barras = false,
  className,
}: {
  cor: string;
  legenda: CaptionStyle;
  destaque?: string;
  barras?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-gradient-to-br",
        GRADES[cor] ?? GRADES.natural,
        className,
      )}
    >
      <div className="absolute left-1/2 top-[30%] h-[28%] w-[42%] -translate-x-1/2 rounded-full bg-black/25 blur-[2px]" />
      <div className="absolute left-1/2 top-[52%] h-[40%] w-[70%] -translate-x-1/2 rounded-t-full bg-black/25" />
      {barras && (
        <>
          <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
        </>
      )}
      {legenda === "destaque" && (
        <p className="absolute inset-x-0 top-[68%] text-center text-[11px] font-black uppercase leading-tight tracking-tight [text-shadow:_0_1px_2px_#000]">
          isso <span style={{ color: destaque }}>muda</span> tudo
        </p>
      )}
      {legenda === "karaoke" && (
        <p
          className="absolute inset-x-0 top-[55%] text-center text-base font-black uppercase [text-shadow:_0_1px_3px_#000]"
          style={{ color: destaque }}
        >
          muda
        </p>
      )}
      {legenda === "limpa" && (
        <p className="absolute inset-x-[10%] top-[80%] rounded bg-black/60 px-1 py-0.5 text-center text-[8px] font-semibold">
          isso muda tudo no seu vídeo
        </p>
      )}
    </div>
  );
}
