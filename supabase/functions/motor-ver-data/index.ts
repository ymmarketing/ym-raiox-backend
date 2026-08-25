import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROD_ORIGIN="https://ymnegocios.com.br";
const STAGING_ORIGIN="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS=new Set([PROD_ORIGIN,STAGING_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
const METRICS=new Map([
  ["GROSS_REVENUE",["Faturamento bruto","MOEDA"]],
  ["SALES_VOLUME",["Volume de vendas","QUANTIDADE"]],
  ["AVERAGE_TICKET",["Ticket médio","MOEDA"]],
  ["QUALIFIED_LEADS",["Leads qualificados","QUANTIDADE"]],
  ["CONVERSION_RATE",["Taxa de conversão","PERCENTUAL"]],
  ["REPEAT_PURCHASE_RATE",["Taxa de recompra","PERCENTUAL"]],
  ["GROSS_MARGIN",["Margem bruta","PERCENTUAL"]],
  ["CANCELLATION_RATE",["Taxa de cancelamento","PERCENTUAL"]],
  ["OTHER",["Outro KPI de negócio","NUMERO"]],
]);
const SOURCES=new Set(["CLIENT_SELF_REPORT","DOCUMENT","MEASUREMENT","CRM","SYSTEM"]);

function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:PROD_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function clean(v:unknown,max=4000){return typeof v==="string"?v.trim().slice(0,max):"";}
function number(v:unknown){const n=typeof v==="number"?v:Number(v);return Number.isFinite(n)?n:null;}
function date(v:unknown){const x=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:null;}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);

  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return reply(401,{ok:false,error:"invalid_session"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  const email=String(user?.email||"").trim().toLowerCase();
  if(userError||!user||!email)return reply(401,{ok:false,error:"invalid_session"},origin);

  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  const caseId=body?.case_id,action=clean(body?.action,80);
  if(!uuid(caseId))return reply(400,{ok:false,error:"invalid_case_id"},origin);
  const {data:access,error:accessError}=await sb.from("vos_internal_access").select("role,active").eq("email",email).maybeSingle();
  if(accessError)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true||!["ADMIN","APLICADOR"].includes(access.role))return reply(403,{ok:false,error:"write_forbidden"},origin);
  const {data:caseRow,error:caseError}=await sb.from("vos_cases").select("id").eq("id",caseId).maybeSingle();
  if(caseError)return reply(503,{ok:false,error:"case_check_failed"},origin);
  if(!caseRow)return reply(404,{ok:false,error:"case_not_found"},origin);

  let result:any=null;
  try{
    if(action==="SET_SHARING_DECISION"){
      const decision=body.sharing_status;
      if(!["SHARED","DECLINED"].includes(decision))return reply(400,{ok:false,error:"invalid_sharing_status"},origin);
      const declineReason=clean(body.decline_reason,3000);
      if(decision==="DECLINED"&&!declineReason)return reply(400,{ok:false,error:"decline_reason_required"},origin);
      const patch=decision==="SHARED"?{
        sharing_status:"SHARED",analysis_mode:"INTERNAL_COMPLETE",decline_reason:null,limitations_acknowledged:false,
        portfolio_declared_complete:false,data_quality_confirmed:false,coverage_status:"INSUFFICIENT",decision_by:email,decision_at:new Date().toISOString()
      }:{
        sharing_status:"DECLINED",analysis_mode:"PUBLIC_LIMITED",decline_reason:declineReason,limitations_acknowledged:true,
        portfolio_declared_complete:false,data_quality_confirmed:false,coverage_status:"INSUFFICIENT",decision_by:email,decision_at:new Date().toISOString()
      };
      const q=await sb.from("vos_ver_data_profiles").upsert({case_id:caseId,...patch},{onConflict:"case_id"}).select().single();
      if(q.error)throw q.error;result=q.data;
      if(decision==="DECLINED"){
        await sb.from("vos_gates").update({status:"REPROVADO",justification:"Cliente optou por não compartilhar os dados internos mínimos. Caso mantido como leitura pública limitada.",remaining_conditions:"Para retomar o MOTOR VOS completo, registrar faturamento, volume de vendas, composição do portfólio e respectivas fontes.",validated_by:email,validated_at:new Date().toISOString()}).eq("case_id",caseId).eq("gate_code","VER_GATE");
        await sb.from("vos_cases").update({status:"VER_AGUARDANDO_VALIDACAO",updated_by:email}).eq("id",caseId);
      }
    } else if(action==="UPSERT_BUSINESS_METRIC"){
      const meta=METRICS.get(body.metric_code);if(!meta)return reply(400,{ok:false,error:"invalid_metric_code"},origin);
      const periodStart=date(body.period_start),periodEnd=date(body.period_end),value=number(body.value),source=clean(body.source_type,40),sourceRef=clean(body.source_ref,1200);
      if(!periodStart||!periodEnd||periodEnd<periodStart||value===null||!SOURCES.has(source)||!sourceRef)return reply(400,{ok:false,error:"invalid_metric_fields"},origin);
      const metricName=body.metric_code==="OTHER"?clean(body.metric_name,300):String(meta[0]);
      if(!metricName)return reply(400,{ok:false,error:"metric_name_required"},origin);
      const row={case_id:caseId,metric_code:body.metric_code,metric_name:metricName,unit:String(meta[1]),period_start:periodStart,period_end:periodEnd,value,source_type:source,source_ref:sourceRef,evidence_url:clean(body.evidence_url,2000)||null,validation_status:"VALIDADO",notes:clean(body.notes,3000)||null,created_by:email,updated_by:email};
      const q=uuid(body.id)?await sb.from("vos_business_metric_snapshots").update(row).eq("id",body.id).eq("case_id",caseId).select().single():await sb.from("vos_business_metric_snapshots").insert(row).select().single();
      if(q.error)throw q.error;result=q.data;
    } else if(action==="UPSERT_PORTFOLIO_ITEM"){
      const item=clean(body.portfolio_item,400),periodStart=date(body.period_start),periodEnd=date(body.period_end),units=number(body.units_sold),revenue=number(body.gross_revenue),source=clean(body.source_type,40),sourceRef=clean(body.source_ref,1200);
      if(!item||!periodStart||!periodEnd||periodEnd<periodStart||units===null||units<0||revenue===null||revenue<0||!SOURCES.has(source)||!sourceRef)return reply(400,{ok:false,error:"invalid_portfolio_fields"},origin);
      const row={case_id:caseId,portfolio_item:item,portfolio_category:clean(body.portfolio_category,300)||null,period_start:periodStart,period_end:periodEnd,units_sold:units,gross_revenue:revenue,source_type:source,source_ref:sourceRef,evidence_url:clean(body.evidence_url,2000)||null,validation_status:"VALIDADO",notes:clean(body.notes,3000)||null,created_by:email,updated_by:email};
      const q=uuid(body.id)?await sb.from("vos_portfolio_performance").update(row).eq("id",body.id).eq("case_id",caseId).select().single():await sb.from("vos_portfolio_performance").insert(row).select().single();
      if(q.error)throw q.error;result=q.data;
    } else if(action==="CONFIRM_DATA_COVERAGE"){
      const notes=clean(body.coverage_notes,3000);
      const q=await sb.from("vos_ver_data_profiles").update({portfolio_declared_complete:body.portfolio_declared_complete===true,data_quality_confirmed:body.data_quality_confirmed===true,coverage_notes:notes||null,decision_by:email,decision_at:new Date().toISOString()}).eq("case_id",caseId).eq("sharing_status","SHARED").select().single();
      if(q.error)throw q.error;result=q.data;
    } else return reply(400,{ok:false,error:"unsupported_action"},origin);

    const {data:readiness,error:readinessError}=await sb.rpc("vos_refresh_ver_data_coverage",{p_case_id:caseId});
    if(readinessError)throw readinessError;
    await sb.from("vos_access_audit").insert({email,role:access.role,event:"VER_DATA_ACTION",metadata:{case_id:caseId,action,mode:readiness?.analysis_mode||null}});
    return reply(200,{ok:true,action,result,data_readiness:readiness},origin);
  }catch(e:any){
    console.error("motor-ver-data",action,e?.message||e);
    return reply(409,{ok:false,error:"ver_data_action_rejected",detail:String(e?.message||"operation_failed").slice(0,300)},origin);
  }
});
