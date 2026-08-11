alter table public.vos_order_candidates
  add column if not exists sequence_order integer;

alter table public.vos_order_candidates
  add constraint vos_order_sequence_positive_check
  check (sequence_order is null or sequence_order > 0);

alter table public.vos_order_candidates
  add constraint vos_order_validated_sequence_check
  check (human_status <> 'VALIDADO' or not_now = true or sequence_order is not null);

create unique index if not exists uq_vos_order_validated_sequence
  on public.vos_order_candidates(case_id, sequence_order)
  where human_status='VALIDADO' and not_now=false and sequence_order is not null;

comment on column public.vos_order_candidates.sequence_order is
  'Sequência definida exclusivamente por validação humana no ORDENAR. O Motor não calcula ranking ou prioridade automaticamente.';
