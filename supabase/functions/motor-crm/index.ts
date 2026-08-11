import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN="https://ym-raiox-backend-git-vos-etapa5-cr-022cc5-ym-marketing-negocios.vercel.app";
const E4_ORIGIN="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const PROD_ORIGIN="https://ymnegocios.com.br";
const ALLOWED_ORIGINS=new Set([STAGING_ORIGIN,E4_ORIGIN,PROD_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
const STAGES=['LEAD_MAPEADO','LEITURA_EM_PRODUCAO','LEITURA_ENVIADA','FOLLOW_UP','CONVERSA_AGENDADA','RAIOX_OFERTADO','RAIOX_PAGO','RAIOX_ENTREGUE','ROTA_RECOMENDADA','PROPOSTA','GANHO','PERDIDO','IMPLANTACAO'];
const ROUTES=['AVULSO','FUNDACAO','NEGOCIO_DO_ZERO'];
const ACTIVITY_TYPES=['NOTA','FOLLOW_UP','CONVERSA','PROPOSTA','ENTREGA','OUTRA'];
function cors(origin:string|null){const allow=origin&&ALLOWED_ORIGINS.has(origin)?origin:STAGING_ORIGIN;return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function claims(req:Request){try{const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const p=t.split('.')[1];if(!p)return null;const n=p.replace(/-/g,'+').replace(/_/g,'/');const j=JSON.parse(atob(n+'='.repeat((4-n.length%4)%4)));const email=String(j.email||'').trim().toLowerCase(),sub=String(j.sub||'');return email&&sub?{email,sub}:null;}catch{return null;}}
function uuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function text(v:unknown,max=5000){return typeof v==='string'?v.trim().slice(0,max):'';}
function nullableDate(v:unknown){const s=text(v,40);return s||null;}
function isHttp(v:string){return /^https?:\/\//i.test(v);}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS'){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:'origin_not_allowed'},origin);
  const c=claims(req);if(!c)return reply(401,{ok:false,error:'invalid_session'},origin);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply(503,{ok:false,error:'storage_not_configured'},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:access,error:ae}=await sb.from('vos_internal_access').select('role,active').eq('email',c.email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:'access_check_failed'},origin);if(!access||access.active!==true)return reply(403,{ok:false,error:'forbidden'},origin);

  if(req.method==='GET'){
    const [{data:opps,error:oe},{data:activities,error:acte},{data:history,error:he},{data:intakes,error:ie},{data:cases,error:ce}]=await Promise.all([
      sb.from('crm_opportunities').select('id,current_stage,stage_entered_at,next_action,next_action_due_at,next_action_updated_at,recommended_route,route_rationale,route_validated_by,route_validated_at,proposal_value,source_intake_id,source_case_id,owner_email,notes,updated_at,created_at,initial_reading_status,initial_reading_url,initial_reading_date,contact_status,contact_date,contact_result,import_rank,trigger_moment,contact:crm_contacts(id,client_ref,external_key,name,business_name,email,phone,source,city_state,segment,decision_maker,website_url,linkedin_url,instagram_url,lead_class,lead_score,lead_confidence,foundation_year,recommended_channel,approach_angle,public_signal,opportunity_to_validate,offer_summary,research_source,duplicate_audit,source_dataset,source_row_ref)').order('import_rank',{ascending:true,nullsFirst:false}).order('updated_at',{ascending:false}).limit(300),
      sb.from('crm_activities').select('id,opportunity_id,activity_type,content,due_at,completed_at,created_by,created_at').order('created_at',{ascending:false}).limit(1200),
      sb.from('crm_stage_history').select('id,opportunity_id,from_stage,to_stage,reason,changed_by,changed_at').order('changed_at',{ascending:false}).limit(1600),
      sb.from('raiox_intakes').select('id,client_ref,score_overall,score_status,created_at').order('created_at',{ascending:false}).limit(200),
      sb.from('vos_cases').select('id,source_intake_id,client_ref,business_name,status,created_at').order('created_at',{ascending:false}).limit(200)
    ]);
    if(oe||acte||he||ie||ce){console.error('crm read',oe||acte||he||ie||ce);return reply(500,{ok:false,error:'crm_read_failed'},origin);}
    const summary:Record<string,number>={};for(const s of STAGES)summary[s]=0;for(const o of opps||[])summary[o.current_stage]=(summary[o.current_stage]||0)+1;
    const syncedIntakes=new Set((opps||[]).map((o:any)=>o.source_intake_id).filter(Boolean));const linkedCases=new Set((opps||[]).map((o:any)=>o.source_case_id).filter(Boolean));
    await sb.from('vos_access_audit').insert({email:c.email,role:access.role,event:'CRM_VIEW',metadata:{contract:'YM_CRM_ESSENCIAL_1.3'}});
    return reply(200,{ok:true,contract_version:'YM_CRM_ESSENCIAL_1.3',user:{email:c.email,role:access.role},stages:STAGES,routes:ROUTES,summary,opportunities:opps||[],activities:activities||[],stage_history:history||[],available_intakes:(intakes||[]).filter((x:any)=>!syncedIntakes.has(x.id)),available_cases:(cases||[]).filter((x:any)=>!linkedCases.has(x.id))},origin);
  }
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'},origin);
  if(!['ADMIN','APLICADOR'].includes(access.role))return reply(403,{ok:false,error:'write_forbidden'},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:'invalid_json'},origin);}
  const action=text(body?.action,80);let result:any=null;
  try{
    if(action==='CREATE_LEAD'){
      const business=text(body.business_name,500),name=text(body.name,500);if(!business&&!name)return reply(400,{ok:false,error:'lead_name_required'},origin);
      const {data,error}=await sb.rpc('crm_create_manual_lead',{p_name:name,p_business_name:business,p_email:text(body.email,500),p_phone:text(body.phone,120),p_source:text(body.source,300)||'MANUAL',p_actor:c.email});if(error)throw error;result={opportunity_id:data};
    } else if(action==='SYNC_INTAKE'){
      if(!uuid(body.intake_id))return reply(400,{ok:false,error:'invalid_intake_id'},origin);const {data,error}=await sb.rpc('crm_upsert_from_intake',{p_intake_id:body.intake_id,p_actor:c.email});if(error)throw error;result={opportunity_id:data};
    } else if(action==='LINK_CASE'){
      if(!uuid(body.case_id))return reply(400,{ok:false,error:'invalid_case_id'},origin);const {data,error}=await sb.rpc('crm_link_vos_case',{p_case_id:body.case_id,p_actor:c.email});if(error)throw error;result={opportunity_id:data};
    } else if(action==='MOVE_STAGE'){
      if(!uuid(body.opportunity_id)||!STAGES.includes(body.stage))return reply(400,{ok:false,error:'invalid_stage_request'},origin);const {error}=await sb.rpc('crm_move_stage',{p_opportunity_id:body.opportunity_id,p_stage:body.stage,p_reason:text(body.reason,3000),p_actor:c.email});if(error)throw error;result={opportunity_id:body.opportunity_id,stage:body.stage};
    } else if(action==='SET_ROUTE'){
      if(!uuid(body.opportunity_id)||!ROUTES.includes(body.route))return reply(400,{ok:false,error:'invalid_route_request'},origin);const rationale=text(body.rationale,4000);if(!rationale)return reply(400,{ok:false,error:'route_rationale_required'},origin);const {error}=await sb.rpc('crm_set_route',{p_opportunity_id:body.opportunity_id,p_route:body.route,p_rationale:rationale,p_actor:c.email});if(error)throw error;result={opportunity_id:body.opportunity_id,route:body.route};
    } else if(action==='SET_NEXT_ACTION'){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:'invalid_opportunity_id'},origin);const nextAction=text(body.next_action,4000);if(!nextAction)return reply(400,{ok:false,error:'next_action_required'},origin);const due=body.due_at||null;const {error}=await sb.rpc('crm_set_next_action',{p_opportunity_id:body.opportunity_id,p_next_action:nextAction,p_due_at:due,p_actor:c.email});if(error)throw error;result={opportunity_id:body.opportunity_id,next_action:nextAction,due_at:due};
    } else if(action==='ADD_ACTIVITY'){
      if(!uuid(body.opportunity_id)||!ACTIVITY_TYPES.includes(body.activity_type))return reply(400,{ok:false,error:'invalid_activity'},origin);const content=text(body.content,6000);if(!content)return reply(400,{ok:false,error:'activity_content_required'},origin);const {data,error}=await sb.from('crm_activities').insert({opportunity_id:body.opportunity_id,activity_type:body.activity_type,content,due_at:body.due_at||null,completed_at:body.completed_at||null,created_by:c.email}).select().single();if(error)throw error;result=data;
    } else if(action==='SET_INITIAL_READING'){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:'invalid_opportunity_id'},origin);const link=text(body.initial_reading_url,2000);if(link&&!isHttp(link))return reply(400,{ok:false,error:'initial_reading_url_must_be_http'},origin);
      const patch={initial_reading_status:text(body.initial_reading_status,120)||null,initial_reading_url:link||null,initial_reading_date:nullableDate(body.initial_reading_date),updated_by:c.email,updated_at:new Date().toISOString()};const {data,error}=await sb.from('crm_opportunities').update(patch).eq('id',body.opportunity_id).select().single();if(error)throw error;result=data;
    } else if(action==='SET_CONTACT_STATUS'){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:'invalid_opportunity_id'},origin);const patch={contact_status:text(body.contact_status,160)||null,contact_date:nullableDate(body.contact_date),contact_result:text(body.contact_result,1500)||null,updated_by:c.email,updated_at:new Date().toISOString()};const {data,error}=await sb.from('crm_opportunities').update(patch).eq('id',body.opportunity_id).select().single();if(error)throw error;result=data;
    } else if(action==='UPDATE_PROFILE'){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:'invalid_opportunity_id'},origin);const {data:opp,error:opErr}=await sb.from('crm_opportunities').select('contact_id').eq('id',body.opportunity_id).maybeSingle();if(opErr)throw opErr;if(!opp)return reply(404,{ok:false,error:'opportunity_not_found'},origin);
      const urlFields=['website_url','linkedin_url','instagram_url'];for(const f of urlFields){const v=text(body[f],2000);if(v&&!isHttp(v))return reply(400,{ok:false,error:`${f}_must_be_http`},origin);}
      const contactPatch:any={name:text(body.name,500)||null,business_name:text(body.business_name,500)||null,phone:text(body.phone,160)||null,city_state:text(body.city_state,300)||null,segment:text(body.segment,800)||null,decision_maker:text(body.decision_maker,500)||null,website_url:text(body.website_url,2000)||null,linkedin_url:text(body.linkedin_url,2000)||null,instagram_url:text(body.instagram_url,2000)||null,recommended_channel:text(body.recommended_channel,200)||null,approach_angle:text(body.approach_angle,3000)||null,public_signal:text(body.public_signal,5000)||null,opportunity_to_validate:text(body.opportunity_to_validate,5000)||null,updated_at:new Date().toISOString()};
      const {data,error}=await sb.from('crm_contacts').update(contactPatch).eq('id',opp.contact_id).select().single();if(error)throw error;result=data;
    } else return reply(400,{ok:false,error:'unsupported_action'},origin);
  }catch(e:any){console.error('motor-crm',action,e?.message||e);return reply(409,{ok:false,error:'crm_action_rejected',detail:String(e?.message||'operation_failed').slice(0,500)},origin);}
  await sb.from('vos_access_audit').insert({email:c.email,role:access.role,event:'CRM_ACTION',metadata:{action,result_id:result?.id||result?.opportunity_id||null}});
  return reply(200,{ok:true,action,result},origin);
});
