-- Run only after the YM 2.0 triage migration, on a development database.
begin;
do $$
declare
  v_email text := 'ym20-test-' || replace(gen_random_uuid()::text,'-','') || '@example.test';
  v_answers jsonb := '{"revenue":2,"products":0,"units":0,"sales":0,"channels_selected":["indicacao"],"journey":0,"systems":0,"volume":0,"operations":0}';
  v_a jsonb; v_b jsonb; v_contact uuid; v_opp uuid;
begin
  v_a := public.ym_submit_triage('Teste YM','Empresa teste',v_email,'31999999999',v_answers,'{"utm_source":"homologacao"}',repeat('a',64));
  v_b := public.ym_submit_triage('Teste YM','Empresa teste',v_email,'31999999999',v_answers,'{"utm_source":"homologacao"}',repeat('a',64));
  if v_a->>'route' <> 'DIGITAL' or (v_a->>'score')::numeric <> 7.5 then raise exception 'score or route mismatch'; end if;
  if (v_a->>'known_contact')::boolean or not (v_b->>'known_contact')::boolean then raise exception 'returning flag mismatch'; end if;
  if v_a->>'id' = v_b->>'id' then raise exception 'repeat evaluation overwrote history'; end if;
  select contact_id,opportunity_id into v_contact,v_opp from public.ym_triages where id=(v_a->>'id')::uuid;
  if v_contact is null or v_opp is null then raise exception 'triage not linked'; end if;
  if (select answers->>'channels' from public.ym_triages where id=(v_a->>'id')::uuid) <> '0' then raise exception 'channels not counted'; end if;
  if (select phone from public.crm_contacts where id=v_contact) <> '31999999999' then raise exception 'phone not saved'; end if;
  begin
    perform public.ym_submit_triage('Teste YM','Empresa teste',v_email,'',v_answers,'{}',repeat('b',64));
    raise exception 'blank phone accepted';
  exception when others then
    if sqlerrm = 'blank phone accepted' then raise; end if;
  end;
  if (select count(*) from public.crm_contacts where lower(email)=v_email) <> 1 then raise exception 'contact duplicated'; end if;
  if (select count(distinct opportunity_id) from public.ym_triages where id in ((v_a->>'id')::uuid,(v_b->>'id')::uuid)) <> 1 then raise exception 'opportunity duplicated'; end if;
  if exists (select 1 from public.crm_clients where contact_id=v_contact) then raise exception 'lead was promoted to operational client'; end if;
end $$;
do $$
declare
  v_email text := 'ym20-duplicate-' || replace(gen_random_uuid()::text,'-','') || '@example.test';
  v_answers jsonb := '{"revenue":2,"products":0,"units":0,"sales":0,"channels_selected":["indicacao"],"journey":0,"systems":0,"volume":0,"operations":0}';
  v_original uuid; v_other uuid; v_a jsonb; v_b jsonb; v_c jsonb; v_i integer;
begin
  insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
  values ('Teste A','Empresa teste',v_email,'31999999999','TRIAGEM_YM20','TRIAGEM_YM20') returning id into v_original;
  insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
  values ('Teste B','Outra empresa',v_email,'31999999999','TRIAGEM_YM20','TRIAGEM_YM20') returning id into v_other;
  insert into public.crm_contacts(name,business_name,email,phone,source,owner_email)
  values ('Teste D','Empresa teste',v_email,'31999999999','TRIAGEM_YM20','TRIAGEM_YM20');
  v_a := public.ym_submit_triage('Teste A','Empresa teste',v_email,'31999999999',v_answers,'{}',repeat('c',64));
  if (select contact_id from public.ym_triages where id=(v_a->>'id')::uuid) is distinct from v_original then
    raise exception 'evaluation attached to wrong business';
  end if;
  if not (v_a->>'known_contact')::boolean then raise exception 'known duplicate not recognized'; end if;
  for v_i in 1..22 loop
    perform public.ym_submit_triage('Teste A','Empresa teste',v_email,'31999999999',v_answers,'{}',repeat('c',64));
  end loop;
  v_b := public.ym_submit_triage('Teste C','Terceira empresa',v_email,'31999999999',v_answers,'{}',repeat('d',64));
  if (select contact_id from public.ym_triages where id=(v_b->>'id')::uuid) in (v_original,v_other) then
    raise exception 'new business attached to existing contact';
  end if;
  v_c := public.ym_submit_triage('Teste A','Empresa teste',v_email,'31999999999',v_answers,'{}',repeat('e',64));
  if (select contact_id from public.ym_triages where id=(v_c->>'id')::uuid) is distinct from v_original then
    raise exception 'repeat evaluation did not reuse business';
  end if;
  if (select count(*) from public.crm_contacts where lower(email)=v_email) <> 4 then
    raise exception 'unexpected contact count';
  end if;
end $$;
rollback;
