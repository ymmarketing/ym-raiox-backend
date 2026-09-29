-- YM 2.0: additive public triage. The legacy Raio-X and CRM stages remain intact.
create table if not exists public.ym_triage_config (
  id text primary key check (id = 'default'),
  weights jsonb not null,
  strategic_from numeric(5,2) not null check (strategic_from between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into public.ym_triage_config (id, weights, strategic_from)
values ('default', '{"revenue":15,"products":10,"units":10,"sales":10,"channels":10,"journey":15,"systems":10,"volume":10,"operations":10}', 51)
on conflict (id) do nothing;

create table if not exists public.ym_triages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete restrict,
  answers jsonb not null,
  score numeric(5,2) not null check (score between 0 and 100),
  recommended_route text not null check (recommended_route in ('DIGITAL','ESTRATEGICO')),
  route_override text check (route_override in ('DIGITAL','ESTRATEGICO')),
  route_override_by text,
  route_override_at timestamptz,
  source jsonb not null default '{}'::jsonb,
  consent_at timestamptz not null,
  scoring_version text not null default 'YM_TRIAGE_1.0',
  check ((route_override is null and route_override_by is null and route_override_at is null)
    or (route_override is not null and nullif(trim(route_override_by),'') is not null and route_override_at is not null))
);
create index if not exists ym_triages_opportunity_idx on public.ym_triages(opportunity_id, created_at desc);
create index if not exists ym_triages_contact_idx on public.ym_triages(contact_id, created_at desc);

create table if not exists public.ym_triage_rate_limits (
  request_key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);

create or replace function public.ym_submit_triage(
  p_name text, p_business_name text, p_email text, p_phone text,
  p_answers jsonb, p_source jsonb, p_request_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_weights jsonb; v_cutoff numeric; v_score numeric := 0; v_key text; v_value integer;
  v_contact uuid; v_opportunity uuid; v_triage uuid; v_count integer;
  v_email text := lower(trim(p_email)); v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_channels jsonb; v_channel_count integer; v_normalized_answers jsonb; v_route text;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if length(p_request_key) <> 64 or p_request_key !~ '^[0-9a-f]+$' then raise exception 'invalid_request_key'; end if;
  insert into public.ym_triage_rate_limits(request_key,count,expires_at)
  values (p_request_key,1,now()+interval '1 day')
  on conflict (request_key) do update set count = case
    when public.ym_triage_rate_limits.expires_at < now() then 1
    else public.ym_triage_rate_limits.count+1 end,
    expires_at = case when public.ym_triage_rate_limits.expires_at < now() then now()+interval '1 day'
      else public.ym_triage_rate_limits.expires_at end
  returning count into v_count;
  if v_count > 20 then raise exception 'rate_limit_exceeded'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_business_name),'') is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_email) > 254 or length(v_phone) not between 10 and 13 then raise exception 'invalid_contact'; end if;
  if jsonb_typeof(p_answers) <> 'object' or jsonb_typeof(p_source) <> 'object'
    or length(p_answers::text) > 6000 or length(p_source::text) > 2000 then raise exception 'invalid_payload'; end if;
  select weights,strategic_from into v_weights,v_cutoff from public.ym_triage_config where id='default';
  if not found or (select count(*) from jsonb_object_keys(v_weights)) <> 9
    or (select sum(value::numeric) from jsonb_each_text(v_weights)) <> 100 then raise exception 'invalid_triage_config'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) <> 9 then raise exception 'invalid_answers'; end if;
  v_channels := p_answers->'channels_selected';
  if jsonb_typeof(v_channels) is distinct from 'array' then raise exception 'invalid_channels'; end if;
  if jsonb_array_length(v_channels) not between 1 and 12
    or exists (select 1 from jsonb_array_elements_text(v_channels) as c(value)
      where c.value not in ('indicacao','instagram','facebook','linkedin','tiktok','site_busca','anuncios','parceiros','prospeccao_ativa','marketplaces','outro','nao_sei'))
    or (select count(distinct value) from jsonb_array_elements_text(v_channels)) <> jsonb_array_length(v_channels)
    or (v_channels ? 'nao_sei' and jsonb_array_length(v_channels) > 1) then raise exception 'invalid_channels'; end if;
  v_channel_count := case when v_channels ? 'nao_sei' then 0 else jsonb_array_length(v_channels) end;
  v_normalized_answers := p_answers || jsonb_build_object('channels',least(greatest(v_channel_count-1,0),4));
  for v_key in select jsonb_object_keys(v_weights) loop
    if v_normalized_answers->>v_key is null or v_normalized_answers->>v_key !~ '^[0-4]$' then raise exception 'invalid_answer: %',v_key; end if;
    v_value := (v_normalized_answers->>v_key)::integer;
    v_score := v_score + v_value * (v_weights->>v_key)::numeric / 4;
  end loop;
  v_score := round(v_score,2);
  v_route := case when v_score >= v_cutoff then 'ESTRATEGICO' else 'DIGITAL' end;

  -- Match a single existing canonical contact; ambiguous matches require manual review.
  if (select count(*) from public.crm_contacts where lower(trim(email))=v_email) > 1 then
    raise exception 'ambiguous_contact';
  end if;
  select id into v_contact from public.crm_contacts where lower(trim(email))=v_email limit 1 for update;
  if v_contact is null then
    insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
    values (left(trim(p_name),150),left(trim(p_business_name),200),v_email,v_phone,'TRIAGEM_YM20','TRIAGEM_YM20')
    returning id into v_contact;
  else
    update public.crm_contacts set phone=v_phone where id=v_contact and phone is distinct from v_phone;
  end if;
  -- A new triage reuses one open opportunity for this contact, but never reopens a won/lost case.
  select id into v_opportunity from public.crm_opportunities
    where contact_id=v_contact and current_stage not in ('GANHO','PERDIDO','IMPLANTACAO')
    order by updated_at desc limit 1 for update;
  if v_opportunity is null then
    insert into public.crm_opportunities(contact_id,current_stage,owner_email,updated_by,next_action,notes)
    values (v_contact,'LEAD_MAPEADO','TRIAGEM_YM20','TRIAGEM_YM20','Revisar triagem e confirmar rota','Triagem pública YM 2.0')
    returning id into v_opportunity;
    insert into public.crm_stage_history(opportunity_id,to_stage,reason,changed_by)
    values (v_opportunity,'LEAD_MAPEADO','Entrada pela triagem YM 2.0','TRIAGEM_YM20');
  end if;
  insert into public.ym_triages(contact_id,opportunity_id,answers,score,recommended_route,source,consent_at)
  values (v_contact,v_opportunity,v_normalized_answers,v_score,v_route,p_source,now()) returning id into v_triage;
  insert into public.crm_activities(opportunity_id,activity_type,content,created_by)
  values (v_opportunity,'NOTA','Triagem YM 2.0 recebida: '||v_score||'/100; rota inicial '||v_route||'; triage_id='||v_triage,'TRIAGEM_YM20');
  return jsonb_build_object('id',v_triage,'score',v_score,'route',v_route);
end $$;

alter table public.ym_triage_config enable row level security;
alter table public.ym_triages enable row level security;
alter table public.ym_triage_rate_limits enable row level security;
revoke all on public.ym_triage_config, public.ym_triages, public.ym_triage_rate_limits from public, anon, authenticated;
revoke execute on function public.ym_submit_triage(text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.ym_submit_triage(text,text,text,text,jsonb,jsonb,text) to service_role;
