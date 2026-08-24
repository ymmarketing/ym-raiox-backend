/**
 * POST /api/raiox/interpretar-v2
 * Raio-X Estratégico V2 — questionário factual + links + imagens.
 */
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { limitarTaxa, refValida, texto, log } from '../../lib/security.js';
import { gerarRaioxV2, temOpenAI, OPENAI_MODEL, REPORT_VERSION_V2, deleteOpenAIFile } from '../../lib/raiox-v2-openai.js';

export const maxDuration = 60;

const REQUIRED = Array.from({length:18},(_,i)=>`Q${String(i+1).padStart(2,'0')}`);

function bodyObj(req){
  if(req.body && typeof req.body==='object') return req.body;
  try{return JSON.parse(String(req.body||'{}'));}catch{return {};}
}
function clean(v,max=5000){ return texto(v,max).trim(); }

function sanitizeIntake(raw, allowedFileIds){
  const answers={};
  for(const id of REQUIRED) answers[id]=clean(raw?.answers?.[id],5000);
  const complements={};
  for(const [k,v] of Object.entries(raw?.complements||{})){
    if(/^Q(?:0[1-9]|1[0-8])$/.test(k) && clean(v,3000)) complements[k]=clean(v,3000);
  }
  const links=(Array.isArray(raw?.links)?raw.links:[]).slice(0,8).map((l,i)=>({
    id:`LINK${String(i+1).padStart(2,'0')}`,
    type:clean(l?.type,50),
    url:clean(l?.url,1500),
    context:clean(l?.context,1200)
  })).filter(x=>x.url);
  const images=(Array.isArray(raw?.images)?raw.images:[]).slice(0,6).map((im,i)=>({
    id:`IMG${String(i+1).padStart(2,'0')}`,
    name:clean(im?.name,160),
    context:clean(im?.context,1200),
    file_id:clean(im?.file_id,120)
  })).filter(x=>x.file_id && allowedFileIds.has(x.file_id));
  return {
    business_name:clean(raw?.business_name,220),
    answers,complements,links,images
  };
}

export default async function handler(req,res){
  if(aplicarCors(req,res)) return;
  if(String(req.method||'').toUpperCase()!=='POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ok:false,error:'Método não permitido.'});
  }
  if(!temRedis) return res.status(503).json({ok:false,error:'Sessão indisponível no momento.'});
  if(!temOpenAI) return res.status(503).json({ok:false,error:'OpenAI ainda não configurada no backend.',code:'OPENAI_NOT_CONFIGURED',model:OPENAI_MODEL});

  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'desconhecido';
  const rateOk=await limitarTaxa(store,`raiox-v2:${ip}`,5);
  if(!rateOk) return res.status(429).json({ok:false,error:'Muitas tentativas. Aguarde um minuto.'});

  const b=bodyObj(req);
  const ref=clean(b.ref,220);
  if(!refValida(ref)) return res.status(403).json({ok:false,error:'Acesso inválido.'});

  let session;
  try{session=await store.buscar(ref);}catch{return res.status(503).json({ok:false,error:'Não foi possível validar a sessão.'});}
  if(!session || session.status!==STATUS.APPROVED) return res.status(403).json({ok:false,error:'Pagamento ou acesso ainda não confirmado.'});

  const allowedFileIds=new Set((session.raioxV2Uploads||[]).map(x=>x?.file_id).filter(Boolean));
  const intake=sanitizeIntake(b.intake||{},allowedFileIds);
  const missing=REQUIRED.filter(id=>!intake.answers[id]);
  if(!intake.business_name) missing.unshift('BUSINESS_NAME');
  if(missing.length) return res.status(400).json({ok:false,error:'Existem respostas obrigatórias pendentes.',missing});

  try{
    await store.atualizar(ref,{
      raioxV2Status:'processing',
      raioxV2StartedAt:new Date().toISOString(),
      raioxV2Intake:{
        business_name:intake.business_name,
        answers:intake.answers,
        complements:intake.complements,
        links:intake.links,
        images:intake.images.map(x=>({id:x.id,name:x.name,context:x.context,file_id:x.file_id}))
      }
    });

    const result=await gerarRaioxV2(intake);

    await store.atualizar(ref,{
      raioxV2Status:'completed',
      raioxV2CompletedAt:new Date().toISOString(),
      raioxV2ReportVersion:REPORT_VERSION_V2,
      raioxV2Model:OPENAI_MODEL,
      raioxV2Cost:result.cost,
      raioxV2Report:result.report,
      raioxV2LinkAudit:result.linkAudit.map(x=>({id:x.id,url:x.url,status:x.status,reason:x.reason}))
    });

    await Promise.all(intake.images.map(x=>deleteOpenAIFile(x.file_id)));
    if(intake.images.length){
      await store.atualizar(ref,{raioxV2Uploads:[],raioxV2FilesDeletedAt:new Date().toISOString()});
    }

    log('info','Raio-X V2 concluído',{ref,model:OPENAI_MODEL,cost_usd:result.cost?.estimated_total_usd,links:intake.links.length,images:intake.images.length});
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:true,report:result.report,usage:result.cost});
  }catch(e){
    const msg=clean(e?.message||'Falha na análise.',500);
    log('error','Falha no Raio-X V2',{ref,motivo:msg});
    await store.atualizar(ref,{raioxV2Status:'error',raioxV2Error:msg,raioxV2ErrorAt:new Date().toISOString()}).catch(()=>{});
    return res.status(502).json({ok:false,error:'Não foi possível concluir a análise agora.',detail:process.env.NODE_ENV==='development'?msg:undefined});
  }
}
