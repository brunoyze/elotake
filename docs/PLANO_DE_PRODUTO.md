# Elotake — Plano de produto

> **Você grava. A Elotake edita.**
> Um editor de vídeo que não tem linha do tempo: a pessoa define o estilo dela uma vez,
> sobe o vídeo bruto, diz para onde ele vai, e recebe pronto, com cara de editor profissional.

---

## 1. O problema

Quem precisa de vídeo hoje (criador, pequeno negócio, infoprodutor, social media, agência)
tem três caminhos, e todos são ruins:

| Caminho | Problema |
|---|---|
| Editar sozinho (Premiere, CapCut) | Curva de aprendizado, horas por vídeo, resultado amador |
| Contratar editor | Caro, lento, depende de outra pessoa, ida e volta de ajustes |
| Ferramentas de "um clique" (legenda automática, cortes de clipes) | Resolvem um pedaço só; o resultado é genérico, igual ao de todo mundo |

O que falta é algo que **edite como um bom editor que já conhece você**: que saiba o seu
estilo, entenda o objetivo do vídeo (anúncio é diferente de YouTube) e entregue o vídeo
inteiro pronto.

## 2. A proposta

Três ideias guiam o produto:

1. **DNA de edição.** O estilo é configurado uma vez (ritmo, legenda, cor, música, efeitos,
   vídeos de referência, instruções em texto livre) e vale para todos os vídeos. É o que faz
   o resultado ser *seu*, e não genérico. Também é o que segura o cliente: quanto mais ele
   usa, melhor a Elotake conhece o estilo dele.
2. **Edição por objetivo.** A pessoa não escolhe cortes; escolhe *para onde vai* e *para quê*.
   Um anúncio vira gancho → problema → solução → chamada para ação em 45 segundos.
   Um YouTube mantém o raciocínio completo. Um podcast só limpa pausas.
3. **A IA decide, o motor executa.** O modelo de linguagem lê a transcrição e decide a
   montagem (o que fica, em que ordem, onde enfatizar). Um motor determinístico (FFmpeg)
   transforma essa decisão em vídeo. Isso deixa o resultado reproduzível, ajustável,
   barato de renderizar e impede a IA de "cortar no meio de uma palavra".

### Posicionamento

- **Premiere / CapCut**: ferramentas para quem edita. A Elotake é para quem *não quer* editar.
- **Higgsfield e geradores de vídeo**: criam imagem do zero. A Elotake trabalha sobre o vídeo
  real da pessoa (o rosto, a voz, o produto dela), que é o que converte e gera confiança.
  Efeitos gerativos entram como camada extra (fase 3).
- **Submagic, Captions, Opus Clip**: resolvem legenda ou recorte de clipes. A Elotake entrega o
  vídeo inteiro editado, no estilo do cliente, pensado para o objetivo.

## 3. Para quem (primeiros clientes)

1. **Infoprodutores e quem vende com anúncio**: gravam muitos criativos, precisam testar
   variações rápido. Dor alta, disposição a pagar alta. **Público inicial recomendado.**
2. **Criadores de conteúdo** (Reels/TikTok/Shorts/YouTube): volume alto, sensíveis a estilo.
3. **Pequenos negócios e profissionais liberais** (médico, advogado, loja): querem aparecer,
   não sabem editar, não têm editor.
4. **Social medias e agências**: vários clientes, cada um com um estilo — o "DNA por cliente"
   é exatamente o que eles precisam (plano Agência).

## 4. Experiência do usuário

```
Onboarding (1x)                Cada vídeo (minutos)                 Depois
───────────────                ─────────────────────                ──────
Escolhe um ponto de partida → Sobe o vídeo bruto                → Vê o vídeo pronto
Ajusta ritmo, legenda, cor    Escolhe destino (Reels, Ads...)     Lê o "o que eu fiz"
Sobe/cola referências         Escreve o objetivo em 1 frase       Copia título/descrição/hashtags
Escreve instruções livres     (opcional) muda efeitos/música      Ajusta e refaz em 1 clique
                                                                   Baixa / publica
```

Princípios de UX:
- **Zero linha do tempo** na primeira versão. Ajustes são por escolha ("mais rápido", "sem
  zoom", "agora em YouTube") e, na fase 2, por conversa ("tira a parte do preço").
- **Mostrar o trabalho.** A tela final mostra o bruto inteiro com o que foi mantido e cortado,
  e um resumo em português simples das decisões. Isso gera confiança.
- **Nunca falhar em silêncio.** Se a IA não responder, o diretor por regras edita mesmo assim.

## 5. Funcionalidades

### MVP (o que já está neste repositório)

- [x] Perfil de estilo ("DNA") com 5 presets: Dinâmico, Cinematográfico, Clean, UGC para anúncios, Podcast
- [x] Ajuste fino: ritmo, estilo de legenda, cor do destaque, color grading, clima da música, efeitos
- [x] Referências: mede o ritmo de corte de um vídeo de referência e aplica no estilo
- [x] Destinos: Reels/TikTok/Shorts (9:16), Anúncio (9:16, ≤45s), YouTube (16:9), Feed (4:5), Podcast
- [x] Transcrição local com tempo por palavra (Whisper)
- [x] Corte de silêncios e de vícios de linguagem ("ahn", "né", "tipo" soltos)
- [x] Diretor com IA (Claude): escolhe frases, reordena para abrir com gancho, decide ênfases,
      texto de tela, título, descrição e hashtags; cai para regras se falhar
- [x] Zoom de ênfase (punch-in), reenquadramento (corte central ou fundo desfocado)
- [x] Legendas animadas: destaque (palavra ativa colorida), karaokê, limpa
- [x] Efeitos: flash nos cortes, granulado, barras de cinema, vinheta, color grading
- [x] Áudio: limpeza de ruído, compressão, normalização de loudness por plataforma,
      música com *ducking* automático (abaixa quando a pessoa fala)
- [x] Interface web: onboarding do estilo, upload, acompanhamento, player, linha do tempo
      do que foi cortado, "ajustar e refazer" reaproveitando a transcrição

### Fase 2 — "parece editor de verdade" (próximos 2 a 3 meses)

- Reenquadramento inteligente com detecção de rosto (o rosto fica no centro do 9:16)
- Ajuste por conversa: "deixa mais curto", "tira a parte do preço", "começa pela história"
- B-roll automático: imagens/vídeos de banco relacionados à fala, nos pontos certos
- Biblioteca de música licenciada por clima, com corte no tempo da batida
- Efeitos sonoros (whoosh nos cortes, pop nas palavras de destaque)
- Vários vídeos por envio: 1 bruto longo → 5 cortes curtos (o modelo escolhe os melhores trechos)
- Variações de anúncio: o mesmo bruto em 3 ganchos diferentes, para teste A/B
- Análise de referência mais profunda: estilo de legenda, frequência de zoom, cor
- Marca do cliente: logo, fontes, cores, vinheta de abertura/fechamento
- Publicação direta (Instagram, TikTok, YouTube) e agendamento
- Contas, times e projetos por cliente (plano Agência)

### Fase 3 — efeitos gerativos e escala

- Efeitos e transições gerativas (estilo Higgsfield) aplicados sobre o vídeo real
- Dublagem/tradução com a voz da pessoa e sincronia labial
- Correção de olhar, remoção de fundo, limpeza de áudio de estúdio
- Aprendizado do estilo pelo histórico: a Elotake aprende com os ajustes que o cliente faz
- API para agências e plataformas integrarem

## 6. Como a edição funciona (o motor)

```
vídeo bruto
   │
   ▼
1. ANÁLISE ─ ffprobe (formato, rotação) · silêncios · cortes de cena · transcrição por palavra
   │
   ▼
2. DIREÇÃO ─ Claude recebe: frases numeradas + estilo + destino + objetivo
   │          devolve (JSON validado): sequência de frases, zooms, texto de tela,
   │          palavras de destaque, título, descrição, hashtags, resumo
   │          → o motor converte frases em cortes exatos usando o tempo das palavras
   │          (sem IA ou sem fala: diretor por regras)
   ▼
3. PLANO DE EDIÇÃO (EditPlan) ─ JSON salvo: é o "projeto" editável e reproduzível
   │
   ▼
4. RENDER ─ um único filtergraph FFmpeg: cortes + zoom + reenquadramento + cor + efeitos
   │         + legendas ASS + limpeza de áudio + música com ducking + loudness
   ▼
vídeo final + miniatura + título/descrição/hashtags
```

Por que essa arquitetura:
- **Custo:** a IA processa só texto (barato); o vídeo é processado uma vez, por FFmpeg.
- **Qualidade:** a IA faz o que faz bem (entender conteúdo, escolher o que importa); o motor faz
  o que precisa ser exato (tempo de corte, legenda sincronizada).
- **Ajustes rápidos:** refazer reaproveita a transcrição; mudar só o formato nem precisa de IA.
- **Editável no futuro:** o EditPlan pode virar uma linha do tempo para usuários avançados.

## 7. Arquitetura técnica

| Camada | MVP (agora) | Produção |
|---|---|---|
| Interface | Next.js 15 + Tailwind (`web/`) | Mesma, hospedada na Vercel |
| API | FastAPI (`engine/`) | Mesma, em contêiner |
| Fila e workers | Thread pool no processo | Fila (Redis/SQS) + workers com FFmpeg; GPU para Whisper |
| Arquivos | Disco local | Storage de objetos (Cloudflare R2 ou S3) com upload direto do navegador |
| Banco | JSON em disco | Postgres (Supabase) |
| Login | — | Supabase Auth (e-mail, Google) |
| Pagamento | — | Stripe (assinatura + créditos de minutos) |
| IA | Claude (direção), Whisper local (transcrição) | Idem; Whisper em GPU ou API de transcrição |

Custos por vídeo (estimativa a validar com uso real): a direção com IA lê só a transcrição
(alguns milhares de tokens por vídeo curto); o maior custo é computação de render e
transcrição, que escala com os minutos de vídeo. Por isso o plano de preço é por minutos.

## 8. Modelo de negócio (proposta inicial, valores a validar)

| Plano | Para quem | Preço sugerido | Inclui |
|---|---|---|---|
| Grátis | Experimentar | R$ 0 | 3 vídeos/mês, até 2 min, marca d'água |
| Criador | Criadores e profissionais | R$ 59/mês | 60 min de vídeo bruto/mês, 1 estilo |
| Pro | Quem vende com anúncio | R$ 149/mês | 200 min, variações de anúncio, 3 estilos, prioridade |
| Agência | Social medias e agências | R$ 449/mês | 800 min, estilos por cliente, times, API |

Créditos avulsos de minutos para quem passar do limite.

## 9. Roteiro

| Semanas | Entrega |
|---|---|
| 1–2 | **Feito:** motor + interface do MVP (este repositório) |
| 3–4 | Login, storage na nuvem, fila de workers, deploy; 10 usuários de teste reais |
| 5–6 | Reenquadramento por rosto, biblioteca de música, marca do cliente |
| 7–8 | Ajuste por conversa, vários cortes por bruto, variações de anúncio |
| 9–10 | Pagamento, planos, landing page, lançamento fechado (lista de espera) |
| 11–12 | Publicação direta nas redes, métricas de uso, iteração com base nos dados |

## 10. Como medir se está funcionando

- **Ativação:** % de quem cria conta e recebe o 1º vídeo pronto (meta: > 60%)
- **Aceitação:** % de vídeos baixados sem refazer (meta: > 50%; mede a qualidade da edição)
- **Retenção:** vídeos por usuário por semana; % que volta na semana seguinte
- **Tempo até o vídeo:** do upload ao pronto (meta: < 3 min para 1 min de vídeo)
- **Conversão:** grátis → pago (meta inicial: 4–6%)

## 11. Riscos e como lidar

| Risco | Mitigação |
|---|---|
| Resultado "genérico" | DNA de edição, referências, instruções livres; medir aceitação |
| IA corta o que não devia | Cortes sempre em fronteira de palavra; resumo explicando; refazer em 1 clique |
| Custo de computação | Render único por FFmpeg, IA só em texto, preço por minuto |
| Direitos de música | Só biblioteca licenciada ou música enviada pelo cliente |
| Concorrentes grandes copiando | Foco em nicho (vendas com vídeo, PT-BR primeiro), velocidade e qualidade do estilo |
| Privacidade dos vídeos | Armazenamento privado, exclusão automática dos brutos após N dias, termos claros |

## 12. Decisões que dependem de você

1. **Público do lançamento:** recomendo começar por quem vende com anúncio/infoprodutores
   (dor e disposição a pagar maiores). Confirma?
2. **Web ou app?** O MVP é web (funciona no celular e no computador). App nativo para gravar e
   enviar direto do celular pode vir na fase 2.
3. **Música:** contratar uma biblioteca licenciada (ex.: Epidemic, Artlist para empresas)
   ou começar só com "envie sua música"?
4. **Nome/domínio, identidade visual** e onde hospedar (sugestão: Vercel + Supabase + R2).
5. **Preços** da tabela acima.
