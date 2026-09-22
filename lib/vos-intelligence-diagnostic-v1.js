import {P8, PILLARS} from './vos-intelligence-v1.js';
import {VOS_DIAGNOSTIC_CONTRACT_VERSION} from './vos-intelligence-contract-v1.js';

const CONFIDENCE=['forte','consistente','a_validar'];
const NATURE=['dado','inferencia','hipotese'];
const STATUS=['patrimonio','atencao','critico','validar'];

const findingSchema={
  type:'object',additionalProperties:false,
  required:['title','reading','nature','status','confidence','sources'],
  properties:{
    title:{type:'string'},reading:{type:'string'},
    nature:{type:'string',enum:NATURE},status:{type:'string',enum:STATUS},
    confidence:{type:'string',enum:CONFIDENCE},
    sources:{type:'array',items:{type:'string'}},
  },
};

export const VOS_DIAGNOSTIC_SCHEMA=Object.freeze({
  type:'object',additionalProperties:false,
  required:['contract_version','executive_summary','main_bottleneck','pillars','ps','root_hypotheses','not_assertable'],
  properties:{
    contract_version:{type:'string',enum:[VOS_DIAGNOSTIC_CONTRACT_VERSION]},
    executive_summary:{type:'string'},
    main_bottleneck:{
      type:'object',additionalProperties:false,
      required:['pillar','title','why_it_matters','confidence','sources'],
      properties:{
        pillar:{type:'string',enum:Object.values(PILLARS)},title:{type:'string'},why_it_matters:{type:'string'},
        confidence:{type:'string',enum:CONFIDENCE},sources:{type:'array',items:{type:'string'}},
      },
    },
    pillars:{type:'array',items:{type:'object',additionalProperties:false,required:['name','status','reading','confidence','sources'],properties:{name:{type:'string',enum:Object.values(PILLARS)},status:{type:'string',enum:STATUS},reading:{type:'string'},confidence:{type:'string',enum:CONFIDENCE},sources:{type:'array',items:{type:'string'}}}}},
    ps:{type:'array',items:{type:'object',additionalProperties:false,required:['name','status','reading','confidence','sources'],properties:{name:{type:'string',enum:P8},status:{type:'string',enum:STATUS},reading:{type:'string'},confidence:{type:'string',enum:CONFIDENCE},sources:{type:'array',items:{type:'string'}}}}},
    root_hypotheses:{type:'array',items:findingSchema},
    not_assertable:{type:'array',items:{type:'string'}},
  },
});

export const VOS_DIAGNOSTIC_SYSTEM_PROMPT=`Você é a camada interpretativa do VOS Intelligence Engine da YM Marketing & Negócios.

Sua função é interpretar evidências e formular hipóteses. Cálculos, KPIs, Data Quality, targets, dinheiro e regras de acesso pertencem ao código e não podem ser recalculados ou inventados por você.

Regras obrigatórias:
- diferencie dado, inferência e hipótese;
- use somente IDs presentes em allowed_sources;
- ausência de dado não prova ausência de processo ou resultado;
- preserve patrimônios antes de explicar lacunas;
- use exatamente os 3 Pilares e os 8 Ps recebidos no contrato;
- não crie benchmark, target, percentual, receita, margem ou conversão;
- quando a evidência for insuficiente, use status validar e confiança a_validar;
- escreva para um empresário leigo, com frases diretas e específicas;
- se o material for incompatível com a tarefa, devolva leituras em validar e explique em not_assertable.`;

function collectSources(report){
  const collections=[report?.main_bottleneck,...(report?.pillars||[]),...(report?.ps||[]),...(report?.root_hypotheses||[])];
  return collections.flatMap(item=>Array.isArray(item?.sources)?item.sources:[]);
}

export function validateDiagnosticReport(report,envelope){
  const errors=[];
  if(report?.contract_version!==VOS_DIAGNOSTIC_CONTRACT_VERSION) errors.push('contract_version');
  const pillarNames=(report?.pillars||[]).map(x=>x?.name);
  const pNames=(report?.ps||[]).map(x=>x?.name);
  if(new Set(pillarNames).size!==3 || Object.values(PILLARS).some(x=>!pillarNames.includes(x))) errors.push('pillars');
  if(new Set(pNames).size!==8 || P8.some(x=>!pNames.includes(x))) errors.push('ps');
  const allowed=new Set(envelope?.allowed_sources||[]);
  const invalidSources=[...new Set(collectSources(report).filter(x=>!allowed.has(x)))];
  if(invalidSources.length) errors.push('sources');
  return {valid:errors.length===0,errors,invalid_sources:invalidSources};
}

export function buildDiagnosticRequest(envelope,{model='gpt-5.6-terra',reasoning_effort='medium',max_output_tokens=7000}={}){
  return {
    model,
    instructions:VOS_DIAGNOSTIC_SYSTEM_PROMPT,
    input:[{role:'user',content:[{type:'input_text',text:`Analise o contrato abaixo e devolva apenas o diagnóstico estruturado.\n\nCONTRATO VOS:\n${JSON.stringify(envelope)}`}]}],
    reasoning:{effort:reasoning_effort},
    max_output_tokens,
    store:false,
    text:{format:{type:'json_schema',name:'vos_intelligence_diagnostic_v1',strict:true,schema:VOS_DIAGNOSTIC_SCHEMA}},
  };
}

function extractOutputText(data){
  if(typeof data?.output_text==='string' && data.output_text.trim()) return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[]){
    if(item?.type!=='message') continue;
    for(const content of item?.content||[]){
      if(content?.type==='refusal') throw new Error(`OPENAI_REFUSAL: ${content.refusal||'resposta recusada'}`);
      if(content?.type==='output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

export async function runDiagnosticAnalysis({
  envelope,
  api_key=process.env.OPENAI_API_KEY||'',
  model=process.env.OPENAI_VOS_MODEL||'gpt-5.6-terra',
  reasoning_effort=process.env.OPENAI_VOS_REASONING||'medium',
  max_output_tokens=Number(process.env.OPENAI_VOS_MAX_OUTPUT_TOKENS||7000),
  fetch_impl=globalThis.fetch,
}={}){
  if(!api_key) throw new Error('OPENAI_API_KEY ausente no backend.');
  if(typeof fetch_impl!=='function') throw new Error('Cliente HTTP indisponível.');
  const request=buildDiagnosticRequest(envelope,{model,reasoning_effort,max_output_tokens});
  const started=Date.now();
  const response=await fetch_impl('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${api_key}`,'Content-Type':'application/json'},
    body:JSON.stringify(request),
  });
  const raw=await response.text();
  if(!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${raw.slice(0,400)}`);
  let data;
  try{data=JSON.parse(raw);}catch{throw new Error('Resposta inválida da OpenAI.');}
  if(data?.status && data.status!=='completed') throw new Error(`OPENAI_RESPONSE_${String(data.status).toUpperCase()}`);
  const output=extractOutputText(data);
  if(!output) throw new Error('OpenAI não retornou o diagnóstico estruturado.');
  let diagnostic;
  try{diagnostic=JSON.parse(output);}catch{throw new Error('Não foi possível interpretar o JSON do diagnóstico.');}
  const validation=validateDiagnosticReport(diagnostic,envelope);
  if(!validation.valid) throw new Error(`Diagnóstico reprovado pelo contrato: ${validation.errors.join(',')}`);
  return {
    diagnostic,
    audit:{
      engine_version:envelope?.engine_version||null,
      diagnostic_contract_version:VOS_DIAGNOSTIC_CONTRACT_VERSION,
      model,
      response_id:data?.id||null,
      input_tokens:Number(data?.usage?.input_tokens||0),
      cached_input_tokens:Number(data?.usage?.input_tokens_details?.cached_tokens||0),
      output_tokens:Number(data?.usage?.output_tokens||0),
      web_search_calls:0,
      duration_ms:Date.now()-started,
      status:'completed',
    },
  };
}
