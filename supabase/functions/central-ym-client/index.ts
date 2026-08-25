import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD='https://ymnegocios.com.br';
const ORIGINS=new Set([PROD,'http://localhost:3000','http://localhost:5173']);
function headers(o:string|null){return {'Access-Control-Allow-Origin':o&&ORIGINS.has(o)?o:PROD,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};}
function reply(s:number,b:any,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)});}
function text(v:any,max=10000){return typeof v==='string'?v.trim().slice(0,max):'';}
function uuid(v:any){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(origin&&!ORIGINS.has(origin))return reply(403,{ok:false,error:'origin_not_allowed'},origin);
  const su=Deno.env.get('SUPABASE_URL'),sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!su||!sk)return reply(503,{ok:false,error:'storage_not_configured'},origin);
  const admin=createClient(su,sk,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:ue}=await admin.auth.getUser(token);
  if(ue||!user?.email)return reply(401,{ok:false,error:'invalid_session'},origin);
  const email=user.email.toLowerCase();

  let {data:access,error:ae}=await admin.from('client_portal_access').select('*').eq('active',true).or(`auth_user_id.eq.${user.id},email.ilike.${email}`).order('created_at',{ascending:true});
  if(ae)return reply(503,{ok:false,error:'access_check_failed'},origin);
  let accesses=access||[];
  if(!accesses.length)return reply(403,{ok:false,error:'client_access_not_found'},origin);
  for(const a of accesses){if(!a.auth_user_id&&String(a.email).toLowerCase()===email)await admin.from('client_portal_access').update({auth_user_id:user.id,last_login_at:new Date().toISOString(),updated_by:email}).eq('id',a.id);}
  accesses=accesses.filter((a:any)=>!a.auth_user_id||a.auth_user_id===user.id||String(a.email).toLowerCase()===email);
  const requested=new URL(req.url).searchParams.get('client_id');
  const chosen=(requested&&accesses.find((a:any)=>a.client_id===requested))||accesses[0];
  if(!chosen)return reply(403,{ok:false,error:'client_scope_forbidden'},origin);
  const clientId=chosen.client_id;
  await admin.from('client_portal_access').update({auth_user_id:user.id,last_login_at:new Date().toISOString(),updated_by:email}).eq('id',chosen.id);

  async function loadPortal(){
    const [cq,sq,pq,eq,dq,aq,nq,contentQ,strategyQ,performanceKpiQ,performanceMeasurementQ,performanceActionQ,contentMetricQ]=await Promise.all([
      admin.from('crm_clients').select('id,status,became_client_at,source_intake_id,source_case_id,contact:crm_contacts(id,name,business_name,email,phone,city_state,segment,website_url,linkedin_url,instagram_url)').eq('id',clientId).maybeSingle(),
      admin.from('crm_client_services').select('id,service_code,service_name,service_type,status,contracted_value,monthly_value,recurrence_months,start_date,end_date,next_billing_date,project:client_project_meta(id,display_name,portal_status,progress_pct,current_phase,summary,next_step,next_step_due_at,visible_to_client),payments:crm_payments(id,amount,status,payment_date,paid_at,due_date,payment_method,competence_month)').eq('client_id',clientId).order('created_at',{ascending:true}),
      admin.from('client_calendar_events').select('id,client_service_id,title,description,event_type,starts_at,ends_at,all_day,external_url').eq('client_id',clientId).eq('visible_to_client',true).order('starts_at',{ascending:true}),
      admin.from('client_documents').select('id,client_service_id,title,category,drive_url,version_label,competence_month,description,created_at').eq('client_id',clientId).eq('visible_to_client',true).order('created_at',{ascending:false}),
      admin.from('client_approval_items').select('id,client_service_id,title,content_type,description,status,due_at,scheduled_at,created_at,versions:client_approval_versions(id,version_number,drive_url,notes,created_at),actions:client_approval_actions(id,version_id,action,comment,actor_type,created_at)').eq('client_id',clientId).eq('visible_to_client',true).order('created_at',{ascending:false}),
      admin.from('client_notifications').select('id,notification_type,title,message,target_url,read_at,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(100),
      admin.from('client_communication_preferences').select('transactional_email,marketing_email,whatsapp_opt_in,email').eq('client_id',clientId).ilike('email',email).maybeSingle(),
      admin.from('central_ym_content_items').select('id,client_title,client_objective,client_notes,function,territory,angle,theme,primary_channel,secondary_channels,format,cta_text,script_drive_url,asset_drive_url,publish_date,publish_time,status,published_url').eq('client_id',clientId).eq('visible_to_client',true).order('publish_date',{ascending:true}).order('publish_time',{ascending:true}),
      admin.from('client_content_strategies').select('id,version,effective_date,persona_name,icp_summary,objectives,territories,channels,formats,paid_media_enabled').eq('client_id',clientId).eq('status','ACTIVE').order('effective_date',{ascending:false}).limit(1).maybeSingle(),
      admin.from('client_performance_kpis').select('id,code,name,description,category,unit,direction,periodicity,baseline_value,baseline_period_start,baseline_period_end,target_value,target_period_start,target_period_end,ideal_min_value,ideal_max_value,source_type,notes').eq('client_id',clientId).eq('active',true).eq('visible_to_client',true).order('category').order('name'),
      admin.from('client_performance_measurements').select('id,kpi_id,period_start,period_end,value,source_type,validation_status,is_baseline,notes,observed_at').eq('client_id',clientId).neq('validation_status','DESCARTADO').order('period_start'),
      admin.from('client_performance_actions').select('id,content_id,action_type,title,description,hypothesis,action_date,status,expected_lag_days,evidence_url').eq('client_id',clientId).eq('visible_to_client',true).order('action_date',{ascending:false}),
      admin.from('central_ym_content_performance').select('id,content_id,metric_code,metric_label,unit,direction,baseline_value,target_value,result_value,measurement_start,measurement_end,source_type,notes').eq('client_id',clientId).eq('visible_to_client',true).order('created_at')
    ]);
    const qs=[cq,sq,pq,eq,dq,aq,nq,contentQ,strategyQ,performanceKpiQ,performanceMeasurementQ,performanceActionQ,contentMetricQ];
    const failed=qs.find((q:any)=>q.error);
    if(failed?.error)throw failed.error;
    let raiox:any=null;
    const client:any=cq.data;
    if(client?.source_intake_id){const rq=await admin.from('raiox_intakes').select('id,created_at,score_overall,score_status,route_signal').eq('id',client.source_intake_id).maybeSingle();if(!rq.error)raiox=rq.data;}
    const options=accesses.map((a:any)=>({client_id:a.client_id,role:a.role,onboarding_completed_at:a.onboarding_completed_at}));
    const contents=(contentQ.data||[]).map((x:any)=>({
      id:x.id,
      title:x.client_title||x.theme||'Conteúdo',
      objective:x.client_objective||'',
      notes:x.client_notes||'',
      function:x.function,
      territory:x.territory,
      angle:x.angle||'',
      theme:x.theme||'',
      channel:x.primary_channel,
      secondary_channels:x.secondary_channels||[],
      format:x.format,
      cta:x.cta_text||'',
      script_url:x.script_drive_url||'',
      asset_url:x.asset_drive_url||'',
      publish_date:x.publish_date,
      publish_time:x.publish_time,
      status:x.status,
      published_url:x.published_url||''
    }));
    const performanceKpis=(performanceKpiQ.data||[]).map((k:any)=>({...k,measurements:(performanceMeasurementQ.data||[]).filter((m:any)=>m.kpi_id===k.id)}));
    const contentMetrics=contentMetricQ.data||[];
    const portalContents=contents.map((content:any)=>({...content,performance_metrics:contentMetrics.filter((metric:any)=>metric.content_id===content.id)}));
    return {user:{email},access:{id:chosen.id,client_id:clientId,role:chosen.role,onboarding_completed_at:chosen.onboarding_completed_at},client,services:sq.data||[],calendar:pq.data||[],documents:eq.data||[],approvals:dq.data||[],notifications:aq.data||[],preferences:nq.data||{email,transactional_email:true,marketing_email:false,whatsapp_opt_in:false},raiox,contents:portalContents,content_strategy:strategyQ.data||null,performance:{kpis:performanceKpis,actions:performanceActionQ.data||[]},client_options:options};
  }

  if(req.method==='GET'){
    try{return reply(200,{ok:true,portal:await loadPortal()},origin);}catch(e:any){console.error('central-ym-client get',e?.message||e);return reply(500,{ok:false,error:'portal_read_failed'},origin);}
  }
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'},origin);
  let b:any;try{b=await req.json();}catch{return reply(400,{ok:false,error:'invalid_json'},origin);}
  const action=text(b.action,80);
  try{
    if(action==='COMPLETE_ONBOARDING'){
      const at=new Date().toISOString();const q=await admin.from('client_portal_access').update({onboarding_completed_at:at,updated_by:email}).eq('id',chosen.id);if(q.error)throw q.error;return reply(200,{ok:true,onboarding_completed_at:at},origin);
    }
    if(action==='SET_PREFERENCES'){
      const row={client_id:clientId,email,transactional_email:true,marketing_email:!!b.marketing_email,whatsapp_opt_in:!!b.whatsapp_opt_in};
      const q=await admin.from('client_communication_preferences').upsert(row,{onConflict:'client_id,email'}).select().single();if(q.error)throw q.error;return reply(200,{ok:true,preferences:q.data},origin);
    }
    if(action==='MARK_NOTIFICATION_READ'&&uuid(b.notification_id)){
      const q=await admin.from('client_notifications').update({read_at:new Date().toISOString()}).eq('id',b.notification_id).eq('client_id',clientId);if(q.error)throw q.error;return reply(200,{ok:true},origin);
    }
    if(action==='APPROVAL_ACTION'&&uuid(b.approval_id)){
      const act=text(b.approval_action,40);if(!['APROVADO','AJUSTE_SOLICITADO','COMENTARIO'].includes(act))return reply(400,{ok:false,error:'invalid_approval_action'},origin);
      const comment=text(b.comment,6000);if(act==='AJUSTE_SOLICITADO'&&!comment)return reply(400,{ok:false,error:'comment_required'},origin);
      const item=await admin.from('client_approval_items').select('id,status').eq('id',b.approval_id).eq('client_id',clientId).eq('visible_to_client',true).maybeSingle();if(item.error)throw item.error;if(!item.data)return reply(404,{ok:false,error:'approval_not_found'},origin);
      const v=await admin.from('client_approval_versions').select('id,version_number').eq('approval_id',b.approval_id).order('version_number',{ascending:false}).limit(1).maybeSingle();if(v.error)throw v.error;
      const ins=await admin.from('client_approval_actions').insert({approval_id:b.approval_id,version_id:v.data?.id||null,action:act,comment:comment||null,actor_user_id:user.id,actor_email:email,actor_type:'CLIENTE'}).select().single();if(ins.error)throw ins.error;
      if(act==='APROVADO'||act==='AJUSTE_SOLICITADO'){const up=await admin.from('client_approval_items').update({status:act,updated_by:email}).eq('id',b.approval_id);if(up.error)throw up.error;}
      await admin.from('vos_access_audit').insert({email,role:'CLIENTE',event:'CENTRAL_YM_APPROVAL_ACTION',metadata:{client_id:clientId,approval_id:b.approval_id,action:act,version:v.data?.version_number||null}});
      return reply(200,{ok:true,approval_action:ins.data},origin);
    }
    return reply(400,{ok:false,error:'unsupported_action'},origin);
  }catch(e:any){console.error('central-ym-client',action,e?.message||e);return reply(409,{ok:false,error:'portal_action_failed',detail:String(e?.message||e).slice(0,500)},origin);}
});
