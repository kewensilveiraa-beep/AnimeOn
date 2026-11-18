create table if not exists public.cliques_afiliados (
  id uuid primary key default gen_random_uuid(),
  anime_titulo text not null check (char_length(anime_titulo) between 1 and 200),
  tipo_link text not null check (tipo_link in ('manga', 'crunchyroll', 'prime_video')),
  url_destino text not null,
  origem_trafego text not null default 'direto' check (char_length(origem_trafego) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint cliques_afiliados_amazon_tag check (
    url_destino ~ '^https://www\.amazon\.com\.br/'
    and position('tag=animeon09-20' in url_destino) > 0
  )
);

create index if not exists cliques_afiliados_created_at_idx
  on public.cliques_afiliados (created_at desc);
create index if not exists cliques_afiliados_tipo_link_idx
  on public.cliques_afiliados (tipo_link);
create index if not exists cliques_afiliados_anime_titulo_idx
  on public.cliques_afiliados (anime_titulo);

alter table public.cliques_afiliados enable row level security;
revoke all on public.cliques_afiliados from public, anon, authenticated;
grant insert on public.cliques_afiliados to anon;
grant all on public.cliques_afiliados to service_role;
drop policy if exists "Public can insert tagged affiliate clicks" on public.cliques_afiliados;
create policy "Public can insert tagged affiliate clicks"
  on public.cliques_afiliados
  for insert
  to anon
  with check (
    char_length(anime_titulo) between 1 and 200
    and tipo_link in ('manga', 'crunchyroll', 'prime_video')
    and char_length(origem_trafego) between 1 and 100
    and url_destino ~ '^https://www\.amazon\.com\.br/'
    and position('tag=animeon09-20' in url_destino) > 0
  );

create table if not exists public.movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null check (char_length(descricao) between 1 and 180),
  valor numeric(14, 2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

create index if not exists movimentacoes_financeiras_created_at_idx
  on public.movimentacoes_financeiras (created_at desc);

alter table public.movimentacoes_financeiras enable row level security;
revoke all on public.movimentacoes_financeiras from public, anon, authenticated;
grant all on public.movimentacoes_financeiras to service_role;

create table if not exists public.admin_login_attempts (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  attempts smallint not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from public, anon, authenticated;
grant all on public.admin_login_attempts to service_role;

create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'totalClicks', (select count(*) from public.cliques_afiliados),
    'tiktokClicks', (
      select count(*)
      from public.cliques_afiliados
      where lower(origem_trafego) = 'tiktok'
    ),
    'clicksByType', coalesce((
      select jsonb_object_agg(tipo_link, click_count)
      from (
        select tipo_link, count(*) as click_count
        from public.cliques_afiliados
        group by tipo_link
      ) as clicks_by_type
    ), '{}'::jsonb),
    'topAnimes', coalesce((
      select jsonb_agg(
        jsonb_build_object('animeTitulo', anime_titulo, 'clicks', click_count)
        order by click_count desc, anime_titulo asc
      )
      from (
        select anime_titulo, count(*) as click_count
        from public.cliques_afiliados
        group by anime_titulo
        order by count(*) desc, anime_titulo asc
        limit 5
      ) as top_animes
    ), '[]'::jsonb),
    'revenue', coalesce((
      select sum(valor) from public.movimentacoes_financeiras where tipo = 'receita'
    ), 0),
    'costs', coalesce((
      select sum(valor) from public.movimentacoes_financeiras where tipo = 'despesa'
    ), 0)
  );
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics() to service_role;

create or replace function public.admin_login_rate_limit(p_ip_hash text, p_success boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked_until timestamptz;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid IP hash';
  end if;

  if p_success is null then
    select locked_until into v_locked_until
    from public.admin_login_attempts
    where ip_hash = p_ip_hash;
    if v_locked_until > now() then
      return v_locked_until;
    end if;
    return null;
  end if;

  if p_success then
    delete from public.admin_login_attempts where ip_hash = p_ip_hash;
    return null;
  end if;

  insert into public.admin_login_attempts (ip_hash, attempts, window_started_at)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update set
    attempts = case
      when admin_login_attempts.locked_until > now() then admin_login_attempts.attempts
      when admin_login_attempts.window_started_at <= now() - interval '15 minutes' then 1
      else admin_login_attempts.attempts + 1
    end,
    window_started_at = case
      when admin_login_attempts.locked_until > now() then admin_login_attempts.window_started_at
      when admin_login_attempts.window_started_at <= now() - interval '15 minutes' then now()
      else admin_login_attempts.window_started_at
    end,
    locked_until = case
      when admin_login_attempts.locked_until > now() then admin_login_attempts.locked_until
      when admin_login_attempts.window_started_at <= now() - interval '15 minutes' then null
      when admin_login_attempts.attempts + 1 >= 5 then now() + interval '15 minutes'
      else null
    end
  returning locked_until into v_locked_until;

  return v_locked_until;
end;
$$;

revoke all on function public.admin_login_rate_limit(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_login_rate_limit(text, boolean) to service_role;
