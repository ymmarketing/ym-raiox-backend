create or replace function public.vos_get_case_bundle(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contract_version','VOS_CASE_BUNDLE_1.0',
    'case', to_jsonb(c),
    'p8_coverage', coalesce((
      select jsonb_agg(to_jsonb(p) order by case p.p8_code
        when 'PRODUTO' then 1 when 'PRECO' then 2 when 'PRACA' then 3 when 'PROMOCAO' then 4
        when 'PESSOAS' then 5 when 'PROCESSOS' then 6 when 'EVIDENCIAS_FISICAS' then 7 else 8 end)
      from public.vos_p8_coverage p where p.case_id=c.id
    ), '[]'::jsonb),
    'rx_import_signals', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.imported_at, s.id)
      from public.vos_rx_import_signals s where s.case_id=c.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.vos_evidence e where e.case_id=c.id
    ), '[]'::jsonb),
    'ver_entries', coalesce((
      select jsonb_agg(
        to_jsonb(v) || jsonb_build_object(
          'evidence_links', coalesce((
            select jsonb_agg(jsonb_build_object('evidence_id',ve.evidence_id,'relation',ve.relation) order by ve.evidence_id)
            from public.vos_entry_evidence ve where ve.entry_id=v.id
          ), '[]'::jsonb)
        ) order by v.created_at, v.id
      ) from public.vos_ver_entries v where v.case_id=c.id
    ), '[]'::jsonb),
    'hypotheses', coalesce((
      select jsonb_agg(
        to_jsonb(h) || jsonb_build_object(
          'tests', coalesce((
            select jsonb_agg(
              to_jsonb(t) || jsonb_build_object(
                'evidence_ids', coalesce((
                  select jsonb_agg(te.evidence_id order by te.evidence_id)
                  from public.vos_test_evidence te where te.test_id=t.id
                ), '[]'::jsonb)
              ) order by t.created_at, t.id
            ) from public.vos_hypothesis_tests t where t.hypothesis_id=h.id
          ), '[]'::jsonb)
        ) order by h.created_at, h.id
      ) from public.vos_hypotheses h where h.case_id=c.id
    ), '[]'::jsonb),
    'conclusions', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.created_at, k.id)
      from public.vos_conclusions k where k.case_id=c.id
    ), '[]'::jsonb),
    'validations', coalesce((
      select jsonb_agg(to_jsonb(vd) order by vd.validated_at, vd.id)
      from public.vos_validations vd where vd.case_id=c.id
    ), '[]'::jsonb),
    'gates', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.gate_code)
      from public.vos_gates g where g.case_id=c.id
    ), '[]'::jsonb),
    'order_candidates', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at, o.id)
      from public.vos_order_candidates o where o.case_id=c.id
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'p8_total', (select count(*) from public.vos_p8_coverage p where p.case_id=c.id),
      'p8_validated', (select count(*) from public.vos_p8_coverage p where p.case_id=c.id and p.human_status='VALIDADO'),
      'evidence', (select count(*) from public.vos_evidence e where e.case_id=c.id),
      'ver_entries', (select count(*) from public.vos_ver_entries v where v.case_id=c.id),
      'hypotheses', (select count(*) from public.vos_hypotheses h where h.case_id=c.id),
      'validated_hypotheses', (select count(*) from public.vos_hypotheses h where h.case_id=c.id and h.status='VALIDADA'),
      'conclusions', (select count(*) from public.vos_conclusions k where k.case_id=c.id),
      'order_candidates', (select count(*) from public.vos_order_candidates o where o.case_id=c.id)
    )
  )
  from public.vos_cases c
  where c.id=p_case_id;
$$;

revoke execute on function public.vos_get_case_bundle(uuid) from public, anon, authenticated;
comment on function public.vos_get_case_bundle(uuid) is 'Read model interno VOS_CASE_BUNDLE_1.0. Organiza dados sem inferir causa, prioridade, gate ou rota.';
