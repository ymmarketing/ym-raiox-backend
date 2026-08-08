begin;

do $$
declare
  v_intake uuid;
  v_case uuid;
  v_same uuid;
  v_hyp uuid;
  v_blocked boolean;
  v_packet jsonb := jsonb_build_object(
    'packet_version','VOS_INTAKE_1.0',
    'questionnaire_version','RX_CANONICO_1.0',
    'scoring_version','RX_SCORE_1.0',
    'report_version','RX_REPORT_1.0',
    'source_product','RAIO_X_ESTRATEGICO',
    'source_system','SELFTEST',
    'responses',jsonb_build_array(
      jsonb_build_object('question_id','RX01','field_id','META_CLIENT_NAME','value','Cliente Teste','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX02','field_id','BUSINESS_NAME','value','Negócio Teste','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX25','field_id','CAPACITY_CURRENT_USE','value','10 entregas/mês; uso atual 6','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX26','field_id','PATRIMONY_STRENGTHS','value','Atendimento próximo e clientes recorrentes','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX27','field_id','DEMAND_DECLARED_DIFFICULTY','value','Quero organizar melhor a aquisição','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX28','field_id','CONTEXT_ATTEMPTS','value','Já tentei publicar mais, sem medir o resultado','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX29','field_id','DESTINATION_90D','value','Ter um fluxo comercial mais previsível','answered',true,'source_type','client_self_report','collected_at',now()),
      jsonb_build_object('question_id','RX30','field_id','DESTINATION_SUCCESS_SIGNAL','value','Conseguir registrar origem, contatos e vendas','answered',true,'source_type','client_self_report','collected_at',now())
    ),
    'score',jsonb_build_object('overall',70,'coverage_pct',100,'status','FINAL','p8_scores','{}'::jsonb,'journey_views','{}'::jsonb),
    'p8_coverage',jsonb_build_array(
      jsonb_build_object('p8','Produto','score',75,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','ATIVO'),
      jsonb_build_object('p8','Preço','score',50,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','PARCIAL'),
      jsonb_build_object('p8','Praça','score',50,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','MISTA'),
      jsonb_build_object('p8','Promoção','score',50,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','PARCIAL'),
      jsonb_build_object('p8','Pessoas','score',75,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','ATIVO'),
      jsonb_build_object('p8','Processos','score',50,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','PARCIAL'),
      jsonb_build_object('p8','Evidências físicas','score',75,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','ATIVO'),
      jsonb_build_object('p8','Produtividade e Qualidade','score',50,'coverage',jsonb_build_object('valid',2,'total',2,'pct',100),'classification','PARCIAL')
    ),
    'patrimony',jsonb_build_array(jsonb_build_object('interpretation','ATIVO','what','Força declarada','p8',null,'origin','RX26')),
    'attention_points',jsonb_build_array(jsonb_build_object('kind','PONTO_ATENCAO','p8','Processos','origin','RX20')),
    'gaps',jsonb_build_array(jsonb_build_object('unknown','Exemplo de lacuna','missing','Dado não observado','validate','Validar com aplicadora')),
    'tips',jsonb_build_array('Dica de teste'),
    'destination',jsonb_build_object('short_term','Ter um fluxo comercial mais previsível','success_signal','Registrar origem, contatos e vendas'),
    'limitations',jsonb_build_array('Raio-X mostra ONDE aprofundar.'),
    'route_signal',null,
    'route_label','A VALIDAR',
    'human_validation_required',true,
    'provenance',jsonb_build_object('source_system','SELFTEST','packet_version','VOS_INTAKE_1.0')
  );
begin
  insert into public.raiox_intakes(
    source_system, source_session_id, client_ref, packet_version, questionnaire_version,
    scoring_version, report_version, score_overall, score_coverage_pct, score_status,
    route_signal, human_validation_required, packet
  ) values (
    'SELFTEST','ym_raiox_selftest_motor_v1','NEGOCIO_TESTE','VOS_INTAKE_1.0','RX_CANONICO_1.0',
    'RX_SCORE_1.0','RX_REPORT_1.0',70,100,'FINAL',null,true,v_packet
  ) returning id into v_intake;

  select public.vos_create_case_from_intake(v_intake,'SELFTEST') into v_case;

  if (select count(*) from public.vos_p8_coverage where case_id=v_case) <> 8 then
    raise exception 'T01 falhou: todo caso deve nascer com 8 Ps.';
  end if;

  if not exists (select 1 from public.vos_gates where case_id=v_case and gate_code='VER_GATE' and status='PENDENTE') then
    raise exception 'T02 falhou: VER_GATE deve nascer PENDENTE.';
  end if;

  select public.vos_create_case_from_intake(v_intake,'SELFTEST_REPEAT') into v_same;
  if v_same <> v_case then
    raise exception 'T03 falhou: importação não é idempotente.';
  end if;

  if not exists (select 1 from public.vos_ver_entries where case_id=v_case and ver_field='PEDIDO_INICIAL' and source_ref='VOS_INTAKE_1.0/RX27') then
    raise exception 'T04 falhou: pedido inicial não foi preservado como declaração.';
  end if;

  if not exists (select 1 from public.vos_ver_entries where case_id=v_case and ver_field='RESULTADO_ESPERADO' and source_ref='VOS_INTAKE_1.0/RX29') then
    raise exception 'T05 falhou: destino não foi preservado.';
  end if;

  if exists (select 1 from public.vos_conclusions where case_id=v_case) then
    raise exception 'T06 falhou: importação criou conclusão causal.';
  end if;

  if exists (select 1 from public.vos_hypotheses where case_id=v_case) then
    raise exception 'T07 falhou: importação criou hipótese causal automaticamente.';
  end if;

  v_blocked := false;
  begin
    update public.vos_cases set source_packet='{}'::jsonb where id=v_case;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'T08 falhou: snapshot do Intake pôde ser alterado.';
  end if;

  v_blocked := false;
  begin
    insert into public.vos_order_candidates(case_id,action,rationale,created_by)
    values(v_case,'AÇÃO TESTE','NÃO DEVE ENTRAR ANTES DO GATE','SELFTEST');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'T09 falhou: ORDENAR aceitou ação antes do VER_GATE.';
  end if;

  insert into public.vos_hypotheses(case_id,statement,origin,created_by)
  values(v_case,'HIPÓTESE DE TESTE','AI','SELFTEST') returning id into v_hyp;

  v_blocked := false;
  begin
    update public.vos_hypotheses
       set status='VALIDADA', validated_by='SELFTEST_HUMAN', validated_at=now()
     where id=v_hyp;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'T10 falhou: hipótese foi validada sem teste.';
  end if;

  insert into public.vos_hypothesis_tests(hypothesis_id,test_description,result_summary,result_classification,tested_by,tested_at)
  values(v_hyp,'Teste humano registrado','Evidência de teste sintética','SUPORTA','SELFTEST_HUMAN',now());

  update public.vos_hypotheses
     set status='VALIDADA', validated_by='SELFTEST_HUMAN', validated_at=now()
   where id=v_hyp;

  if not exists (select 1 from public.vos_hypotheses where id=v_hyp and status='VALIDADA') then
    raise exception 'T11 falhou: hipótese testada + validada por humano não avançou.';
  end if;

  if exists (select 1 from public.vos_p8_coverage where case_id=v_case and human_status='VALIDADO') then
    raise exception 'T12 falhou: P8 foi aprovado automaticamente na importação.';
  end if;

  raise notice 'MOTOR VOS CORE V1: T01–T12 PASS';
end $$;

rollback;
