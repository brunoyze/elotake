// Cliente do motor Elotake (engine/). O navegador fala direto com a API do motor,
// para que uploads grandes não passem pelo servidor do Next.

export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000";

export type Pace = "calmo" | "equilibrado" | "rapido";
export type CaptionStyle = "nenhuma" | "destaque" | "limpa" | "karaoke";
export type PlatformId = "youtube" | "reels" | "ads" | "feed" | "podcast";
export type ReframeMode = "crop" | "blur";

export type Effects = {
  cortar_silencios: boolean;
  remover_vicios: boolean;
  zoom_dinamico: boolean;
  legendas: boolean;
  flash_transicao: boolean;
  granulado: boolean;
  barras_cinema: boolean;
  vinheta: boolean;
  musica: boolean;
  melhorar_audio: boolean;
  gancho_inicial: boolean;
};

export type StyleProfile = {
  id: string;
  nome: string;
  preset: string;
  ritmo: Pace;
  legenda: CaptionStyle;
  cor_destaque: string;
  fonte: string;
  cor: string;
  clima_musica: string;
  referencias: string[];
  observacoes: string;
  efeitos: Effects;
};

export type Brief = {
  plataforma: PlatformId;
  objetivo: string;
  duracao_max: number | null;
  reenquadrar: ReframeMode;
  efeitos: Effects | null;
};

export type StylePreset = {
  id: string;
  nome: string;
  descricao: string;
  ritmo: Pace;
  legenda: CaptionStyle;
  cor: string;
  efeitos: Effects;
};

export type PlatformInfo = {
  id: PlatformId;
  nome: string;
  largura: number;
  altura: number;
  duracao_max: number | null;
};

export type Catalog = {
  estilos: StylePreset[];
  plataformas: PlatformInfo[];
  cores: string[];
  legendas: CaptionStyle[];
  ritmos: Pace[];
};

export type Segment = { start: number; end: number; zoom: number; motivo: string };

export type EditPlan = {
  segments: Segment[];
  overlays: { text: string; start: number; end: number }[];
  destaques: string[];
  titulo: string;
  descricao: string;
  hashtags: string[];
  resumo_edicao: string;
  autor: "heuristico" | "claude";
};

export type ProjectStatus = "na_fila" | "analisando" | "dirigindo" | "renderizando" | "pronto" | "erro";

export type Project = {
  id: string;
  nome: string;
  criado_em: number;
  profile_id: string;
  brief: Brief;
  status: ProjectStatus;
  progresso: number;
  erro: string | null;
  plano: EditPlan | null;
  duracao_original: number | null;
  versao: number;
};

export type ReferenceInsight = {
  duracao: number;
  cortes_por_minuto: number;
  ritmo_sugerido: Pace;
  formato: "vertical" | "horizontal";
};

export const PROFILE_ID = "meu-estilo";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; ia: boolean }>("/api/health"),
  catalog: () => request<Catalog>("/api/catalogo"),
  // Perfis salvos ou presets; null quando a pessoa ainda não salvou o estilo dela.
  getProfile: (id = PROFILE_ID) => request<StyleProfile>(`/api/perfis/${id}`).catch(() => null),
  saveProfile: (profile: StyleProfile) =>
    request<StyleProfile>(`/api/perfis/${profile.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }),
  analyzeReference: (file: File) => {
    const form = new FormData();
    form.append("video", file);
    return request<ReferenceInsight>("/api/referencias/analisar", { method: "POST", body: form });
  },
  createProject: (video: File, profileId: string, brief: Brief, music?: File | null) => {
    const form = new FormData();
    form.append("video", video);
    form.append("profile_id", profileId);
    form.append("brief", JSON.stringify(brief));
    if (music) form.append("musica", music);
    return request<Project>("/api/projetos", { method: "POST", body: form });
  },
  listProjects: () => request<Project[]>("/api/projetos"),
  getProject: (id: string) => request<Project>(`/api/projetos/${id}`),
  redo: (id: string, body: { brief?: Brief; profile_id?: string }) =>
    request<Project>(`/api/projetos/${id}/refazer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  fileUrl: (p: Project, name: "final.mp4" | "thumb.jpg") =>
    `${ENGINE_URL}/api/projetos/${p.id}/arquivos/${name}?v=${p.versao}`,
};

export const EFFECT_LABELS: Record<keyof Effects, { nome: string; dica: string }> = {
  cortar_silencios: { nome: "Cortar silêncios", dica: "Tira pausas e respiros longos" },
  remover_vicios: { nome: "Remover vícios", dica: "\"ahn\", \"né\", \"tipo\" soltos" },
  gancho_inicial: { nome: "Gancho inicial", dica: "Abre com a frase mais forte" },
  zoom_dinamico: { nome: "Zoom de ênfase", dica: "Punch-in nas frases de impacto" },
  legendas: { nome: "Legendas animadas", dica: "Geradas da sua fala" },
  melhorar_audio: { nome: "Melhorar áudio", dica: "Limpa ruído e equaliza a voz" },
  musica: { nome: "Música de fundo", dica: "Abaixa sozinha quando você fala" },
  flash_transicao: { nome: "Flash nos cortes", dica: "Clarão rápido entre cenas" },
  granulado: { nome: "Granulado de filme", dica: "Textura analógica" },
  barras_cinema: { nome: "Barras de cinema", dica: "Faixas pretas em cima e embaixo" },
  vinheta: { nome: "Vinheta", dica: "Escurece as bordas" },
};

export const PACE_LABELS: Record<Pace, string> = {
  calmo: "Calmo",
  equilibrado: "Equilibrado",
  rapido: "Rápido",
};

export const CAPTION_LABELS: Record<CaptionStyle, { nome: string; dica: string }> = {
  destaque: { nome: "Destaque", dica: "Caixa alta, palavra ativa colorida" },
  karaoke: { nome: "Karaokê", dica: "Uma palavra por vez, grande" },
  limpa: { nome: "Limpa", dica: "Frase inteira, discreta" },
  nenhuma: { nome: "Sem legenda", dica: "" },
};

export const COLOR_LABELS: Record<string, string> = {
  natural: "Natural",
  vivo: "Vivo",
  filme: "Filme",
  pb: "Preto e branco",
};

export const MUSIC_MOODS: Record<string, string> = {
  energetico: "Energético",
  emocional: "Emocional",
  corporativo: "Corporativo",
  calmo: "Calmo",
  sem_musica: "Sem música",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  na_fila: "Na fila",
  analisando: "Ouvindo e analisando o vídeo",
  dirigindo: "Decidindo a montagem",
  renderizando: "Renderizando",
  pronto: "Pronto",
  erro: "Erro",
};
