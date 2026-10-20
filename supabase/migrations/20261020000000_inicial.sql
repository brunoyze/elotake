-- Elotake: contas, estilos, projetos, versões e consumo de minutos.
--
-- Quem escreve é só a API (chave secreta, que ignora o RLS). Pelo navegador, cada
-- pessoa só consegue ler o que é dela; nada é gravado direto do cliente, para que
-- ninguém altere status, máquina de edição ou consumo.

-- ---- usuários --------------------------------------------------------------

create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text,
  plano text not null default 'gratis' check (plano in ('gratis', 'criador', 'pro', 'agencia')),
  criado_em timestamptz not null default now()
);

-- Cria a linha de usuarios no primeiro login (link mágico ou Google).
create function public.criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, email, nome)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_usuario();

-- ---- estilos ---------------------------------------------------------------

create table public.estilos (
  user_id uuid not null references public.usuarios (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_-]{1,40}$'),
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, slug)
);

-- ---- projetos --------------------------------------------------------------

create table public.projetos (
  id text primary key check (id ~ '^[a-f0-9]{12}$'),
  user_id uuid not null references public.usuarios (id) on delete cascade,
  nome text not null,
  profile_id text not null,
  brief jsonb not null,
  status text not null,
  progresso real not null default 0,
  erro text,
  plano jsonb,
  duracao_original real,
  versao integer not null default 0,
  -- caminhos no Blob e máquina de edição: só a API lê
  source text not null,
  music text,
  job jsonb,
  criado_em timestamptz not null default now()
);

create index projetos_user_id_criado_em on public.projetos (user_id, criado_em desc);

-- Histórico: uma linha por edição (a primeira e cada "refazer").
create table public.versoes (
  projeto_id text not null references public.projetos (id) on delete cascade,
  versao integer not null,
  user_id uuid not null references public.usuarios (id) on delete cascade,
  profile_id text not null,
  brief jsonb not null,
  status text not null,
  erro text,
  plano jsonb,
  duracao_original real,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  primary key (projeto_id, versao)
);

create index versoes_user_id on public.versoes (user_id);

-- ---- consumo ---------------------------------------------------------------

-- Minutos de vídeo bruto editados. Uma linha por versão pronta; o limite do plano
-- soma as linhas do mês. Fica mesmo se o projeto for apagado.
create table public.consumo (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.usuarios (id) on delete cascade,
  projeto_id text not null,
  versao integer not null,
  minutos numeric(10, 2) not null check (minutos >= 0),
  criado_em timestamptz not null default now(),
  unique (projeto_id, versao)
);

create index consumo_user_id_criado_em on public.consumo (user_id, criado_em);

create view public.consumo_mensal
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', criado_em at time zone 'America/Sao_Paulo')::date as mes,
  sum(minutos) as minutos
from public.consumo
group by 1, 2;

-- ---- segurança -------------------------------------------------------------

alter table public.usuarios enable row level security;
alter table public.estilos enable row level security;
alter table public.projetos enable row level security;
alter table public.versoes enable row level security;
alter table public.consumo enable row level security;

create policy "cada pessoa lê a própria conta" on public.usuarios
  for select to authenticated using ((select auth.uid()) = id);

create policy "cada pessoa lê os próprios estilos" on public.estilos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "cada pessoa lê os próprios projetos" on public.projetos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "cada pessoa lê as próprias versões" on public.versoes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "cada pessoa lê o próprio consumo" on public.consumo
  for select to authenticated using ((select auth.uid()) = user_id);

-- Colunas internas dos projetos não saem pela API pública.
revoke select on public.projetos from anon, authenticated;
grant select (id, user_id, nome, profile_id, brief, status, progresso, erro, plano,
              duracao_original, versao, criado_em)
  on public.projetos to authenticated;

revoke all on public.usuarios, public.estilos, public.versoes, public.consumo,
              public.consumo_mensal from anon;
revoke insert, update, delete, truncate on public.usuarios, public.estilos, public.projetos,
              public.versoes, public.consumo from authenticated;
revoke execute on function public.criar_usuario() from public, anon, authenticated;
