update public.crm_opportunities
set initial_reading_status = case
  when initial_reading_status is null or btrim(initial_reading_status) = '' then null
  when lower(initial_reading_status) in ('não iniciado','nao iniciado','não iniciada','nao iniciada') then 'NAO_INICIADA'
  when lower(initial_reading_status) in ('em produção','em producao','leitura em produção','leitura em producao') then 'EM_PRODUCAO'
  when lower(initial_reading_status) in ('pronta','leitura pronta') then 'PRONTA'
  when lower(initial_reading_status) in ('enviada','leitura enviada') then 'ENVIADA'
  when lower(initial_reading_status) in ('não se aplica','nao se aplica') then 'NAO_SE_APLICA'
  else initial_reading_status
end;

update public.crm_opportunities
set contact_status = case
  when contact_status is null or btrim(contact_status) = '' then null
  when lower(contact_status) in ('não iniciado','nao iniciado','não iniciada','nao iniciada') then 'NAO_INICIADO'
  when lower(contact_status) in ('mensagem enviada','contato enviado') then 'MENSAGEM_ENVIADA'
  when lower(contact_status) in ('respondeu','respondido') then 'RESPONDEU'
  when lower(contact_status) in ('conversa agendada','reunião agendada','reuniao agendada') then 'CONVERSA_AGENDADA'
  when lower(contact_status) in ('sem retorno','sem resposta') then 'SEM_RETORNO'
  when lower(contact_status) in ('não interessado','nao interessado') then 'NAO_INTERESSADO'
  else contact_status
end;

alter table public.crm_opportunities drop constraint if exists crm_initial_reading_status_check;
alter table public.crm_opportunities add constraint crm_initial_reading_status_check
check (initial_reading_status is null or initial_reading_status = any (array['NAO_INICIADA','EM_PRODUCAO','PRONTA','ENVIADA','NAO_SE_APLICA']));

alter table public.crm_opportunities drop constraint if exists crm_contact_status_check;
alter table public.crm_opportunities add constraint crm_contact_status_check
check (contact_status is null or contact_status = any (array['NAO_INICIADO','MENSAGEM_ENVIADA','RESPONDEU','CONVERSA_AGENDADA','SEM_RETORNO','NAO_INTERESSADO']));
