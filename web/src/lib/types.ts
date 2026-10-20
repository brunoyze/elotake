// Tipos e rótulos compartilhados entre a interface e a API.

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
  perfis: Record<string, StyleProfile>;
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

export type ProjectStatus =
  | "na_fila"
  | "preparando"
  | "baixando"
  | "analisando"
  | "dirigindo"
  | "renderizando"
  | "enviando"
  | "pronto"
  | "erro";

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

/** O que o worker escreve em status.json enquanto roda. */
export type WorkerStatus = {
  status: ProjectStatus;
  progresso: number;
  erro?: string | null;
  plano?: EditPlan;
  duracao_original?: number;
  resultado?: ReferenceInsight;
};

export type ReferenceInsight = {
  duracao: number;
  cortes_por_minuto: number;
  ritmo_sugerido: Pace;
  formato: "vertical" | "horizontal";
};

export const PROFILE_ID = "meu-estilo";

export const TERMINAL: ProjectStatus[] = ["pronto", "erro"];

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
  preparando: "Ligando a máquina de edição",
  baixando: "Recebendo o vídeo",
  analisando: "Ouvindo e analisando o vídeo",
  dirigindo: "Decidindo a montagem",
  renderizando: "Renderizando",
  enviando: "Salvando o vídeo pronto",
  pronto: "Pronto",
  erro: "Erro",
};
