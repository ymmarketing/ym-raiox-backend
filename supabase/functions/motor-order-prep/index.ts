import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS=new Set([STAGING_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:STAGING_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function claims(req:Request){try{const t=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const p=t.split(".")[1];if(!p)return null;const n=p.replace(/-/g,"+").replace(/_/g,"/");const j=JSON.parse(atob(n+"=".repeat((4-n.length%4)%4)));const email=String(j.email||"").trim().toLowerCase(),sub=String(j.sub||"");return email&&sub?{email,sub}:null;}catch{return null;}}
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function text(v:unknown,max=5000){return typeof v==="string"?v.trim().slice(0,max):"";}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  const c=claims(req);if(!c)return reply(401,{ok:false,error:"invalid_session"},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  if(!uuid(body?.case_id))return reply(400,{ok:false,error:"invalid_case_id"},origin);

  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",c.email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true||!["ADMIN","APLICADOR"].includes(access.role))return reply(403,{ok:false,error:"write_forbidden"},origin);

  const {data:gate,error:ge}=await sb.from("vos_gates").select("status").eq("case_id",body.case_id).eq("gate_code","VER_GATE").maybeSingle();
  if(ge)return reply(503,{ok:false,error:"gate_check_failed"},origin);
  if(!gate||gate.status!=="APROVADO")return reply(409,{ok:false,error:"ver_gate_not_approved"},origin);

  const action=text(body.action,5000),rationale=text(body.rationale,5000);
  if(!action||!rationale)return reply(400,{ok:false,error:"action_and_rationale_required"},origin);

  const {data,error}=await sb.from("vos_order_candidates").insert({
    case_id:body.case_id,
    action,
    rationale,
    impact_on_destination:text(body.impact_on_destination,4000)||null,
    dependency:text(body.dependency,3000)||null,
    execution_capacity:text(body.execution_capacity,3000)||null,
    risk_of_delay:text(body.risk_of_delay,3000)||null,
    digital_front:text(body.digital_front,1000)||null,
    success_criterion:text(body.success_criterion,3000)||null,
    not_now:body.not_now===true,
    human_status:"PENDENTE",
    created_by:c.email
  }).select().single();
  if(error){console.error("motor-order-prep",error.message);return reply(409,{ok:false,error:"candidate_rejected",detail:String(error.message||"").slice(0,300)},origin);}

  await sb.from("vos_access_audit").insert({email:c.email,role:access.role,event:"ORDER_CANDIDATE_CREATED",metadata:{case_id:body.case_id,candidate_id:data.id}});
  await sb.from("vos_cases").update({status:"ORDENAR_PREPARADO",updated_by:c.email}).eq("id",body.case_id).eq("status","VER_VALIDADO");
  return reply(201,{ok:true,contract_version:"VOS_ORDER_INPUT_1.0",candidate:data,automatic_priority:false,human_validation_required:true},origin);
});
