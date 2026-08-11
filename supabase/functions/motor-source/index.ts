import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STAGING_ORIGIN="https://ym-raiox-backend-git-vos-etapa5-cr-022cc5-ym-marketing-negocios.vercel.app";
const E4_ORIGIN="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const PROD_ORIGIN="https://ymnegocios.com.br";
const ALLOWED_ORIGINS=new Set([STAGING_ORIGIN,E4_ORIGIN,PROD_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
const MODES=new Set(["RAIOX_LEGADO","CLIENTE_RECORRENTE_SEM_RAIOX","CONTINGENCIA_MANUAL"]);
function cors(origin:string|null){const allow=origin&&ALLOWED_ORIGINS.has(origin)?origin:STAGING_ORIGIN;return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function claims(req:Request){try{const t=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const p=t.split(".")[1];if(!p)return null;const n=p.replace(/-/g,"+").replace(/_/g,"/");const j=JSON.parse(atob(n+"=".repeat((4-n.length%4)%4)));const email=String(j.email||"").trim().toLowerCase(),sub=String(j.sub||"");return email&&sub?{email,sub}:null;}catch{return null;}}
function uuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function text(v:unknown,max=5000){return typeof v==="string"?v.trim().slice(0,max):"";}
function isHttp(v:string){return /^https?:\/\//i.test(v);}
function response(question_id:string,field_id:string,value:string){return {question_id,field_id,value,answered:Boolean(value),source_type:"human_contingency_entry",collected_at:new Date().toISOString()};}
function p8Empty(){return ["Produto","Preço","Praça","Promoção","Pessoas","Processos","Evidências físicas","Produtividade e Qualidade"].map(p8=>({p8,score:null,coverage:{valid:0,total:0,pct:0},classification:"INCONCLUSIVO"}));}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:cors(origin)});}
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
  const c=claims(req);if(!c)return reply(401,{ok:false,error:"invalid_session"},origin);
  let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
  const su=Deno.env.get("SUPABASE_URL"),sk=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!su||!sk)return reply(503,{ok:false,error:"storage_not_configured"},origin);
  const sb=createClient(su,sk,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:access,error:ae}=await sb.from("vos_internal_access").select("role,active").eq("email",c.email).maybeSingle();
  if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
  if(!access||access.active!==true||!["ADMIN","APLICADOR"].includes(access.role))return reply(403,{ok:false,error:"write_forbidden"},origin);
  const action=text(body?.action,80);

  try{
    if(action==="GET_RAIOX_DETAIL"){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:"invalid_opportunity_id"},origin);
      const {data:opp,error:oe}=await sb.from("crm_opportunities").select("id,source_intake_id,source_case_id,contact:crm_contacts(id,client_ref,name,business_name)").eq("id",body.opportunity_id).maybeSingle();
      if(oe)throw oe;if(!opp)return reply(404,{ok:false,error:"opportunity_not_found"},origin);
      if(!opp.source_intake_id)return reply(200,{ok:true,action,result:{has_intake:false,source_case_id:opp.source_case_id||null,contact:opp.contact||null}},origin);
      const {data:intake,error:ie}=await sb.from("raiox_intakes").select("id,created_at,source_product,source_system,source_session_id,client_ref,packet_version,questionnaire_version,scoring_version,report_version,score_overall,score_coverage_pct,score_status,human_validation_required,packet").eq("id",opp.source_intake_id).maybeSingle();
      if(ie)throw ie;if(!intake)return reply(404,{ok:false,error:"intake_not_found"},origin);
      await sb.from("vos_access_audit").insert({email:c.email,role:access.role,event:"SOURCE_VIEW",metadata:{opportunity_id:body.opportunity_id,intake_id:intake.id}});
      return reply(200,{ok:true,action,result:{has_intake:true,source_case_id:opp.source_case_id||null,contact:opp.contact||null,intake}},origin);
    }

    if(action==="GET_CASE_SOURCE"){
      if(!uuid(body.case_id))return reply(400,{ok:false,error:"invalid_case_id"},origin);
      const {data:caseRow,error:ce}=await sb.from("vos_cases").select("id,source_intake_id,client_ref,client_name,business_name,source_packet").eq("id",body.case_id).maybeSingle();
      if(ce)throw ce;if(!caseRow)return reply(404,{ok:false,error:"case_not_found"},origin);
      const {data:intake,error:ie}=await sb.from("raiox_intakes").select("id,created_at,source_product,source_system,source_session_id,client_ref,packet_version,questionnaire_version,scoring_version,report_version,score_overall,score_coverage_pct,score_status,human_validation_required,packet").eq("id",caseRow.source_intake_id).maybeSingle();
      if(ie)throw ie;
      await sb.from("vos_access_audit").insert({email:c.email,role:access.role,event:"SOURCE_VIEW",metadata:{case_id:body.case_id,intake_id:caseRow.source_intake_id}});
      return reply(200,{ok:true,action,result:{case:caseRow,intake:intake||null}},origin);
    }

    if(action==="CREATE_CONTINGENCY_CASE"){
      if(!uuid(body.opportunity_id))return reply(400,{ok:false,error:"invalid_opportunity_id"},origin);
      const mode=text(body.source_mode,80);if(!MODES.has(mode))return reply(400,{ok:false,error:"invalid_source_mode"},origin);
      const sourceUrl=text(body.source_file_url,2000);if(sourceUrl&&!isHttp(sourceUrl))return reply(400,{ok:false,error:"source_file_url_must_be_http"},origin);
      const legacyScore=body.legacy_score==null||body.legacy_score===""?null:Number(body.legacy_score);if(legacyScore!=null&&(!Number.isFinite(legacyScore)||legacyScore<0||legacyScore>100))return reply(400,{ok:false,error:"legacy_score_out_of_range"},origin);
      const {data:opp,error:oe}=await sb.from("crm_opportunities").select("id,source_intake_id,source_case_id,current_stage,next_action,contact:crm_contacts(id,client_ref,name,business_name,decision_maker)").eq("id",body.opportunity_id).maybeSingle();
      if(oe)throw oe;if(!opp)return reply(404,{ok:false,error:"opportunity_not_found"},origin);
      if(opp.source_case_id)return reply(409,{ok:false,error:"motor_case_already_exists",case_id:opp.source_case_id},origin);

      if(opp.source_intake_id){
        const {data:existingCase,error:ec}=await sb.rpc("vos_create_case_from_intake",{p_intake_id:opp.source_intake_id,p_created_by:c.email});if(ec)throw ec;
        await sb.from("crm_opportunities").update({source_case_id:existingCase,updated_by:c.email,updated_at:new Date().toISOString()}).eq("id",opp.id);
        await sb.from("crm_activities").insert({opportunity_id:opp.id,activity_type:"NOTA",content:"Caso MOTOR criado a partir do intake já existente.",created_by:c.email});
        return reply(200,{ok:true,action,result:{case_id:existingCase,intake_id:opp.source_intake_id,source_mode:"INTAKE_EXISTENTE"}},origin);
      }

      const contact:any=opp.contact||{};
      const business=text(contact.business_name||contact.name||"Cliente",500),clientName=text(contact.name||contact.decision_maker||"",500),clientRef=text(contact.client_ref||business,500);
      const difficulty=text(body.declared_difficulty,5000),strengths=text(body.strengths,5000),attempts=text(body.previous_attempts,5000),goal=text(body.current_goal,5000),success=text(body.success_signal,5000),capacity=text(body.capacity_context,5000),notes=text(body.notes,7000);
      const responses=[response("RX01","CLIENT_NAME",clientName),response("RX02","BUSINESS_NAME",business),response("RX25","CAPACITY_CURRENT_USE",capacity),response("RX26","PATRIMONY_STRENGTHS",strengths),response("RX27","DEMAND_DECLARED_DIFFICULTY",difficulty),response("RX28","CONTEXT_ATTEMPTS",attempts),response("RX29","DESTINATION_90D",goal),response("RX30","DESTINATION_SUCCESS_SIGNAL",success)].filter(x=>x.value);
      const packet={packet_version:"VOS_INTAKE_1.0",questionnaire_version:mode==="RAIOX_LEGADO"?"RX_LEGADO_MANUAL":"NAO_APLICADO_CONTINGENCIA",scoring_version:legacyScore==null?"NAO_APLICADO":"SCORE_LEGADO_DECLARADO",report_version:mode==="RAIOX_LEGADO"?"RELATORIO_LEGADO_REFERENCIADO":"SEM_RELATORIO_CANONICO",source_product:mode==="RAIOX_LEGADO"?"RAIO_X_LEGADO":"CONTINGENCIA_VOS",source_system:"CRM_CONTINGENCIA_MANUAL",source_session_id:"CONT_"+crypto.randomUUID(),client_ref:clientRef,responses,p8_coverage:p8Empty(),patrimony:[],attention_points:[],gaps:[{unknown:"Questionário canônico atual não disponível para este caso.",missing:mode==="RAIOX_LEGADO"?"As respostas do Raio-X legado não foram convertidas para o questionário atual.":"O cliente entrou no MOTOR sem executar o Raio-X atual.",validate:"Usar o VER para investigar e validar os dados humanos antes do Gate."}],initial_hypotheses:[],tips:[],destination:{short_term:goal||null,success_signal:success||null},limitations:["Caso criado por contingência. Não tratar ausência de respostas canônicas como ausência de ativo ou como causa."],route_signal:null,route_label:"A VALIDAR",human_validation_required:true,provenance:{source_mode:mode,created_manually_by:c.email,source_file_url:sourceUrl||null,legacy_date:text(body.legacy_date,40)||null,legacy_score:legacyScore,notes:notes||null,canonical_questionnaire_completed:false}};
      const {data:intake,error:ii}=await sb.from("raiox_intakes").insert({source_product:packet.source_product,source_system:packet.source_system,source_session_id:packet.source_session_id,client_ref:clientRef,packet_version:"VOS_INTAKE_1.0",questionnaire_version:packet.questionnaire_version,scoring_version:packet.scoring_version,report_version:packet.report_version,score_overall:legacyScore,score_coverage_pct:0,score_status:"DADOS_INSUFICIENTES",route_signal:null,human_validation_required:true,packet}).select("id,created_at").single();if(ii)throw ii;
      const {data:caseId,error:vc}=await sb.rpc("vos_create_case_from_intake",{p_intake_id:intake.id,p_created_by:c.email});if(vc){await sb.from("raiox_intakes").delete().eq("id",intake.id);throw vc;}
      await sb.from("vos_cases").update({notes:`CONTINGÊNCIA · ${mode}. ${notes||"Sem observação adicional."}`,updated_by:c.email}).eq("id",caseId);
      const {error:uo}=await sb.from("crm_opportunities").update({source_intake_id:intake.id,source_case_id:caseId,updated_by:c.email,updated_at:new Date().toISOString()}).eq("id",opp.id);if(uo)throw uo;
      await sb.from("crm_activities").insert({opportunity_id:opp.id,activity_type:"NOTA",content:`Caso MOTOR criado via contingência (${mode}). ${sourceUrl?"Fonte legado vinculada: "+sourceUrl:"Sem arquivo legado vinculado."}`,created_by:c.email});
      await sb.from("vos_access_audit").insert({email:c.email,role:access.role,event:"CONTINGENCY_CASE_CREATED",metadata:{opportunity_id:opp.id,intake_id:intake.id,case_id:caseId,source_mode:mode}});
      return reply(201,{ok:true,action,result:{case_id:caseId,intake_id:intake.id,source_mode:mode,redirect:"/MOTOR?case="+caseId}},origin);
    }

    return reply(400,{ok:false,error:"unsupported_action"},origin);
  }catch(e:any){console.error("motor-source",action,e?.message||e);return reply(409,{ok:false,error:"source_action_rejected",detail:String(e?.message||"operation_failed").slice(0,500)},origin);}
});
