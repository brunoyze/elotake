# Elotake

**Você grava. A Elotake edita.** Editor de vídeo automático: a pessoa define o estilo dela
uma vez, sobe o vídeo bruto, diz para onde ele vai (Reels, anúncio, YouTube...) e recebe o
vídeo pronto, com cortes, zoom, legenda animada, cor, música e áudio tratado.

O plano completo do produto (público, funcionalidades, arquitetura, preços, roteiro) está em
[`docs/PLANO_DE_PRODUTO.md`](docs/PLANO_DE_PRODUTO.md).

## Estrutura

```
engine/   motor de edição (Python + FFmpeg) e API HTTP (FastAPI)
web/      interface (Next.js + Tailwind)
docs/     plano de produto
```

## Como rodar

Pré-requisitos: Python 3.11+, Node 20+ e FFmpeg com libass (`ffmpeg -filters | grep ass`).
Para a legenda ficar igual à do produto, instale a fonte Inter (`fonts-inter` no Ubuntu).

### Motor

```bash
cd engine
python -m venv .venv && source .venv/bin/activate
pip install -e ".[transcricao,dev]"     # sem [transcricao], edita só pelos silêncios
export ANTHROPIC_API_KEY=...             # opcional: liga o diretor com IA
uvicorn elotake_engine.api:app --port 8000
```

Variáveis úteis:

| Variável | Padrão | Para quê |
|---|---|---|
| `ELOTAKE_DATA` | `data` | Onde ficam vídeos e projetos |
| `ELOTAKE_USE_AI` | `1` | `0` desliga o diretor com IA |
| `ELOTAKE_WHISPER_MODEL` | `small` | Tamanho do modelo de transcrição (`base`, `small`, `medium`...) |
| `ELOTAKE_LANG` | detecta | Idioma da fala (`pt`, `en`...) |
| `ELOTAKE_WORKERS` | `2` | Vídeos editados em paralelo |

Também dá para editar direto pela linha de comando:

```bash
elotake editar bruto.mp4 --estilo dinamico --destino reels --objetivo "anúncio do curso"
elotake referencia video_que_eu_amo.mp4   # mede o ritmo de corte de uma referência
```

### Interface

```bash
cd web
npm install
NEXT_PUBLIC_ENGINE_URL=http://localhost:8000 npm run dev
```

Abra http://localhost:3000.

### Testes

```bash
cd engine && pytest
```

Os testes geram um vídeo sintético com fala (pausas longas, um "um" e uma frase repetida),
editam em todos os formatos e conferem tamanho, duração, áudio e legendas.

## Como funciona

1. **Análise:** metadados, silêncios, cortes de cena e transcrição com tempo por palavra.
2. **Direção:** o Claude lê as frases numeradas, o estilo e o objetivo, e devolve a montagem
   (quais frases, em que ordem, onde dar zoom, texto de tela, título, descrição, hashtags).
   Sem IA disponível, um diretor por regras corta pausas e vícios e alterna enquadramentos.
3. **Plano de edição:** a decisão vira um `EditPlan` em JSON, com cortes exatos nas fronteiras
   das palavras.
4. **Render:** um único filtergraph do FFmpeg aplica cortes, zoom, reenquadramento, cor,
   efeitos, legendas, limpeza de áudio, música com *ducking* e loudness da plataforma.
