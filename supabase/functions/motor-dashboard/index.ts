import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN = "https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS = new Set([STAGING_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:STAGING_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function claims(req:Request){try{const t=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const p=t.split(".")[1];if(!p)return null;const n=p.replace(/-/g,"+").replace(/_/g,"/");const j=JSON.parse(atob(n+"=".repeat((4-n.length%4)%4)));const email=String(j.email||"").trim().toLowerCase();const sub=String(j.sub||"");return email&&sub?{email,sub}:null;}catch{return null;}}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="GET")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  const c=claims(req);if(!c)return reply(401,{ok:false,error:"invalid_session"},origin);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",c.email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true)return reply(403,{ok:false,error:"forbidden"},origin);
  const [{data:cases,error:ce},{data:intakes,error:ie}]=await Promise.all([
    sb.from("vos_cases").select("id,status,client_ref,business_name,source_intake_id,updated_at,created_at").order("updated_at",{ascending:false}).limit(100),
    sb.from("raiox_intakes").select("id,client_ref,score_overall,score_coverage_pct,score_status,created_at").order("created_at",{ascending:false}).limit(100)
  ]);
  if(ce||ie)return reply(500,{ok:false,error:"dashboard_read_failed"},origin);
  const linked=new Set((cases||[]).map((x:any)=>x.source_intake_id).filter(Boolean));
  await sb.from("vos_access_audit").insert({email:c.email,role:access.role,event:"DASHBOARD_VIEW"});
  return reply(200,{ok:true,user:{email:c.email,role:access.role},cases:cases||[],pending_intakes:(intakes||[]).filter((x:any)=>!linked.has(x.id)),contract_version:"VOS_DASHBOARD_1.0"},origin);
});
