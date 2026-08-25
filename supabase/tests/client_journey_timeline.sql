begin;

select plan(8);

select has_table('public', 'client_journey_steps', 'client journey table exists');
select has_column('public', 'client_journey_steps', 'status', 'journey status exists');
select has_column('public', 'client_journey_steps', 'visible_to_client', 'client visibility exists');
select col_is_unique('public', 'client_journey_steps', array['client_id', 'step_key'], 'step keys are unique per client');
select has_function('public', 'sync_client_journey', array['uuid','text'], 'journey sync function exists');
select is(
  (select count(*)::integer from public.client_journey_steps where client_id in (select id from public.crm_clients where status = 'ATIVO')) > 0,
  true,
  'active clients have journey steps'
);
select is(
  (select count(*)::integer from public.client_journey_steps where step_type = 'MOTOR_VOS' and status = 'PULADA') > 0,
  true,
  'clients without a VOS case and with contracted services expose a skipped motor step'
);
select is(
  (select count(*)::integer from public.client_journey_steps where step_type = 'SOLUCAO') > 0,
  true,
  'contracted solutions are mapped into the journey'
);

select * from finish();
rollback;
