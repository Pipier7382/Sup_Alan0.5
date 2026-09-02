-- ==========================================================
-- SISTEMA DA SUPERINTENDÊNCIA
-- 1 superintendente -> 5 gerentes -> 10 corretores por gerente
-- Login por TIPO + NOME + SENHA
-- ==========================================================

create extension if not exists "pgcrypto";

drop function if exists public.login_usuario(text,text,text);
drop function if exists public.logout_usuario(text);
drop function if exists public.me_usuario(text);
drop function if exists public.dados_painel(text,text,text);
drop function if exists public.salvar_relatorio(text,text,date,text,integer,integer,integer,integer,integer,integer);
drop function if exists public.excluir_dia(text,text,date);
drop function if exists public.salvar_agendamento_semana(text,text,date,integer,integer,integer,integer,integer,integer,integer);
drop function if exists public.salvar_agendamento_cliente(text,text,date,time,text,text);
drop function if exists public.excluir_agendamento_cliente(text,uuid);

drop table if exists public.sessoes cascade;
drop table if exists public.agendamentos_clientes cascade;
drop table if exists public.agendamentos_semanais cascade;
drop table if exists public.relatorios cascade;
drop table if exists public.usuarios cascade;
drop table if exists public.corretores cascade;
drop table if exists public.gerencias cascade;

create table public.gerencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

create table public.corretores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  gerencia_id uuid not null references public.gerencias(id) on delete cascade,
  ativo boolean not null default true,
  unique(nome, gerencia_id)
);

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('corretor','gerente','superintendente')),
  senha_hash text not null,
  gerencia_id uuid references public.gerencias(id) on delete cascade,
  corretor_id uuid references public.corretores(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tipo, nome)
);

create table public.sessoes (
  token text primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '12 hours')
);

create index sessoes_usuario_idx on public.sessoes(usuario_id);
create index sessoes_expira_idx on public.sessoes(expira_em);

create table public.relatorios (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  data date not null,
  periodo text not null check (periodo in ('12:00','15:00','18:00','21:00')),
  interacoes integer not null default 0 check (interacoes >= 0),
  negociacoes integer not null default 0 check (negociacoes >= 0),
  agendamentos integer not null default 0 check (agendamentos >= 0),
  visitas integer not null default 0 check (visitas >= 0),
  propostas integer not null default 0 check (propostas >= 0),
  vendas integer not null default 0 check (vendas >= 0),
  created_at timestamptz not null default now(),
  unique(corretor_id, data, periodo)
);

create table public.agendamentos_semanais (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  semana_inicio date not null,
  seg integer not null default 0,
  ter integer not null default 0,
  qua integer not null default 0,
  qui integer not null default 0,
  sex integer not null default 0,
  sab integer not null default 0,
  dom integer not null default 0,
  unique(corretor_id, semana_inicio)
);

create table public.agendamentos_clientes (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  data date not null,
  horario time not null,
  cliente text not null,
  telefone text,
  created_at timestamptz not null default now()
);

create index relatorios_corretor_data_idx on public.relatorios(corretor_id,data);
create index agendamentos_semanais_corretor_idx on public.agendamentos_semanais(corretor_id,semana_inicio);
create index agendamentos_clientes_corretor_data_idx on public.agendamentos_clientes(corretor_id,data);

-- ----------------------------------------------------------
-- DADOS DE TESTE
-- Superintendente: Alan / 11111
-- Gerentes: Gerente 1..5 / 11111
-- Corretores: Corretor 1.1..5.10 / 11111
-- ----------------------------------------------------------

do $$
declare
  g uuid;
  c uuid;
  i int;
  j int;
begin
  for i in 1..5 loop
    insert into public.gerencias(nome)
      values ('Gerência ' || i)
      on conflict (nome) do update set nome = excluded.nome
      returning id into g;

    insert into public.usuarios(nome,tipo,senha_hash,gerencia_id)
      values ('Gerente ' || i,'gerente',crypt('11111',gen_salt('bf')),g)
      on conflict (tipo,nome) do update
        set senha_hash=excluded.senha_hash, gerencia_id=excluded.gerencia_id, ativo=true;

    for j in 1..10 loop
      insert into public.corretores(nome,gerencia_id)
        values ('Corretor ' || i || '.' || j,g)
        on conflict (nome,gerencia_id) do update set ativo=true
        returning id into c;

      insert into public.usuarios(nome,tipo,senha_hash,gerencia_id,corretor_id)
        values ('Corretor ' || i || '.' || j,'corretor',crypt('11111',gen_salt('bf')),g,c)
        on conflict (tipo,nome) do update
          set senha_hash=excluded.senha_hash, gerencia_id=excluded.gerencia_id,
              corretor_id=excluded.corretor_id, ativo=true;
    end loop;
  end loop;

  insert into public.usuarios(nome,tipo,senha_hash)
    values ('Alan','superintendente',crypt('11111',gen_salt('bf')))
    on conflict (tipo,nome) do update set senha_hash=excluded.senha_hash, ativo=true;
end $$;

-- ----------------------------------------------------------
-- Funções de autenticação e autorização
-- ----------------------------------------------------------

create or replace function public.login_usuario(p_tipo text,p_nome text,p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
  t text;
begin
  select * into u
  from public.usuarios
  where lower(tipo)=lower(trim(p_tipo))
    and lower(nome)=lower(trim(p_nome))
    and ativo=true
  limit 1;

  if not found or crypt(p_senha,u.senha_hash) <> u.senha_hash then
    raise exception 'Usuário ou senha inválidos.';
  end if;

  delete from public.sessoes where expira_em < now();

  t := encode(gen_random_bytes(32),'hex');
  insert into public.sessoes(token,usuario_id)
    values(t,u.id);

  return jsonb_build_object(
    'token',t,
    'usuario',jsonb_build_object(
      'id',u.id,'nome',u.nome,'tipo',u.tipo,
      'gerencia_id',u.gerencia_id,'corretor_id',u.corretor_id
    )
  );
end $$;

create or replace function public.me_usuario(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare u public.usuarios;
begin
  select us.* into u
  from public.sessoes s
  join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  if not found then raise exception 'Sessão expirada.'; end if;

  return jsonb_build_object(
    'id',u.id,'nome',u.nome,'tipo',u.tipo,
    'gerencia_id',u.gerencia_id,'corretor_id',u.corretor_id
  );
end $$;

create or replace function public.logout_usuario(p_token text)
returns boolean
language sql
security definer
set search_path = public
as $$ delete from public.sessoes where token=p_token returning true; $$;

-- ----------------------------------------------------------
-- Painel: devolve somente o que o perfil pode enxergar.
-- O frontend não acessa diretamente as tabelas.
-- ----------------------------------------------------------

create or replace function public.dados_painel(p_token text,p_inicio text default null,p_fim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.usuarios;
  ini date := coalesce(nullif(p_inicio,'')::date, current_date - 30);
  fim date := coalesce(nullif(p_fim,'')::date, current_date);
  result jsonb;
begin
  select us.* into u
  from public.sessoes s
  join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;

  if not found then raise exception 'Sessão expirada.'; end if;

  select jsonb_build_object(
    'relatorios', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data,x.periodo)
      from (
        select r.id,r.data,r.periodo,r.interacoes,r.negociacoes,r.agendamentos,
               r.visitas,r.propostas,r.vendas,
               c.id as corretor_id,c.nome as corretor,c.gerencia_id,g.nome as gerencia
        from public.relatorios r
        join public.corretores c on c.id=r.corretor_id
        join public.gerencias g on g.id=c.gerencia_id
        where r.data between ini and fim
          and (
            u.tipo='superintendente'
            or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id)
            or (u.tipo='corretor' and c.id=u.corretor_id)
          )
      ) x
    ),'[]'::jsonb),
    'agendamentos_semanais', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select a.*,c.nome as corretor,g.nome as gerencia
        from public.agendamentos_semanais a
        join public.corretores c on c.id=a.corretor_id
        join public.gerencias g on g.id=c.gerencia_id
        where (
          u.tipo='superintendente'
          or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id)
          or (u.tipo='corretor' and c.id=u.corretor_id)
        )
      ) x
    ),'[]'::jsonb),
    'agendamentos_clientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data,x.horario)
      from (
        select a.id,a.data,a.horario,a.cliente,a.telefone,
               c.id as corretor_id,c.nome as corretor,g.nome as gerencia
        from public.agendamentos_clientes a
        join public.corretores c on c.id=a.corretor_id
        join public.gerencias g on g.id=c.gerencia_id
        where a.data between ini and fim
          and (
            u.tipo='superintendente'
            or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id)
            or (u.tipo='corretor' and c.id=u.corretor_id)
          )
      ) x
    ),'[]'::jsonb),
    'corretores', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.gerencia,x.nome)
      from (
        select c.id,c.nome,c.gerencia_id,g.nome as gerencia
        from public.corretores c
        join public.gerencias g on g.id=c.gerencia_id
        where c.ativo=true
          and (
            u.tipo='superintendente'
            or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id)
            or (u.tipo='corretor' and c.id=u.corretor_id)
          )
      ) x
    ),'[]'::jsonb),
    'gerencias', coalesce((select jsonb_agg(to_jsonb(g) order by g.nome) from public.gerencias g),'[]'::jsonb)
  ) into result;

  return result;
end $$;

-- ----------------------------------------------------------
-- Escritas
-- ----------------------------------------------------------

create or replace function public.salvar_relatorio(
  p_token text,p_corretor_id text,p_data date,p_periodo text,
  p_interacoes int,p_negociacoes int,p_agendamentos int,
  p_visitas int,p_propostas int,p_vendas int
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare u public.usuarios; c public.corretores;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  if not found then raise exception 'Sessão expirada.'; end if;

  select * into c from public.corretores where id=p_corretor_id::uuid and ativo=true;
  if not found then raise exception 'Corretor inválido.'; end if;

  if not (
    u.tipo='superintendente'
    or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id)
    or (u.tipo='corretor' and c.id=u.corretor_id)
  ) then raise exception 'Sem permissão.'; end if;

  insert into public.relatorios(corretor_id,data,periodo,interacoes,negociacoes,agendamentos,visitas,propostas,vendas)
  values(p_corretor_id::uuid,p_data,p_periodo,greatest(p_interacoes,0),greatest(p_negociacoes,0),
         greatest(p_agendamentos,0),greatest(p_visitas,0),greatest(p_propostas,0),greatest(p_vendas,0))
  on conflict(corretor_id,data,periodo) do update set
    interacoes=excluded.interacoes,negociacoes=excluded.negociacoes,agendamentos=excluded.agendamentos,
    visitas=excluded.visitas,propostas=excluded.propostas,vendas=excluded.vendas;
  return true;
end $$;

create or replace function public.excluir_dia(p_token text,p_corretor_id text,p_data date)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare u public.usuarios; c public.corretores;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  select * into c from public.corretores where id=p_corretor_id::uuid;
  if not found or not (u.tipo='superintendente' or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id) or (u.tipo='corretor' and c.id=u.corretor_id)) then
    raise exception 'Sem permissão.';
  end if;
  delete from public.relatorios where corretor_id=c.id and data=p_data;
  return true;
end $$;

create or replace function public.salvar_agendamento_semana(
  p_token text,p_corretor_id text,p_semana date,
  p_seg int,p_ter int,p_qua int,p_qui int,p_sex int,p_sab int,p_dom int
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare u public.usuarios; c public.corretores;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  select * into c from public.corretores where id=p_corretor_id::uuid;
  if not found or not (u.tipo='superintendente' or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id) or (u.tipo='corretor' and c.id=u.corretor_id)) then
    raise exception 'Sem permissão.';
  end if;
  insert into public.agendamentos_semanais(corretor_id,semana_inicio,seg,ter,qua,qui,sex,sab,dom)
  values(c.id,p_semana,greatest(p_seg,0),greatest(p_ter,0),greatest(p_qua,0),greatest(p_qui,0),greatest(p_sex,0),greatest(p_sab,0),greatest(p_dom,0))
  on conflict(corretor_id,semana_inicio) do update set
    seg=excluded.seg,ter=excluded.ter,qua=excluded.qua,qui=excluded.qui,sex=excluded.sex,sab=excluded.sab,dom=excluded.dom;
  return true;
end $$;

create or replace function public.salvar_agendamento_cliente(
  p_token text,p_corretor_id text,p_data date,p_horario time,p_cliente text,p_telefone text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare u public.usuarios; c public.corretores; novo uuid;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  select * into c from public.corretores where id=p_corretor_id::uuid;
  if not found or not (u.tipo='superintendente' or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id) or (u.tipo='corretor' and c.id=u.corretor_id)) then
    raise exception 'Sem permissão.';
  end if;
  insert into public.agendamentos_clientes(corretor_id,data,horario,cliente,telefone)
  values(c.id,p_data,p_horario,p_cliente,p_telefone) returning id into novo;
  return novo;
end $$;

create or replace function public.excluir_agendamento_cliente(p_token text,p_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare u public.usuarios; c public.corretores;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id=s.usuario_id
  where s.token=p_token and s.expira_em>now() and us.ativo=true;
  select c.* into c from public.agendamentos_clientes a join public.corretores c on c.id=a.corretor_id where a.id=p_id;
  if not found or not (u.tipo='superintendente' or (u.tipo='gerente' and c.gerencia_id=u.gerencia_id) or (u.tipo='corretor' and c.id=u.corretor_id)) then
    raise exception 'Sem permissão.';
  end if;
  delete from public.agendamentos_clientes where id=p_id;
  return true;
end $$;

-- Não permitir acesso direto às tabelas pelo frontend.
alter table public.gerencias enable row level security;
alter table public.corretores enable row level security;
alter table public.usuarios enable row level security;
alter table public.sessoes enable row level security;
alter table public.relatorios enable row level security;
alter table public.agendamentos_semanais enable row level security;
alter table public.agendamentos_clientes enable row level security;

-- Sem policies públicas: as funções SECURITY DEFINER são a interface do app.
revoke all on public.gerencias,public.corretores,public.usuarios,public.sessoes,
  public.relatorios,public.agendamentos_semanais,public.agendamentos_clientes from anon,authenticated;

grant execute on function public.login_usuario(text,text,text) to anon,authenticated;
grant execute on function public.logout_usuario(text) to anon,authenticated;
grant execute on function public.me_usuario(text) to anon,authenticated;
grant execute on function public.dados_painel(text,text,text) to anon,authenticated;
grant execute on function public.salvar_relatorio(text,text,date,text,integer,integer,integer,integer,integer,integer) to anon,authenticated;
grant execute on function public.excluir_dia(text,text,date) to anon,authenticated;
grant execute on function public.salvar_agendamento_semana(text,text,date,integer,integer,integer,integer,integer,integer,integer) to anon,authenticated;
grant execute on function public.salvar_agendamento_cliente(text,text,date,time,text,text) to anon,authenticated;
grant execute on function public.excluir_agendamento_cliente(text,uuid) to anon,authenticated;

-- Limpeza periódica de sessões expiradas pode ser feita pelo próprio login.
