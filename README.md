# Elotake

**Você grava. A Elotake edita.** Editor de vídeo automático: a pessoa define o estilo dela
uma vez, sobe o vídeo bruto, diz para onde ele vai (Reels, anúncio, YouTube...) e recebe o
vídeo pronto, com cortes, zoom, legenda animada, cor, música e áudio tratado.

O plano completo do produto (público, funcionalidades, arquitetura, preços, roteiro) está em
[`docs/PLANO_DE_PRODUTO.md`](docs/PLANO_DE_PRODUTO.md).

## Estrutura

```
engine/   motor de edição (Python + FFmpeg + Whisper + Claude)
  sandbox/  scripts que preparam e rodam o motor numa Vercel Sandbox
web/      interface e API (Next.js), publicada na Vercel
supabase/ banco de dados (migrações SQL)
docs/     plano de produto
```

## Como funciona na Vercel

```
navegador ──upload direto (URL assinada)──▶ Vercel Blob (privado)
    │                                            ▲
    ▼                                            │ vídeo pronto (URL assinada)
API Next.js ──cria máquina + copia o motor──▶ Vercel Sandbox (FFmpeg, Whisper, Claude)
    ▲                                            │
    └──────── lê o progresso (status.json) ◀─────┘
```

1. O navegador envia o vídeo direto para o Blob privado; o arquivo não passa pela função.
2. A API cria uma Vercel Sandbox, copia o código de `engine/` (empacotado no build por
   `web/scripts/bundle-engine.mjs`) e roda `engine/sandbox/run.sh` em segundo plano.
3. A Sandbox instala FFmpeg e o Whisper (~45 s), baixa o vídeo, edita e envia o resultado
   para o Blob com URLs assinadas. Nenhum token de acesso entra na máquina.
4. A página do projeto consulta o progresso; quando termina, a API desliga a máquina.

### Configuração do projeto na Vercel

- **Root Directory:** `web`
- **Blob:** um store **privado** ligado ao projeto (cria a variável `BLOB_READ_WRITE_TOKEN`).
- **Variáveis de ambiente:**

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | não | Liga o diretor com IA (sem ela, edita por regras) |
| `ELOTAKE_LANG` | não | Idioma da fala; padrão `pt` |
| `ELOTAKE_WHISPER_MODEL` | não | Modelo de transcrição; padrão `small` |
| `ELOTAKE_VCPUS` | não | vCPUs por máquina; padrão 4 (máximo do plano Hobby) |
| `ELOTAKE_SNAPSHOT_ID` | não | Snapshot de Sandbox já preparado (pula a instalação) |
| `NEXT_PUBLIC_SUPABASE_URL` | sim, em produção | Endereço do projeto Supabase (login e banco) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim, em produção | Chave pública (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | sim, em produção | Chave secreta, só no servidor (ou `SUPABASE_SERVICE_ROLE_KEY`) |

### Contas e banco (Supabase)

Login por e-mail com link mágico ou Google; a conta é criada no primeiro acesso. Estilos,
projetos, versões e consumo de minutos ficam no Postgres do Supabase
([`supabase/migrations`](supabase/migrations)). Os vídeos continuam no Blob.

- A API grava com a chave secreta e filtra por `user_id` em toda consulta. O RLS deixa
  cada pessoa ler só o que é dela pelo navegador, e nada é gravado direto do cliente.
- Cada upload fica em `uploads/<id da pessoa>/...`; a API recusa arquivos de outra conta.
- Uma linha em `consumo` por versão pronta (minutos do vídeo bruto); `consumo_mensal`
  soma por mês, no fuso de São Paulo.

No painel do Supabase:

1. Rode a migração (`supabase db push` ou cole o SQL no SQL Editor).
2. **Authentication → URL Configuration:** Site URL com o domínio do app e, em Redirect
   URLs, `https://<domínio>/auth/callback` (e `http://localhost:3000/auth/callback`).
3. **Authentication → Providers → Google:** ligue e cole o Client ID e o Secret do Google
   Cloud (redirect `https://<projeto>.supabase.co/auth/v1/callback`).

Sem as variáveis do Supabase (desenvolvimento local), o app roda sem login, com um usuário
local e os dados em JSON em `web/.data`.

## Desenvolvimento local

Pré-requisitos: Python 3.11+, Node 20+ e FFmpeg com libass (`ffmpeg -filters | grep ass`).
Sem `BLOB_READ_WRITE_TOKEN`, a interface guarda tudo em `web/.data` e roda o motor como
processo local, então dá para testar sem conta na Vercel.

```bash
cd engine
python -m venv .venv && .venv/bin/pip install -e ".[transcricao,dev]"

cd ../web
npm install
npm run dev        # http://localhost:3000
```

Variáveis úteis no modo local: `ANTHROPIC_API_KEY`, `ELOTAKE_LANG`, `ELOTAKE_WHISPER_MODEL`
(use `base` para testar mais rápido), `ELOTAKE_PYTHON` (padrão `engine/.venv/bin/python`).

### Linha de comando

```bash
cd engine
.venv/bin/elotake editar bruto.mp4 --estilo dinamico --destino reels --objetivo "anúncio do curso"
.venv/bin/elotake referencia video_que_eu_amo.mp4   # mede o ritmo de corte de uma referência
.venv/bin/elotake catalogo > ../web/src/lib/catalog.json   # depois de mudar estilos/destinos
```

### Testes

```bash
cd engine && .venv/bin/pytest
cd web && npm run lint && npm run build
```

Os testes geram um vídeo sintético com fala (pausas longas, um "um" e uma frase repetida),
editam em todos os formatos e conferem tamanho, duração, áudio, legendas e o worker.

## Como o motor edita

1. **Análise:** metadados, silêncios, cortes de cena e transcrição com tempo por palavra.
2. **Direção:** o Claude lê as frases numeradas, o estilo e o objetivo, e devolve a montagem
   (quais frases, em que ordem, onde dar zoom, texto de tela, título, descrição, hashtags).
   Sem IA disponível, um diretor por regras corta pausas e vícios e alterna enquadramentos.
3. **Plano de edição:** a decisão vira um `EditPlan` em JSON, com cortes exatos nas fronteiras
   das palavras.
4. **Render:** um único filtergraph do FFmpeg aplica cortes, zoom, reenquadramento, cor,
   efeitos, legendas, limpeza de áudio, música com *ducking* e loudness da plataforma.
