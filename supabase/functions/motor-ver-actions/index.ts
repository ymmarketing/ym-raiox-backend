import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ALLOWED_ORIGINS=new Set([STAGING_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
const P8=new Set(["PRODUTO","PRECO","PRACA","PROMOCAO","PESSOAS","PROCESSOS","EVIDENCIAS_FISICAS","PRODUTIVIDADE_QUALIDADE"]);
const CLASSIFICATIONS=new Set(["ATIVO","DISFUNCAO","LACUNA","INCONCLUSIVO"]);
const CONFIDENCE=new Set(["ALTA","MEDIA","BAIXA","SEM_BASE"]);
const EVIDENCE_TYPES=new Set(["CLIENT_SELF_REPORT","PUBLIC_OBSERVATION","DOCUMENT","MEASUREMENT","CRM","SYSTEM"]);
const VER_FIELDS=new Set(["PEDIDO_INICIAL","RESULTADO_ESPERADO","FORMULACAO_PROBLEMA","SINTOMA","EVIDENCIA","CONTEXTO","PATRIMONIO_IDENTIFICADO","FATOR_CONTRIBUINTE","HIPOTESE_CAUSAL","CAUSA","RISCO","RESTRICAO","PONTO_CONTROLE","INCERTEZA","VALIDACAO_ESPECIALIZADA"]);
const SOURCE_TYPES=new Set(["CLIENT_SELF_REPORT","PUBLIC_OBSERVATION","DOCUMENT","MEASUREMENT","CRM","SYSTEM","HUMAN_ANALYSIS","AI_SUGGESTION"]);
const HYP_STATUSES=new Set(["VALIDADA","REJEITADA","INCONCLUSIVA"]);
const TEST_RESULTS=new Set(["SUPORTA","CONTRADIZ","INCONCLUSIVO"]);

function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:STAGING_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function text(v:unknown,max=5000){return typeof v==="string"?v.trim().slice(0,max):"";}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  const action=text(body?.action,80),caseId=body?.case_id;
  if(!uuid(caseId))return reply(400,{ok:false,error:"invalid_case_id"},origin);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  const email=String(user?.email||"").trim().toLowerCase();
  if(userError||!user||!email)return reply(401,{ok:false,error:"invalid_session"},origin);
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true||!["ADMIN","APLICADOR"].includes(access.role))return reply(403,{ok:false,error:"write_forbidden"},origin);
  const {data:caseRow}=await sb.from("vos_cases").select("id,status").eq("id",caseId).maybeSingle();if(!caseRow)return reply(404,{ok:false,error:"case_not_found"},origin);
  const {data:readiness,error:readinessError}=await sb.rpc("vos_ver_data_readiness",{p_case_id:caseId});
  if(readinessError)return reply(503,{ok:false,error:"data_readiness_check_failed"},origin);
  const fullVos=readiness?.ready_for_full_vos===true;
  let result:any=null;
  try{
    if(action==="UPDATE_DESTINATION"){
      const patch={destination_short_term:text(body.destination_short_term,2500)||null,destination_success_signal:text(body.destination_success_signal,2500)||null,notes:text(body.notes,4000)||null,updated_by:email};
      const q=await sb.from("vos_cases").update(patch).eq("id",caseId).select().single();if(q.error)throw q.error;result=q.data;
    } else if(action==="UPDATE_P8"){
      if(!P8.has(body.p8_code))return reply(400,{ok:false,error:"invalid_p8"},origin);
      if(body.classification&&!CLASSIFICATIONS.has(body.classification))return reply(400,{ok:false,error:"invalid_classification"},origin);
      if(body.confidence&&!CONFIDENCE.has(body.confidence))return reply(400,{ok:false,error:"invalid_confidence"},origin);
      const humanStatus=body.human_status==="VALIDADO"?"VALIDADO":"PENDENTE";
      if(humanStatus==="VALIDADO"&&!fullVos&&(body.classification!=="INCONCLUSIVO"||!["BAIXA","SEM_BASE"].includes(body.confidence)))return reply(409,{ok:false,error:"public_or_incomplete_review_must_remain_inconclusive"},origin);
      const patch:any={observation:text(body.observation,5000)||null,evidence_summary:text(body.evidence_summary,5000)||null,classification:body.classification||null,confidence:body.confidence||null,remaining_validation:text(body.remaining_validation,3000)||null,human_status:humanStatus,validated_by:humanStatus==="VALIDADO"?email:null,validated_at:humanStatus==="VALIDADO"?new Date().toISOString():null};
      const q=await sb.from("vos_p8_coverage").update(patch).eq("case_id",caseId).eq("p8_code",body.p8_code).select().single();if(q.error)throw q.error;result=q.data;
      if(humanStatus==="VALIDADO")await sb.from("vos_validations").insert({case_id:caseId,target_type:"P8",target_id:q.data.id,decision:"VALIDAR",rationale:text(body.rationale,2500)||"Validação humana registrada no Motor VOS.",validated_by:email});
    } else if(action==="ADD_EVIDENCE"){
      if(!EVIDENCE_TYPES.has(body.evidence_type))return reply(400,{ok:false,error:"invalid_evidence_type"},origin);
      if(body.p8_code&&!P8.has(body.p8_code))return reply(400,{ok:false,error:"invalid_p8"},origin);
      if(body.reliability&&!CONFIDENCE.has(body.reliability))return reply(400,{ok:false,error:"invalid_reliability"},origin);
      const title=text(body.title,500),sourceRef=text(body.source_ref,1000);if(!title||!sourceRef)return reply(400,{ok:false,error:"title_and_source_required"},origin);
      const q=await sb.from("vos_evidence").insert({case_id:caseId,evidence_type:body.evidence_type,title,content:text(body.content,8000)||null,source_ref:sourceRef,source_url:text(body.source_url,2000)||null,observed_at:body.observed_at||null,p8_code:body.p8_code||null,reliability:body.reliability||null,created_by:email}).select().single();if(q.error)throw q.error;result=q.data;
    } else if(action==="ADD_VER_ENTRY"){
      if(!VER_FIELDS.has(body.ver_field))return reply(400,{ok:false,error:"invalid_ver_field"},origin);
      if(!SOURCE_TYPES.has(body.source_type))return reply(400,{ok:false,error:"invalid_source_type"},origin);
      if(body.p8_code&&!P8.has(body.p8_code))return reply(400,{ok:false,error:"invalid_p8"},origin);
      if(body.classification&&!CLASSIFICATIONS.has(body.classification))return reply(400,{ok:false,error:"invalid_classification"},origin);
      if(body.confidence&&!CONFIDENCE.has(body.confidence))return reply(400,{ok:false,error:"invalid_confidence"},origin);
      const title=text(body.title,600),content=text(body.content,8000),sourceRef=text(body.source_ref,1200);if(!title||!content||!sourceRef)return reply(400,{ok:false,error:"entry_fields_required"},origin);
      const isAi=body.source_type==="AI_SUGGESTION";
      const q=await sb.from("vos_ver_entries").insert({case_id:caseId,ver_field:body.ver_field,title,content,p8_code:body.p8_code||null,classification:body.classification||null,confidence:body.confidence||null,source_type:body.source_type,source_ref:sourceRef,is_ai_suggested:isAi,human_status:"PENDENTE",created_by:email}).select().single();if(q.error)throw q.error;result=q.data;
      if(Array.isArray(body.evidence_ids))for(const eid of body.evidence_ids){if(uuid(eid))await sb.from("vos_entry_evidence").insert({entry_id:q.data.id,evidence_id:eid,relation:"SUPPORTS"});}
    } else if(action==="VALIDATE_VER_ENTRY"){
      if(!uuid(body.entry_id))return reply(400,{ok:false,error:"invalid_entry_id"},origin);const decision=body.decision==="REJEITAR"?"REJEITAR":"VALIDAR";
      const status=decision==="VALIDAR"?"VALIDADO":"REJEITADO";
      const q=await sb.from("vos_ver_entries").update({human_status:status,validated_by:email,validated_at:new Date().toISOString()}).eq("id",body.entry_id).eq("case_id",caseId).select().single();if(q.error)throw q.error;result=q.data;
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"VER_ENTRY",target_id:body.entry_id,decision,rationale:text(body.rationale,2500)||"Decisão humana registrada no Motor VOS.",validated_by:email});
    } else if(action==="ADD_HYPOTHESIS"){
      if(body.p8_code&&!P8.has(body.p8_code))return reply(400,{ok:false,error:"invalid_p8"},origin);if(body.confidence&&!CONFIDENCE.has(body.confidence))return reply(400,{ok:false,error:"invalid_confidence"},origin);
      const statement=text(body.statement,6000);if(!statement)return reply(400,{ok:false,error:"statement_required"},origin);
      const q=await sb.from("vos_hypotheses").insert({case_id:caseId,statement,p8_code:body.p8_code||null,origin:"HUMAN",status:"SUGERIDA",confidence:body.confidence||null,created_by:email}).select().single();if(q.error)throw q.error;result=q.data;
    } else if(action==="ADD_HYPOTHESIS_TEST"){
      if(!uuid(body.hypothesis_id))return reply(400,{ok:false,error:"invalid_hypothesis_id"},origin);if(body.result_classification&&!TEST_RESULTS.has(body.result_classification))return reply(400,{ok:false,error:"invalid_test_result"},origin);
      const desc=text(body.test_description,5000);if(!desc)return reply(400,{ok:false,error:"test_description_required"},origin);
      const q=await sb.from("vos_hypothesis_tests").insert({hypothesis_id:body.hypothesis_id,test_description:desc,method:text(body.method,3000)||null,expected_evidence:text(body.expected_evidence,3000)||null,result_summary:text(body.result_summary,5000)||null,result_classification:body.result_classification||null,tested_by:body.result_classification?email:null,tested_at:body.result_classification?new Date().toISOString():null}).select().single();if(q.error)throw q.error;result=q.data;
      await sb.from("vos_hypotheses").update({status:"EM_TESTE"}).eq("id",body.hypothesis_id).eq("case_id",caseId).neq("status","VALIDADA");
    } else if(action==="VALIDATE_HYPOTHESIS"){
      if(!uuid(body.hypothesis_id)||!HYP_STATUSES.has(body.status))return reply(400,{ok:false,error:"invalid_hypothesis_decision"},origin);
      if(body.status==="VALIDADA"&&!fullVos)return reply(409,{ok:false,error:"internal_business_data_required_for_validated_hypothesis"},origin);
      const patch:any={status:body.status,validated_by:email,validated_at:new Date().toISOString()};if(body.confidence){if(!CONFIDENCE.has(body.confidence))return reply(400,{ok:false,error:"invalid_confidence"},origin);patch.confidence=body.confidence;}
      const q=await sb.from("vos_hypotheses").update(patch).eq("id",body.hypothesis_id).eq("case_id",caseId).select().single();if(q.error)throw q.error;result=q.data;
      const decision=body.status==="VALIDADA"?"VALIDAR":body.status==="REJEITADA"?"REJEITAR":"MANTER_INCONCLUSIVO";
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"HYPOTHESIS",target_id:body.hypothesis_id,decision,rationale:text(body.rationale,3000)||"Decisão humana registrada após teste de hipótese.",validated_by:email});
    } else if(action==="ADD_CONCLUSION"){
      if(!fullVos)return reply(409,{ok:false,error:"internal_business_data_required_for_conclusion"},origin);
      const statement=text(body.statement,7000);if(!statement||!CONFIDENCE.has(body.confidence))return reply(400,{ok:false,error:"conclusion_fields_required"},origin);
      const conclusionType=["CAUSA_PROVAVEL","CAUSA_VALIDADA","OUTRA"].includes(body.conclusion_type)?body.conclusion_type:"OUTRA";
      const q=await sb.from("vos_conclusions").insert({case_id:caseId,conclusion_type:conclusionType,statement,confidence:body.confidence,uncertainty:text(body.uncertainty,3500)||null,impact_on_destination:text(body.impact_on_destination,3500)||null,human_validated_by:email,human_validated_at:new Date().toISOString()}).select().single();if(q.error)throw q.error;result=q.data;
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"CONCLUSION",target_id:q.data.id,decision:"VALIDAR",rationale:text(body.rationale,3000)||"Conclusão registrada e validada explicitamente por aplicadora humana.",validated_by:email});
    } else if(action==="SET_VER_GATE"){
      const gateStatus=body.status==="APROVADO"?"APROVADO":"REPROVADO";const justification=text(body.justification,5000);if(!justification)return reply(400,{ok:false,error:"gate_justification_required"},origin);
      if(gateStatus==="APROVADO"){
        if(!fullVos)return reply(409,{ok:false,error:"internal_business_data_required_for_ver_gate"},origin);
        const {count}=await sb.from("vos_p8_coverage").select("id",{count:"exact",head:true}).eq("case_id",caseId).eq("human_status","VALIDADO");
        if(count!==8)return reply(409,{ok:false,error:"all_8p_must_be_human_validated",validated_p8:count||0},origin);
      }
      const q=await sb.from("vos_gates").update({status:gateStatus,justification,remaining_conditions:text(body.remaining_conditions,4000)||null,validated_by:email,validated_at:new Date().toISOString()}).eq("case_id",caseId).eq("gate_code","VER_GATE").select().single();if(q.error)throw q.error;result=q.data;
      await sb.from("vos_validations").insert({case_id:caseId,target_type:"GATE",target_id:q.data.id,decision:gateStatus==="APROVADO"?"VALIDAR":"REJEITAR",rationale:justification,validated_by:email});
      await sb.from("vos_cases").update({status:gateStatus==="APROVADO"?"VER_VALIDADO":"VER_AGUARDANDO_VALIDACAO",updated_by:email}).eq("id",caseId);
    } else return reply(400,{ok:false,error:"unsupported_action"},origin);
  }catch(e:any){console.error("motor-ver-actions",action,e?.message||e);return reply(409,{ok:false,error:"action_rejected",detail:String(e?.message||"operation_failed").slice(0,300)},origin);}
  await sb.from("vos_access_audit").insert({email,role:access.role,event:"VER_ACTION",metadata:{case_id:caseId,action,analysis_mode:readiness?.analysis_mode||null}});
  return reply(200,{ok:true,action,result},origin);
});
