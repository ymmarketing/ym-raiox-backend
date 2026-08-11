alter table public.crm_contacts
  add column if not exists external_key text,
  add column if not exists city_state text,
  add column if not exists segment text,
  add column if not exists decision_maker text,
  add column if not exists website_url text,
  add column if not exists linkedin_url text,
  add column if not exists instagram_url text,
  add column if not exists lead_class text,
  add column if not exists lead_score numeric,
  add column if not exists lead_confidence text,
  add column if not exists foundation_year text,
  add column if not exists recommended_channel text,
  add column if not exists approach_angle text,
  add column if not exists public_signal text,
  add column if not exists opportunity_to_validate text,
  add column if not exists offer_summary text,
  add column if not exists research_source text,
  add column if not exists duplicate_audit text,
  add column if not exists source_dataset text,
  add column if not exists source_row_ref text,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create unique index if not exists uq_crm_contacts_external_key
  on public.crm_contacts(external_key)
  where external_key is not null;

alter table public.crm_opportunities
  add column if not exists initial_reading_status text,
  add column if not exists initial_reading_url text,
  add column if not exists initial_reading_date date,
  add column if not exists contact_status text,
  add column if not exists contact_date date,
  add column if not exists contact_result text,
  add column if not exists import_rank integer,
  add column if not exists trigger_moment text;

revoke all on function public.crm_create_manual_lead(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.crm_create_manual_lead(text,text,text,text,text,text) to service_role;
grant execute on function public.crm_link_vos_case(uuid,text) to service_role;
grant execute on function public.crm_move_stage(uuid,text,text,text) to service_role;
grant execute on function public.crm_set_next_action(uuid,text,timestamptz,text) to service_role;
grant execute on function public.crm_set_route(uuid,text,text,text) to service_role;
grant execute on function public.crm_upsert_from_intake(uuid,text) to service_role;

create or replace function public.crm_bulk_upsert_leads(p_rows jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_contact uuid;
  v_opp uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_key text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array JSON';
  end if;
  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_key := nullif(r->>'external_key','');
    if v_key is null then raise exception 'external_key obrigatório'; end if;

    select id into v_contact from public.crm_contacts where external_key=v_key limit 1;
    if v_contact is null then
      insert into public.crm_contacts(
        external_key,name,business_name,email,phone,source,city_state,segment,decision_maker,
        website_url,linkedin_url,instagram_url,lead_class,lead_score,lead_confidence,foundation_year,
        recommended_channel,approach_angle,public_signal,opportunity_to_validate,offer_summary,
        research_source,duplicate_audit,source_dataset,source_row_ref,source_payload,created_by,updated_by
      ) values (
        v_key,nullif(r->>'decision_maker',''),nullif(r->>'business_name',''),nullif(r->>'email',''),nullif(r->>'phone',''),'PROSPECCAO_PLANILHA',
        nullif(r->>'city_state',''),nullif(r->>'segment',''),nullif(r->>'decision_maker',''),
        nullif(r->>'website_url',''),nullif(r->>'linkedin_url',''),nullif(r->>'instagram_url',''),
        nullif(r->>'lead_class',''),nullif(r->>'lead_score','')::numeric,nullif(r->>'lead_confidence',''),nullif(r->>'foundation_year',''),
        nullif(r->>'recommended_channel',''),nullif(r->>'approach_angle',''),nullif(r->>'public_signal',''),nullif(r->>'opportunity_to_validate',''),
        nullif(r->>'offer_summary',''),nullif(r->>'research_source',''),nullif(r->>'duplicate_audit',''),nullif(r->>'dataset',''),nullif(r->>'source_row',''),r,p_actor,p_actor
      ) returning id into v_contact;
      v_inserted := v_inserted + 1;
    else
      update public.crm_contacts set
        business_name=coalesce(nullif(r->>'business_name',''),business_name),
        name=coalesce(nullif(r->>'decision_maker',''),name), phone=coalesce(nullif(r->>'phone',''),phone),
        city_state=coalesce(nullif(r->>'city_state',''),city_state), segment=coalesce(nullif(r->>'segment',''),segment),
        decision_maker=coalesce(nullif(r->>'decision_maker',''),decision_maker), website_url=coalesce(nullif(r->>'website_url',''),website_url),
        linkedin_url=coalesce(nullif(r->>'linkedin_url',''),linkedin_url), instagram_url=coalesce(nullif(r->>'instagram_url',''),instagram_url),
        lead_class=coalesce(nullif(r->>'lead_class',''),lead_class), lead_score=coalesce(nullif(r->>'lead_score','')::numeric,lead_score),
        lead_confidence=coalesce(nullif(r->>'lead_confidence',''),lead_confidence), foundation_year=coalesce(nullif(r->>'foundation_year',''),foundation_year),
        recommended_channel=coalesce(nullif(r->>'recommended_channel',''),recommended_channel), approach_angle=coalesce(nullif(r->>'approach_angle',''),approach_angle),
        public_signal=coalesce(nullif(r->>'public_signal',''),public_signal), opportunity_to_validate=coalesce(nullif(r->>'opportunity_to_validate',''),opportunity_to_validate),
        offer_summary=coalesce(nullif(r->>'offer_summary',''),offer_summary), research_source=coalesce(nullif(r->>'research_source',''),research_source),
        duplicate_audit=coalesce(nullif(r->>'duplicate_audit',''),duplicate_audit), source_dataset=coalesce(nullif(r->>'dataset',''),source_dataset),
        source_row_ref=coalesce(nullif(r->>'source_row',''),source_row_ref),source_payload=r,updated_by=p_actor,updated_at=now()
      where id=v_contact;
      v_updated := v_updated + 1;
    end if;

    select id into v_opp from public.crm_opportunities where contact_id=v_contact order by created_at limit 1;
    if v_opp is null then
      insert into public.crm_opportunities(
        contact_id,current_stage,stage_entered_at,next_action,next_action_due_at,owner_email,notes,
        initial_reading_status,initial_reading_url,initial_reading_date,contact_status,contact_date,contact_result,
        import_rank,trigger_moment,created_by,updated_by
      ) values (
        v_contact,'LEAD_MAPEADO',now(),coalesce(nullif(r->>'next_action',''),'Produzir Leitura Inicial'),nullif(r->>'next_action_date','')::timestamptz,null,null,
        coalesce(nullif(r->>'initial_reading_status',''),'Não iniciada'),nullif(r->>'initial_reading_url',''),nullif(r->>'initial_reading_date','')::date,
        nullif(r->>'contact_status',''),nullif(r->>'contact_date','')::date,nullif(r->>'contact_result',''),nullif(r->>'ranking','')::integer,nullif(r->>'trigger_moment',''),p_actor,p_actor
      ) returning id into v_opp;
    else
      update public.crm_opportunities set
        next_action=case when current_stage='LEAD_MAPEADO' then coalesce(nullif(r->>'next_action',''),next_action) else next_action end,
        initial_reading_status=coalesce(nullif(r->>'initial_reading_status',''),initial_reading_status),
        initial_reading_url=coalesce(nullif(r->>'initial_reading_url',''),initial_reading_url),
        initial_reading_date=coalesce(nullif(r->>'initial_reading_date','')::date,initial_reading_date),
        contact_status=coalesce(nullif(r->>'contact_status',''),contact_status), contact_date=coalesce(nullif(r->>'contact_date','')::date,contact_date),
        contact_result=coalesce(nullif(r->>'contact_result',''),contact_result), import_rank=coalesce(nullif(r->>'ranking','')::integer,import_rank),
        trigger_moment=coalesce(nullif(r->>'trigger_moment',''),trigger_moment),updated_by=p_actor,updated_at=now()
      where id=v_opp;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'rows',jsonb_array_length(p_rows),'inserted_contacts',v_inserted,'updated_contacts',v_updated);
end;
$$;

revoke all on function public.crm_bulk_upsert_leads(jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_bulk_upsert_leads(jsonb,text) to service_role,postgres;
