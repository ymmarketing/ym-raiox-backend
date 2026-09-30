import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {calculateCdd} from '../_shared/cdd-calc.js';

const ORIGINS=new Set(['https://ymnegocios.com.br','http://localhost:3000','http://localhost:5173']);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const txt=(v:unknown,max=3000)=>typeof v==='string'?v.trim().slice(0,max):'';
const headers=(o:string|null)=>({'Access-Control-Allow-Origin':o&&ORIGINS.has(o)?o:'https://ymnegocios.com.br','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'});
const reply=(status:number,data:unknown,o:string|null)=>new Response(JSON.stringify(data),{status,headers:headers(o)});

Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(origin&&!ORIGINS.has(origin))return reply(403,{ok:false,error:'origin_not_allowed'},origin);
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'},origin);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{ok:false,error:'storage_not_configured'},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:ue}=await sb.auth.getUser(token);
  if(ue||!user?.email)return reply(401,{ok:false,error:'invalid_session'},origin);
  const email=user.email.toLowerCase();
  const {data:access,error:ae}=await sb.from('vos_internal_access').select('role,active').eq('email',email).maybeSingle();
  if(ae||!access?.active||!['ADMIN','APLICADOR'].includes(access.role))return reply(403,{ok:false,error:'forbidden'},origin);
  let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'invalid_json'},origin)}
  const action=txt(body.action,40),opportunityId=body.opportunity_id;
  if(!uuid(opportunityId))return reply(400,{ok:false,error:'opportunity_required'},origin);
  try{
    const {data:opp,error:oe}=await sb.from('crm_opportunities').select('id,contact_id,archived_at,contact:crm_contacts(id,name,business_name)').eq('id',opportunityId).maybeSingle();
    if(oe)throw oe;
    if(!opp)return reply(404,{ok:false,error:'opportunity_not_found'},origin);
    const list=()=>sb.from('ym_cdd_assessments').select('*').eq('opportunity_id',opportunityId).order('version',{ascending:false}).limit(30);
    if(action==='LIST'){
      const q=await list();if(q.error)throw q.error;
      return reply(200,{ok:true,role:access.role,opportunity:opp,assessments:q.data||[]},origin);
    }
    if(action==='SAVE'){
      if(opp.archived_at)return reply(409,{ok:false,error:'opportunity_archived'},origin);
      const month=txt(body.reference_month,10);
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return reply(400,{ok:false,error:'reference_month_required'},origin);
      const source=txt(body.source_note,3000),assumptions=txt(body.assumptions_note,3000);
      let calculated;
      try{calculated=calculateCdd(body.inputs)}catch(e){return reply(400,{ok:false,error:String((e as Error).message)},origin)}
      const previous=await sb.from('ym_cdd_assessments').select('version').eq('opportunity_id',opportunityId).order('version',{ascending:false}).limit(1).maybeSingle();
      if(previous.error)throw previous.error;
      const q=await sb.from('ym_cdd_assessments').insert({opportunity_id:opportunityId,version:(previous.data?.version||0)+1,status:'DRAFT',reference_month:month+'-01',inputs:calculated.inputs,results:calculated.results,source_note:source||null,assumptions_note:assumptions||null,created_by:email}).select().single();
      if(q.error)throw q.error;
      await sb.from('vos_access_audit').insert({email,role:access.role,event:'CDD_DRAFT_SAVED',metadata:{opportunity_id:opportunityId,assessment_id:q.data.id,version:q.data.version}});
      return reply(200,{ok:true,assessment:q.data},origin);
    }
    if(action==='VALIDATE'){
      if(opp.archived_at)return reply(409,{ok:false,error:'opportunity_archived'},origin);
      if(access.role!=='ADMIN')return reply(403,{ok:false,error:'admin_required'},origin);
      if(!uuid(body.assessment_id))return reply(400,{ok:false,error:'assessment_required'},origin);
      const reason=txt(body.validation_note,3000);
      if(reason.length<10)return reply(400,{ok:false,error:'validation_note_required'},origin);
      const row=await sb.from('ym_cdd_assessments').select('*').eq('id',body.assessment_id).eq('opportunity_id',opportunityId).maybeSingle();
      if(row.error)throw row.error;if(!row.data)return reply(404,{ok:false,error:'assessment_not_found'},origin);
      if(row.data.status==='VALIDATED')return reply(409,{ok:false,error:'already_validated'},origin);
      if(!row.data.source_note||row.data.source_note.length<10)return reply(400,{ok:false,error:'source_note_required'},origin);
      const measured=['revenue','leads','customers','ticket','marketing_spend'].some(k=>typeof row.data.inputs?.[k]==='number')||(row.data.inputs?.tasks||[]).some((t:any)=>t.monthly_hours!==null||t.monthly_cost!==null);
      if(!measured)return reply(400,{ok:false,error:'no_measured_data'},origin);
      const q=await sb.from('ym_cdd_assessments').update({status:'VALIDATED',validated_by:email,validated_at:new Date().toISOString(),assumptions_note:[row.data.assumptions_note,'VALIDAÇÃO: '+reason].filter(Boolean).join('\n')}).eq('id',row.data.id).eq('status','DRAFT').select().single();
      if(q.error)throw q.error;
      await sb.from('vos_access_audit').insert({email,role:access.role,event:'CDD_VALIDATED',metadata:{opportunity_id:opportunityId,assessment_id:q.data.id,version:q.data.version}});
      return reply(200,{ok:true,assessment:q.data},origin);
    }
    return reply(400,{ok:false,error:'unsupported_action'},origin);
  }catch(error){return reply(409,{ok:false,error:'cdd_operation_failed',detail:String((error as Error).message||error).slice(0,250)},origin)}
});
