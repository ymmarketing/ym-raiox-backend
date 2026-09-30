import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';
const origins=new Set(['https://ymnegocios.com.br','http://localhost:3000','http://localhost:5173']);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const txt=(v:unknown,n=3000)=>typeof v==='string'?v.trim().slice(0,n):'';
const phases=['ENQUADRAMENTO','IMERSAO','ANALISE','DEVOLUTIVA'];
const headers=(o:string|null)=>({'Access-Control-Allow-Origin':o&&origins.has(o)?o:'https://ymnegocios.com.br','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'});
const reply=(status:number,data:unknown,o:string|null)=>new Response(JSON.stringify(data),{status,headers:headers(o)});

Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(origin&&!origins.has(origin))return reply(403,{ok:false,error:'origin_not_allowed'},origin);
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'},origin);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{ok:false,error:'storage_not_configured'},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:ue}=await sb.auth.getUser(token);
  if(ue||!user?.email)return reply(401,{ok:false,error:'invalid_session'},origin);
  const email=user.email.toLowerCase();
  const {data:access,error:ae}=await sb.from('vos_internal_access').select('role,active').eq('email',email).maybeSingle();
  if(ae||!access?.active||access.role!=='ADMIN')return reply(403,{ok:false,error:'admin_required'},origin);
  let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'invalid_json'},origin)}
  const opportunityId=body.opportunity_id;
  if(!uuid(opportunityId))return reply(400,{ok:false,error:'opportunity_required'},origin);
  try{
    const {data:opp,error:oe}=await sb.from('crm_opportunities').select('id,archived_at,contact:crm_contacts(business_name,name)').eq('id',opportunityId).maybeSingle();
    if(oe)throw oe;if(!opp)return reply(404,{ok:false,error:'opportunity_not_found'},origin);
    const {data:record,error:ce}=await sb.from('ym_strategic_cases').select('*').eq('opportunity_id',opportunityId).maybeSingle();
    if(ce)throw ce;
    if(body.action==='LIST'){
      const [events,cdd]=await Promise.all([
        record?sb.from('ym_strategic_events').select('*').eq('case_id',record.id).order('created_at',{ascending:false}).limit(50):Promise.resolve({data:[],error:null}),
        sb.from('ym_cdd_assessments').select('id,version,reference_month,validated_at').eq('opportunity_id',opportunityId).eq('status','VALIDATED').order('version',{ascending:false}).limit(20)
      ]);
      if(events.error||cdd.error)throw events.error||cdd.error;
      return reply(200,{ok:true,opportunity:opp,case:record,events:events.data,validated_cdd:cdd.data},origin);
    }
    if(body.action!=='ADD')return reply(400,{ok:false,error:'unsupported_action'},origin);
    if(opp.archived_at)return reply(409,{ok:false,error:'opportunity_archived'},origin);
    const phase=txt(body.phase,30),source=txt(body.source_note),note=txt(body.conversation_note),next=txt(body.next_action,1000);
    if(!phases.includes(phase)||source.length<5||note.length<10||next.length<5)
      return reply(400,{ok:false,error:'phase_and_notes_required'},origin);
    const meeting=body.meeting_at?new Date(body.meeting_at):null;
    if(meeting&&Number.isNaN(meeting.getTime()))return reply(400,{ok:false,error:'invalid_meeting_date'},origin);
    let assessmentId=null;
    if(phase==='DEVOLUTIVA'){
      if(!uuid(body.assessment_id))return reply(400,{ok:false,error:'validated_cdd_required'},origin);
      const {data:a,error:e}=await sb.from('ym_cdd_assessments').select('id').eq('id',body.assessment_id).eq('opportunity_id',opportunityId).eq('status','VALIDATED').maybeSingle();
      if(e)throw e;if(!a)return reply(400,{ok:false,error:'validated_cdd_required'},origin);
      assessmentId=a.id;
    }
    let current=record;
    if(!current){
      const created=await sb.from('ym_strategic_cases').insert({opportunity_id:opportunityId,phase,created_by:email}).select().single();
      if(created.error)throw created.error;current=created.data;
    }
    const event=await sb.from('ym_strategic_events').insert({case_id:current.id,phase,meeting_at:meeting?.toISOString()||null,source_note:source,conversation_note:note,next_action:next,assessment_id:assessmentId,created_by:email}).select().single();
    if(event.error)throw event.error;
    await sb.from('ym_strategic_cases').update({phase,updated_at:new Date().toISOString()}).eq('id',current.id);
    await sb.from('vos_access_audit').insert({email,role:access.role,event:'STRATEGIC_JOURNEY_NOTE',metadata:{opportunity_id:opportunityId,case_id:current.id,phase,event_id:event.data.id}});
    return reply(200,{ok:true,event:event.data},origin);
  }catch(e){return reply(409,{ok:false,error:'strategic_operation_failed',detail:String((e as Error).message||e).slice(0,250)},origin)}
});
