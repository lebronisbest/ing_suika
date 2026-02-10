-- Ranking hardening patch for Supabase (run in SQL editor)
-- 1) Data normalization + constraints
-- 2) RLS lockdown for direct writes
-- 3) RPC-only score submission with basic IP-based rate limiting

create extension if not exists pgcrypto;

-- Normalize existing rows before adding constraints
update public.rankings
set name = upper(left(regexp_replace(coalesce(name, ''), '[^A-Za-z]', '', 'g'), 3));

delete from public.rankings
where name is null
   or score is null
   or name !~ '^[A-Z]{3}$'
   or name = any(array[
       'ASS','BCH','CNT','CUM','DCK','DIK','FAG','FAP','FCK','FUC',
       'FUK','JIZ','KKK','KYS','NAZ','NIG','PNS','SEX','SHT','TIT',
       'VGN','XXX'
   ])
   or score < 0
   or score > 1000000;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'rankings_name_format_chk'
    ) then
        alter table public.rankings
            add constraint rankings_name_format_chk
            check (name ~ '^[A-Z]{3}$');
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'rankings_score_range_chk'
    ) then
        alter table public.rankings
            add constraint rankings_score_range_chk
            check (score >= 0 and score <= 1000000);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'rankings_name_blocked_chk'
    ) then
        alter table public.rankings
            add constraint rankings_name_blocked_chk
            check (
                name <> all(array[
                    'ASS','BCH','CNT','CUM','DCK','DIK','FAG','FAP','FCK','FUC',
                    'FUK','JIZ','KKK','KYS','NAZ','NIG','PNS','SEX','SHT','TIT',
                    'VGN','XXX'
                ])
            );
    end if;
end $$;

create index if not exists rankings_score_desc_idx
    on public.rankings (score desc, created_at asc);

create index if not exists rankings_created_at_idx
    on public.rankings (created_at desc);

alter table public.rankings enable row level security;

drop policy if exists rankings_select_policy on public.rankings;
create policy rankings_select_policy
    on public.rankings
    for select
    to anon, authenticated
    using (true);

drop policy if exists rankings_insert_block_policy on public.rankings;
create policy rankings_insert_block_policy
    on public.rankings
    for insert
    to anon, authenticated
    with check (false);

drop policy if exists rankings_update_block_policy on public.rankings;
create policy rankings_update_block_policy
    on public.rankings
    for update
    to anon, authenticated
    using (false)
    with check (false);

drop policy if exists rankings_delete_block_policy on public.rankings;
create policy rankings_delete_block_policy
    on public.rankings
    for delete
    to anon, authenticated
    using (false);

revoke insert, update, delete on public.rankings from anon, authenticated;
grant select on public.rankings to anon, authenticated;

create table if not exists public.ranking_submit_audit (
    id bigserial primary key,
    ip_hash text not null,
    submitted_at timestamptz not null default now()
);

create index if not exists ranking_submit_audit_ip_submitted_idx
    on public.ranking_submit_audit (ip_hash, submitted_at desc);

alter table public.ranking_submit_audit enable row level security;

drop policy if exists ranking_submit_audit_deny_all on public.ranking_submit_audit;
create policy ranking_submit_audit_deny_all
    on public.ranking_submit_audit
    for all
    to anon, authenticated
    using (false)
    with check (false);

revoke all on public.ranking_submit_audit from anon, authenticated;

create or replace function public.submit_score(p_name text, p_score integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_score integer;
    v_headers_text text;
    v_headers jsonb;
    v_ip text;
    v_ip_hash text;
    v_recent_count integer;
begin
    v_name := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 3));
    if v_name !~ '^[A-Z]{3}$' then
        raise exception 'invalid_name';
    end if;
    if v_name = any(array[
        'ASS','BCH','CNT','CUM','DCK','DIK','FAG','FAP','FCK','FUC',
        'FUK','JIZ','KKK','KYS','NAZ','NIG','PNS','SEX','SHT','TIT',
        'VGN','XXX'
    ]) then
        raise exception 'blocked_name';
    end if;

    v_score := p_score;
    if v_score is null or v_score < 0 or v_score > 1000000 then
        raise exception 'invalid_score';
    end if;

    v_headers_text := nullif(current_setting('request.headers', true), '');
    v_headers := coalesce(v_headers_text::jsonb, '{}'::jsonb);

    v_ip := coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', 'unknown');
    v_ip := split_part(v_ip, ',', 1);
    v_ip_hash := encode(digest(v_ip, 'sha256'), 'hex');

    select count(*)
    into v_recent_count
    from public.ranking_submit_audit
    where ip_hash = v_ip_hash
      and submitted_at > now() - interval '10 seconds';

    if v_recent_count >= 3 then
        raise exception 'rate_limit_exceeded';
    end if;

    insert into public.ranking_submit_audit (ip_hash)
    values (v_ip_hash);

    insert into public.rankings (name, score)
    values (v_name, v_score);
end;
$$;

revoke all on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;
