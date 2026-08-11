create extension if not exists pgcrypto;

create or replace function public.vos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.vos_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  case_version text not null default 'VOS_CASE_1.0' check (case_version = 'VOS_CASE_1.0'),
  status text not null default 'VER_EM_CONSTRUCAO' check (status in ('VER_EM_CONSTRUCAO','VER_AGUARDANDO_VALIDACAO','VER_VALIDADO','ORDENAR_PREPARADO','ENCERRADO')),
  source_intake_id uuid not null unique references public.raiox_intakes(id) on delete restrict,
  source_packet_version text not null check (source_packet_version = 'VOS_INTAKE_1.0'),
  source_packet jsonb not null,
  client_ref text,
  client_name text,
  business_name text,
  destination_short_term text,
  destination_success_signal text,
  created_by text not null default 'SYSTEM_IMPORT',
  updated_by text,
  notes text
);
comment on table public.vos_cases is 'Caso de trabalho do Motor Web VOS. O source_packet é snapshot imutável do VOS_INTAKE_1.0.';

create trigger trg_vos_cases_touch before update on public.vos_cases
for each row execute function public.vos_touch_updated_at();

create or replace function public.vos_protect_case_source()
returns trigger language plpgsql as $$
begin
  if new.source_intake_id is distinct from old.source_intake_id
     or new.source_packet_version is distinct from old.source_packet_version
     or new.source_packet is distinct from old.source_packet then
    raise exception 'Fonte VOS Intake do caso é imutável';
  end if;
  return new;
end;
$$;
create trigger trg_vos_cases_source_immutable before update on public.vos_cases
for each row execute function public.vos_protect_case_source();

create table public.vos_p8_coverage (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  p8_code text not null check (p8_code in ('PRODUTO','PRECO','PRACA','PROMOCAO','PESSOAS','PROCESSOS','EVIDENCIAS_FISICAS','PRODUTIVIDADE_QUALIDADE')),
  p8_label text not null,
  source_rx_score numeric,
  source_rx_coverage jsonb,
  source_rx_classification text,
  observation text,
  evidence_summary text,
  classification text check (classification is null or classification in ('ATIVO','DISFUNCAO','LACUNA','INCONCLUSIVO')),
  confidence text check (confidence is null or confidence in ('ALTA','MEDIA','BAIXA','SEM_BASE')),
  remaining_validation text,
  human_status text not null default 'PENDENTE' check (human_status in ('PENDENTE','VALIDADO','REJEITADO')),
  validated_by text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id,p8_code),
  check ((human_status <> 'VALIDADO') or (validated_by is not null and validated_at is not null))
);
comment on table public.vos_p8_coverage is 'Cobertura obrigatória dos 8Ps no VER. Dados do Raio-X são fonte, não aprovação automática.';
create trigger trg_vos_p8_touch before update on public.vos_p8_coverage
for each row execute function public.vos_touch_updated_at();

create table public.vos_rx_import_signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  signal_type text not null check (signal_type in ('PATRIMONIO','PONTO_ATENCAO','PARCIAL','LACUNA','DICA')),
  p8_label text,
  source_item jsonb not null,
  imported_at timestamptz not null default now(),
  promoted_to_ver boolean not null default false,
  promoted_entry_id uuid
);
comment on table public.vos_rx_import_signals is 'Sinais importados do Raio-X preservados sem promoção automática a causa, disfunção ou prioridade.';

create table public.vos_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('CLIENT_SELF_REPORT','PUBLIC_OBSERVATION','DOCUMENT','MEASUREMENT','CRM','SYSTEM')),
  title text not null,
  content text,
  source_ref text not null,
  source_url text,
  observed_at timestamptz,
  p8_code text check (p8_code is null or p8_code in ('PRODUTO','PRECO','PRACA','PROMOCAO','PESSOAS','PROCESSOS','EVIDENCIAS_FISICAS','PRODUTIVIDADE_QUALIDADE')),
  reliability text check (reliability is null or reliability in ('ALTA','MEDIA','BAIXA','SEM_BASE')),
  created_by text not null,
  created_at timestamptz not null default now()
);
comment on table public.vos_evidence is 'Evidências com origem explícita. Toda conclusão deve poder apontar para uma ou mais evidências.';

create table public.vos_ver_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  ver_field text not null check (ver_field in ('PEDIDO_INICIAL','RESULTADO_ESPERADO','FORMULACAO_PROBLEMA','SINTOMA','EVIDENCIA','CONTEXTO','PATRIMONIO_IDENTIFICADO','FATOR_CONTRIBUINTE','HIPOTESE_CAUSAL','CAUSA','RISCO','RESTRICAO','PONTO_CONTROLE','INCERTEZA','VALIDACAO_ESPECIALIZADA')),
  title text not null,
  content text not null,
  p8_code text check (p8_code is null or p8_code in ('PRODUTO','PRECO','PRACA','PROMOCAO','PESSOAS','PROCESSOS','EVIDENCIAS_FISICAS','PRODUTIVIDADE_QUALIDADE')),
  classification text check (classification is null or classification in ('ATIVO','DISFUNCAO','LACUNA','INCONCLUSIVO')),
  confidence text check (confidence is null or confidence in ('ALTA','MEDIA','BAIXA','SEM_BASE')),
  source_type text not null check (source_type in ('CLIENT_SELF_REPORT','PUBLIC_OBSERVATION','DOCUMENT','MEASUREMENT','CRM','SYSTEM','HUMAN_ANALYSIS','AI_SUGGESTION')),
  source_ref text not null,
  is_ai_suggested boolean not null default false,
  human_status text not null default 'PENDENTE' check (human_status in ('PENDENTE','VALIDADO','REJEITADO','NAO_REQUERIDA')),
  validated_by text,
  validated_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((human_status <> 'VALIDADO') or (validated_by is not null and validated_at is not null)),
  check (not (is_ai_suggested = true and source_type <> 'AI_SUGGESTION'))
);
comment on table public.vos_ver_entries is 'Mapa VER de 15 campos. IA pode sugerir, mas não validar entradas.';
create trigger trg_vos_ver_entries_touch before update on public.vos_ver_entries
for each row execute function public.vos_touch_updated_at();

create table public.vos_entry_evidence (
  entry_id uuid not null references public.vos_ver_entries(id) on delete cascade,
  evidence_id uuid not null references public.vos_evidence(id) on delete cascade,
  relation text not null default 'SUPORTA' check (relation in ('SUPORTA','CONTRADIZ','ORIGEM','CONTEXTO')),
  primary key(entry_id,evidence_id,relation)
);

create table public.vos_hypotheses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  statement text not null,
  p8_code text check (p8_code is null or p8_code in ('PRODUTO','PRECO','PRACA','PROMOCAO','PESSOAS','PROCESSOS','EVIDENCIAS_FISICAS','PRODUTIVIDADE_QUALIDADE')),
  origin text not null check (origin in ('HUMAN','AI')),
  status text not null default 'SUGERIDA' check (status in ('SUGERIDA','EM_TESTE','VALIDADA','REJEITADA','INCONCLUSIVA')),
  confidence text check (confidence is null or confidence in ('ALTA','MEDIA','BAIXA','SEM_BASE')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_by text,
  validated_at timestamptz,
  check ((status <> 'VALIDADA') or (validated_by is not null and validated_at is not null))
);
comment on table public.vos_hypotheses is 'Hipóteses causais. AI pode sugerir; validação final é humana e exige teste registrado.';
create trigger trg_vos_hyp_touch before update on public.vos_hypotheses
for each row execute function public.vos_touch_updated_at();

create table public.vos_hypothesis_tests (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.vos_hypotheses(id) on delete cascade,
  test_description text not null,
  method text,
  expected_evidence text,
  result_summary text,
  result_classification text check (result_classification is null or result_classification in ('SUPORTA','CONTRADIZ','INCONCLUSIVO')),
  tested_by text,
  tested_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.vos_test_evidence (
  test_id uuid not null references public.vos_hypothesis_tests(id) on delete cascade,
  evidence_id uuid not null references public.vos_evidence(id) on delete cascade,
  primary key(test_id,evidence_id)
);

create or replace function public.vos_enforce_hypothesis_validation()
returns trigger language plpgsql as $$
begin
  if new.status = 'VALIDADA' and old.status is distinct from 'VALIDADA' then
    if new.validated_by is null or new.validated_at is null then
      raise exception 'Hipótese só pode ser validada por pessoa identificada';
    end if;
    if not exists (
      select 1 from public.vos_hypothesis_tests t
      where t.hypothesis_id = new.id and t.result_classification is not null
    ) then
      raise exception 'Hipótese não pode virar validada sem teste registrado';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_vos_hyp_validate before update on public.vos_hypotheses
for each row execute function public.vos_enforce_hypothesis_validation();

create table public.vos_conclusions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  conclusion_type text not null check (conclusion_type in ('CAUSA_PROVAVEL','CAUSA_VALIDADA','OUTRA')),
  statement text not null,
  confidence text not null check (confidence in ('ALTA','MEDIA','BAIXA','SEM_BASE')),
  uncertainty text,
  impact_on_destination text,
  human_validated_by text not null,
  human_validated_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.vos_conclusions is 'Conclusões do VER. Não existe caminho de criação sem validador humano identificado.';

create table public.vos_validations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  target_type text not null check (target_type in ('CASE','P8','VER_ENTRY','HYPOTHESIS','CONCLUSION','GATE','ORDER_CANDIDATE')),
  target_id uuid,
  decision text not null check (decision in ('VALIDAR','REJEITAR','PEDIR_EVIDENCIA','MANTER_INCONCLUSIVO')),
  rationale text not null,
  validated_by text not null,
  validated_at timestamptz not null default now()
);
comment on table public.vos_validations is 'Trilha auditável de decisões humanas.';

create table public.vos_gates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  gate_code text not null check (gate_code in ('VER_GATE')),
  status text not null default 'PENDENTE' check (status in ('PENDENTE','APROVADO','REPROVADO')),
  justification text,
  remaining_conditions text,
  validated_by text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id,gate_code),
  check ((status <> 'APROVADO') or (validated_by is not null and validated_at is not null and justification is not null))
);
comment on table public.vos_gates is 'Gate metodológico explícito. Banco não aprova gate automaticamente.';
create trigger trg_vos_gates_touch before update on public.vos_gates
for each row execute function public.vos_touch_updated_at();

create table public.vos_order_candidates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.vos_cases(id) on delete cascade,
  action text not null,
  rationale text not null,
  impact_on_destination text,
  dependency text,
  execution_capacity text,
  risk_of_delay text,
  digital_front text,
  success_criterion text,
  not_now boolean not null default false,
  human_status text not null default 'PENDENTE' check (human_status in ('PENDENTE','VALIDADO','REJEITADO')),
  validated_by text,
  validated_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((human_status <> 'VALIDADO') or (validated_by is not null and validated_at is not null))
);
comment on table public.vos_order_candidates is 'Saída estruturada para ORDENAR. Não contém ranking automático; decisões permanecem humanas.';
create trigger trg_vos_order_touch before update on public.vos_order_candidates
for each row execute function public.vos_touch_updated_at();

create or replace function public.vos_require_ver_gate_for_order()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.vos_gates g
    where g.case_id = new.case_id and g.gate_code = 'VER_GATE' and g.status = 'APROVADO'
  ) then
    raise exception 'ORDENAR só pode receber candidatos após VER_GATE aprovado por validação humana';
  end if;
  return new;
end;
$$;
create trigger trg_vos_order_requires_gate before insert on public.vos_order_candidates
for each row execute function public.vos_require_ver_gate_for_order();

create or replace function public.vos_response_value(p_packet jsonb, p_question_id text)
returns text language sql immutable as $$
  select nullif(r->>'value','')
  from jsonb_array_elements(coalesce(p_packet->'responses','[]'::jsonb)) r
  where r->>'question_id' = p_question_id
  limit 1
$$;

create or replace function public.vos_create_case_from_intake(p_intake_id uuid, p_created_by text default 'SYSTEM_IMPORT')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake public.raiox_intakes%rowtype;
  v_case_id uuid;
  v_p jsonb;
  v_signal jsonb;
  v_value text;
begin
  select * into v_intake from public.raiox_intakes where id = p_intake_id;
  if not found then raise exception 'Raio-X intake não encontrado'; end if;
  if v_intake.packet_version <> 'VOS_INTAKE_1.0' then raise exception 'Packet incompatível'; end if;

  select id into v_case_id from public.vos_cases where source_intake_id = p_intake_id;
  if v_case_id is not null then return v_case_id; end if;

  insert into public.vos_cases(
    source_intake_id, source_packet_version, source_packet, client_ref,
    client_name, business_name, destination_short_term, destination_success_signal, created_by
  ) values (
    v_intake.id, v_intake.packet_version, v_intake.packet, v_intake.client_ref,
    public.vos_response_value(v_intake.packet,'RX01'),
    public.vos_response_value(v_intake.packet,'RX02'),
    v_intake.packet#>>'{destination,short_term}',
    v_intake.packet#>>'{destination,success_signal}',
    coalesce(nullif(p_created_by,''),'SYSTEM_IMPORT')
  ) returning id into v_case_id;

  for v_p in select * from jsonb_array_elements(coalesce(v_intake.packet->'p8_coverage','[]'::jsonb)) loop
    insert into public.vos_p8_coverage(case_id,p8_code,p8_label,source_rx_score,source_rx_coverage,source_rx_classification,classification,confidence,remaining_validation)
    values (
      v_case_id,
      case v_p->>'p8'
        when 'Produto' then 'PRODUTO' when 'Preço' then 'PRECO' when 'Praça' then 'PRACA'
        when 'Promoção' then 'PROMOCAO' when 'Pessoas' then 'PESSOAS' when 'Processos' then 'PROCESSOS'
        when 'Evidências físicas' then 'EVIDENCIAS_FISICAS' when 'Produtividade e Qualidade' then 'PRODUTIVIDADE_QUALIDADE'
      end,
      v_p->>'p8',
      nullif(v_p->>'score','')::numeric,
      v_p->'coverage',
      v_p->>'classification',
      'INCONCLUSIVO',
      'BAIXA',
      'Revisar evidências e observações no VER antes de validar a leitura deste P.'
    ) on conflict (case_id,p8_code) do nothing;
  end loop;

  insert into public.vos_p8_coverage(case_id,p8_code,p8_label,classification,confidence,remaining_validation)
  select v_case_id, x.code, x.label, 'INCONCLUSIVO', 'SEM_BASE', 'Cobertura não veio no packet; investigar no VER.'
  from (values
    ('PRODUTO','Produto'),('PRECO','Preço'),('PRACA','Praça'),('PROMOCAO','Promoção'),
    ('PESSOAS','Pessoas'),('PROCESSOS','Processos'),('EVIDENCIAS_FISICAS','Evidências físicas'),
    ('PRODUTIVIDADE_QUALIDADE','Produtividade e Qualidade')
  ) x(code,label)
  on conflict (case_id,p8_code) do nothing;

  for v_signal in select * from jsonb_array_elements(coalesce(v_intake.packet->'patrimony','[]'::jsonb)) loop
    insert into public.vos_rx_import_signals(case_id,signal_type,p8_label,source_item)
    values(v_case_id,'PATRIMONIO',v_signal->>'p8',v_signal);
  end loop;
  for v_signal in select * from jsonb_array_elements(coalesce(v_intake.packet->'attention_points','[]'::jsonb)) loop
    insert into public.vos_rx_import_signals(case_id,signal_type,p8_label,source_item)
    values(v_case_id,case when v_signal->>'kind'='PARCIAL' then 'PARCIAL' else 'PONTO_ATENCAO' end,v_signal->>'p8',v_signal);
  end loop;
  for v_signal in select * from jsonb_array_elements(coalesce(v_intake.packet->'gaps','[]'::jsonb)) loop
    insert into public.vos_rx_import_signals(case_id,signal_type,p8_label,source_item)
    values(v_case_id,'LACUNA',null,v_signal);
  end loop;
  for v_signal in select * from jsonb_array_elements(coalesce(v_intake.packet->'tips','[]'::jsonb)) loop
    insert into public.vos_rx_import_signals(case_id,signal_type,p8_label,source_item)
    values(v_case_id,'DICA',null,jsonb_build_object('text',v_signal));
  end loop;

  v_value := public.vos_response_value(v_intake.packet,'RX27');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'PEDIDO_INICIAL','Dificuldade declarada pelo cliente',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX27','NAO_REQUERIDA',p_created_by); end if;
  v_value := public.vos_response_value(v_intake.packet,'RX29');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'RESULTADO_ESPERADO','Resultado desejado em 90 dias',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX29','NAO_REQUERIDA',p_created_by); end if;
  v_value := public.vos_response_value(v_intake.packet,'RX30');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'PONTO_CONTROLE','Sinal de melhora declarado',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX30','NAO_REQUERIDA',p_created_by); end if;
  v_value := public.vos_response_value(v_intake.packet,'RX26');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'PATRIMONIO_IDENTIFICADO','Ponto forte declarado',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX26','PENDENTE',p_created_by); end if;
  v_value := public.vos_response_value(v_intake.packet,'RX28');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'CONTEXTO','Tentativas anteriores e resultado',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX28','NAO_REQUERIDA',p_created_by); end if;
  v_value := public.vos_response_value(v_intake.packet,'RX25');
  if v_value is not null then insert into public.vos_ver_entries(case_id,ver_field,title,content,source_type,source_ref,human_status,created_by)
    values(v_case_id,'CONTEXTO','Capacidade e uso atuais declarados',v_value,'CLIENT_SELF_REPORT','VOS_INTAKE_1.0/RX25','NAO_REQUERIDA',p_created_by); end if;

  insert into public.vos_gates(case_id,gate_code,status,remaining_conditions)
  values(v_case_id,'VER_GATE','PENDENTE','Exige validação humana após investigação do VER.');

  return v_case_id;
end;
$$;

create index idx_vos_cases_status on public.vos_cases(status);
create index idx_vos_p8_case on public.vos_p8_coverage(case_id);
create index idx_vos_signals_case on public.vos_rx_import_signals(case_id,signal_type);
create index idx_vos_evidence_case on public.vos_evidence(case_id);
create index idx_vos_ver_case on public.vos_ver_entries(case_id,ver_field);
create index idx_vos_hyp_case on public.vos_hypotheses(case_id,status);
create index idx_vos_gate_case on public.vos_gates(case_id,status);
create index idx_vos_order_case on public.vos_order_candidates(case_id);

alter table public.vos_cases enable row level security;
alter table public.vos_p8_coverage enable row level security;
alter table public.vos_rx_import_signals enable row level security;
alter table public.vos_evidence enable row level security;
alter table public.vos_ver_entries enable row level security;
alter table public.vos_entry_evidence enable row level security;
alter table public.vos_hypotheses enable row level security;
alter table public.vos_hypothesis_tests enable row level security;
alter table public.vos_test_evidence enable row level security;
alter table public.vos_conclusions enable row level security;
alter table public.vos_validations enable row level security;
alter table public.vos_gates enable row level security;
alter table public.vos_order_candidates enable row level security;

revoke all on public.vos_cases, public.vos_p8_coverage, public.vos_rx_import_signals, public.vos_evidence,
  public.vos_ver_entries, public.vos_entry_evidence, public.vos_hypotheses, public.vos_hypothesis_tests,
  public.vos_test_evidence, public.vos_conclusions, public.vos_validations, public.vos_gates, public.vos_order_candidates
from anon, authenticated;

revoke execute on function public.vos_create_case_from_intake(uuid,text) from public, anon, authenticated;
revoke execute on function public.vos_response_value(jsonb,text) from public, anon, authenticated;
