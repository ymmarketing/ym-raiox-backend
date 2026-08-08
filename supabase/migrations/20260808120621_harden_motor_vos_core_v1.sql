alter function public.vos_touch_updated_at() set search_path = public;
alter function public.vos_protect_case_source() set search_path = public;
alter function public.vos_enforce_hypothesis_validation() set search_path = public;
alter function public.vos_require_ver_gate_for_order() set search_path = public;
alter function public.vos_response_value(jsonb,text) set search_path = public;

create index if not exists idx_vos_conclusions_case on public.vos_conclusions(case_id);
create index if not exists idx_vos_entry_evidence_evidence on public.vos_entry_evidence(evidence_id);
create index if not exists idx_vos_hypothesis_tests_hypothesis on public.vos_hypothesis_tests(hypothesis_id);
create index if not exists idx_vos_test_evidence_evidence on public.vos_test_evidence(evidence_id);
create index if not exists idx_vos_validations_case on public.vos_validations(case_id);

comment on table public.vos_cases is 'Motor Web VOS v1. RLS sem policies por desenho nesta fase: acesso direto de anon/authenticated permanece bloqueado; operações passam por serviço autorizado.';
