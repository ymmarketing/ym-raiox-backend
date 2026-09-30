import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';

const origins=new Set(['https://ymnegocios.com.br','http://localhost:3000','http://localhost:5173']);
const headers=(origin:string|null)=>({
  'Access-Control-Allow-Origin':origin&&origins.has(origin)?origin:'https://ymnegocios.com.br',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','Vary':'Origin'
});
const reply=(status:number,data:unknown,origin:string|null)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
const str=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';

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
  const mode=str(body.action,12);
  if(!['CHECK','CREATE'].includes(mode))return reply(400,{ok:false,error:'unsupported_action'},origin);
  const business=str(body.business_name,250),source=str(body.source_url,1500),day=str(body.research_date,10);
  if(business.length<2)return reply(400,{ok:false,error:'business_required'},origin);
  if(mode==='CREATE'&&(!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(source)||!/^\d{4}-\d{2}-\d{2}$/.test(day)))
    return reply(400,{ok:false,error:'source_and_date_required'},origin);
  const args={
    p_mode:mode,p_business:business,p_name:str(body.name,250),
    p_email:str(body.email,320),p_phone:str(body.phone,60),p_segment:str(body.segment,250),
    p_source_url:source,p_researched_on:mode==='CHECK'?null:day,
    p_signal:str(body.public_signal,3000),p_hypothesis:str(body.hypothesis,3000),
    p_next_action:str(body.next_action,1000),
    p_due_at:body.next_action_due_at||null,p_actor:email
  };
  const {data,error}=await sb.rpc('crm_researched_prospect',args);
  if(error)return reply(400,{ok:false,error:'invalid_prospect',detail:error.message.slice(0,250)},origin);
  if(mode==='CREATE'&&data?.matches?.length)return reply(409,{ok:false,error:'possible_duplicate',matches:data.matches},origin);
  if(mode==='CREATE'){
    await sb.from('vos_access_audit').insert({email,role:access.role,event:'RESEARCHED_PROSPECT_CREATED',metadata:{opportunity_id:data.opportunity_id,contact_id:data.contact_id}});
  }
  return reply(200,{ok:true,...data},origin);
});
