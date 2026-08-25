import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN_E4="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ORIGIN_E5="https://ym-raiox-backend-git-vos-etapa5-cr-022cc5-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS=new Set([ORIGIN_E4,ORIGIN_E5,"http://localhost:3000","http://localhost:5173"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:ORIGIN_E4,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function validUuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  if(!validUuid(body?.case_id))return reply(400,{ok:false,error:"invalid_case_id"},origin);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  const email=String(user?.email||"").trim().toLowerCase();
  if(userError||!user||!email)return reply(401,{ok:false,error:"invalid_session"},origin);
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);if(!access||access.active!==true)return reply(403,{ok:false,error:"forbidden"},origin);
  const {data,error}=await sb.rpc("vos_get_case_bundle",{p_case_id:body.case_id});
  if(error){console.error("motor-case-bundle",error.message);return reply(500,{ok:false,error:"bundle_read_failed"},origin);}
  await sb.from("vos_access_audit").insert({email,role:access.role,event:"CASE_VIEW",metadata:{case_id:body.case_id}});
  return reply(200,{ok:true,bundle:data},origin);
});
