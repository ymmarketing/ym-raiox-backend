import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendClientTransactionalEmail } from "../_shared/client-transactional-email.ts";

const PROD='https://ymnegocios.com.br';
const ORIGINS=new Set([PROD,'http://localhost:3000','http://localhost:5173']);
function headers(o:string|null){return {'Access-Control-Allow-Origin':o&&ORIGINS.has(o)?o:PROD,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};}
function reply(s:number,b:any,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)});}
function text(v:any,max=10000){return typeof v==='string'?v.trim().slice(0,max):'';}
function uuid(v:any){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function http(v:string){return /^https?:\/\//i.test(v);}
function dateTime(v:any){const s=text(v,80);if(!s)return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString();}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(origin&&!ORIGINS.has(origin))return reply(403,{ok:false,error:'origin_not_allowed'},origin);
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'},origin);

  const su=Deno.env.get('SUPABASE_URL'),sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!su||!sk)return reply(503,{ok:false,error:'storage_not_configured'},origin);
  const sb=createClient(su,sk,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:ue}=await sb.auth.getUser(token);
  if(ue||!user?.email)return reply(401,{ok:false,error:'invalid_session'},origin);
  const email=user.email.toLowerCase();
  const {data:access,error:ae}=await sb.from('vos_internal_access').select('role,active').eq('email',email).maybeSingle();
  if(ae||!access?.active)return reply(403,{ok:false,error:'forbidden'},origin);
  const role=access.role;

  let b:any;try{b=await req.json();}catch{return reply(400,{ok:false,error:'invalid_json'},origin);}
  const action=text(b.action,80);
  const audit=async(event:string,metadata:any)=>{await sb.from('vos_access_audit').insert({email,role,event,metadata});};

  try{
    if(action==='LIST_EVENTS'){
      const q=await sb.from('client_calendar_events').select('id,client_id,client_service_id,title,description,event_type,starts_at,ends_at,all_day,external_url,visible_to_client,status,cancelled_at,cancellation_reason,cancelled_by_email,created_at,updated_at').order('starts_at',{ascending:true}).limit(2000);
      if(q.error)throw q.error;
      return reply(200,{ok:true,events:q.data||[]},origin);
    }

    if(action==='UPSERT_EVENT'){
      const clientId=uuid(b.client_id)?b.client_id:null;
      const serviceId=uuid(b.client_service_id)?b.client_service_id:null;
      const title=text(b.title,500);
      const starts=dateTime(b.starts_at);
      const ends=dateTime(b.ends_at);
      if(!title)return reply(400,{ok:false,error:'title_required'},origin);
      if(!starts)return reply(400,{ok:false,error:'starts_at_required'},origin);
      const eventType=['REUNIAO','ENTREGA','PUBLICACAO','APROVACAO','FINANCEIRO','MARCO','OUTRO'].includes(b.event_type)?b.event_type:'OUTRO';
      const externalUrl=text(b.external_url,2000)||null;
      if(externalUrl&&!http(externalUrl))return reply(400,{ok:false,error:'url_must_be_http'},origin);

      if(clientId){
        const cq=await sb.from('crm_clients').select('id').eq('id',clientId).maybeSingle();
        if(cq.error)throw cq.error;
        if(!cq.data)return reply(404,{ok:false,error:'client_not_found'},origin);
      }
      if(serviceId){
        if(!clientId)return reply(400,{ok:false,error:'service_requires_client'},origin);
        const sq=await sb.from('crm_client_services').select('id').eq('id',serviceId).eq('client_id',clientId).maybeSingle();
        if(sq.error)throw sq.error;
        if(!sq.data)return reply(404,{ok:false,error:'service_not_found_for_client'},origin);
      }

      const visibleToClient=clientId?b.visible_to_client!==false:false;
      const row:any={
        client_id:clientId,
        client_service_id:serviceId,
        title,
        description:text(b.description,6000)||null,
        event_type:eventType,
        starts_at:starts,
        ends_at:ends,
        all_day:!!b.all_day,
        external_url:externalUrl,
        visible_to_client:visibleToClient,
        updated_by:email
      };
      let q;
      if(uuid(b.id)){
        const exists=await sb.from('client_calendar_events').select('id').eq('id',b.id).maybeSingle();
        if(exists.error)throw exists.error;
        if(!exists.data)return reply(404,{ok:false,error:'event_not_found'},origin);
        q=await sb.from('client_calendar_events').update(row).eq('id',b.id).select().single();
      }else{
        q=await sb.from('client_calendar_events').insert({...row,created_by:email}).select().single();
      }
      if(q.error)throw q.error;
      await audit('CENTRAL_YM_CALENDAR_EVENT_UPSERT',{event_id:q.data.id,client_id:clientId,event_type:eventType,visible_to_client:visibleToClient});
      let emailDelivery:any=null;
      if(clientId&&visibleToClient&&['REUNIAO','ENTREGA','APROVACAO'].includes(eventType)){
        await sb.from('client_notifications').insert({client_id:clientId,notification_type:eventType,title:eventType==='REUNIAO'?'Novo compromisso agendado':eventType==='ENTREGA'?'Nova entrega agendada':'Nova aprovação agendada',message:title,target_url:'/areadocliente#calendario',created_by:email});
        emailDelivery=await sendClientTransactionalEmail({sb,clientId,kind:'AGENDA',resourceType:'CALENDAR_EVENT',resourceId:q.data.id,title,description:row.description,scheduledAt:q.data.starts_at,externalUrl,portalHash:'calendario',allowCancellation:eventType==='REUNIAO'});
      }
      return reply(200,{ok:true,event:q.data,email_delivery:emailDelivery},origin);
    }

    if(action==='DELETE_EVENT'&&uuid(b.id)){
      const q=await sb.from('client_calendar_events').delete().eq('id',b.id).select('id,client_id').single();
      if(q.error)throw q.error;
      await audit('CENTRAL_YM_CALENDAR_EVENT_DELETED',{event_id:b.id,client_id:q.data?.client_id||null});
      return reply(200,{ok:true},origin);
    }

    return reply(400,{ok:false,error:'unsupported_action'},origin);
  }catch(e:any){console.error('central-ym-calendar-admin',action,e?.message||e);return reply(409,{ok:false,error:'operation_failed',detail:String(e?.message||e).slice(0,600)},origin);}
});
