import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN_E4="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ORIGIN_E5="https://ym-raiox-backend-git-vos-etapa5-cr-022cc5-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS=new Set([ORIGIN_E4,ORIGIN_E5,"http://localhost:3000","http://localhost:5173"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:ORIGIN_E5,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function text(v:unknown,max=6000){return typeof v==="string"?v.trim().slice(0,max):"";}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  const caseId=body?.case_id,action=text(body?.action,80);
  if(!uuid(caseId))return reply(400,{ok:false,error:"invalid_case_id"},origin);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  const email=String(user?.email||"").trim().toLowerCase();
  if(userError||!user||!email)return reply(401,{ok:false,error:"invalid_session"},origin);
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true||!["ADMIN","APLICADOR"].includes(access.role))return reply(403,{ok:false,error:"write_forbidden"},origin);
  const {data:caseRow,error:ce}=await sb.from("vos_cases").select("id,status").eq("id",caseId).maybeSingle();
  if(ce)return reply(503,{ok:false,error:"case_check_failed"},origin);
  if(!caseRow)return reply(404,{ok:false,error:"case_not_found"},origin);
  const {data:readiness,error:readinessError}=await sb.rpc("vos_ver_data_readiness",{p_case_id:caseId});
  if(readinessError)return reply(503,{ok:false,error:"data_readiness_check_failed"},origin);
  if(readiness?.ready_for_full_vos!==true)return reply(409,{ok:false,error:"internal_business_data_required_for_order"},origin);

  let result:any=null;
  try{
    if(action==="CREATE_CANDIDATE"){
      const {data:gate,error:ge}=await sb.from("vos_gates").select("status").eq("case_id",caseId).eq("gate_code","VER_GATE").maybeSingle();
      if(ge)throw ge;
      if(!gate||gate.status!=="APROVADO")return reply(409,{ok:false,error:"ver_gate_not_approved"},origin);
      const candidateAction=text(body.candidate_action,5000),rationale=text(body.rationale,5000);
      if(!candidateAction||!rationale)return reply(400,{ok:false,error:"action_and_rationale_required"},origin);
      const {data,error}=await sb.from("vos_order_candidates").insert({
        case_id:caseId,action:candidateAction,rationale,
        impact_on_destination:text(body.impact_on_destination,4000)||null,
        dependency:text(body.dependency,3000)||null,
        execution_capacity:text(body.execution_capacity,3000)||null,
        risk_of_delay:text(body.risk_of_delay,3000)||null,
        digital_front:text(body.digital_front,1000)||null,
        success_criterion:text(body.success_criterion,3000)||null,
        not_now:body.not_now===true,human_status:"PENDENTE",sequence_order:null,created_by:email
      }).select().single();
      if(error)throw error; result=data;
    } else if(action==="VALIDATE_CANDIDATE"){
      if(!uuid(body.candidate_id))return reply(400,{ok:false,error:"invalid_candidate_id"},origin);
      const rationale=text(body.validation_rationale,4000);if(!rationale)return reply(400,{ok:false,error:"validation_rationale_required"},origin);
      const {data:existing,error:ee}=await sb.from("vos_order_candidates").select("id,not_now").eq("id",body.candidate_id).eq("case_id",caseId).maybeSingle();
      if(ee)throw ee;if(!existing)return reply(404,{ok:false,error:"candidate_not_found"},origin);
      const seq=existing.not_now?null:Number(body.sequence_order);
      if(!existing.not_now&&(!Number.isInteger(seq)||seq<1))return reply(400,{ok:false,error:"sequence_order_required"},origin);
      const {data,error}=await sb.from("vos_order_candidates").update({human_status:"VALIDADO",sequence_order:seq,validated_by:email,validated_at:new Date().toISOString()}).eq("id",body.candidate_id).eq("case_id",caseId).select().single();
      if(error)throw error;
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"ORDER_CANDIDATE",target_id:body.candidate_id,decision:"VALIDAR",rationale,validated_by:email});
      result=data;
    } else if(action==="REJECT_CANDIDATE"){
      if(!uuid(body.candidate_id))return reply(400,{ok:false,error:"invalid_candidate_id"},origin);
      const rationale=text(body.validation_rationale,4000);if(!rationale)return reply(400,{ok:false,error:"validation_rationale_required"},origin);
      const {data,error}=await sb.from("vos_order_candidates").update({human_status:"REJEITADO",sequence_order:null,validated_by:email,validated_at:new Date().toISOString()}).eq("id",body.candidate_id).eq("case_id",caseId).select().single();
      if(error)throw error;
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"ORDER_CANDIDATE",target_id:body.candidate_id,decision:"REJEITAR",rationale,validated_by:email});
      result=data;
    } else return reply(400,{ok:false,error:"unsupported_action"},origin);
  }catch(e:any){console.error("motor-order-actions",action,e?.message||e);return reply(409,{ok:false,error:"order_action_rejected",detail:String(e?.message||"operation_failed").slice(0,300)},origin);}

  await sb.from("vos_access_audit").insert({email,role:access.role,event:"ORDER_ACTION",metadata:{case_id:caseId,action,target_id:result?.id||null}});
  if(action==="VALIDATE_CANDIDATE")await sb.from("vos_cases").update({status:"ORDENAR_PREPARADO",updated_by:email}).eq("id",caseId).eq("status","VER_VALIDADO");
  return reply(200,{ok:true,action,result,contract_version:"VOS_ORDER_INPUT_1.1",automatic_priority:false,human_validation_required:true},origin);
});
