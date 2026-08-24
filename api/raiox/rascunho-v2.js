/**
 * GET/POST /api/raiox/rascunho-v2
 * Salva respostas e referências de materiais para continuar depois no mesmo acesso.
 */
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { limitarTaxa, refValida, texto } from '../../lib/security.js';

function clean(v,max=5000){return texto(v,max).trim();}
function cleanArray(v,maxItems=30){return (Array.isArray(v)?v:[]).slice(0,maxItems).map(x=>clean(x,500)).filter(Boolean);}
function sanitize(d,session){
  const answers={}, complements={};
  const multi=new Set(['Q06','Q10','Q13']);
  for(let i=1;i<=18;i++){
    const id=`Q${String(i).padStart(2,'0')}`;
    if(multi.has(id)){
      const a=cleanArray(d?.answers?.[id]); if(a.length) answers[id]=a;
    }else{
      const a=clean(d?.answers?.[id],5000); if(a) answers[id]=a;
    }
    const c=clean(d?.complements?.[id],3000); if(c) complements[id]=c;
  }
  const links=(Array.isArray(d?.links)?d.links:[]).slice(0,8).map(x=>({
    type:clean(x?.type,50),url:clean(x?.url,1500),context:clean(x?.context,1200)
  })).filter(x=>x.url||x.context);
  const uploaded=new Map((session?.raioxV2Uploads||[]).map(x=>[x.file_id,x]));
  const images=(Array.isArray(d?.images)?d.images:[]).slice(0,6).map(x=>({
    file_id:clean(x?.file_id,120),name:clean(x?.name,160),context:clean(x?.context,1200)
  })).filter(x=>x.file_id && uploaded.has(x.file_id));
  return {
    business_name:clean(d?.business_name,220),
    answers,complements,links,images,
    q06main:clean(d?.q06main,500),
    section:Number.isInteger(d?.section)?Math.max(0,Math.min(6,d.section)):0,
    updatedAt:new Date().toISOString()
  };
}

export default async function handler(req,res){
  if(aplicarCors(req,res)) return;
  if(!temRedis) return res.status(503).json({ok:false,error:'Sessão indisponível.'});
  const method=String(req.method||'').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST, OPTIONS');return res.status(405).json({ok:false,error:'Método não permitido.'});
  }
  const ref=clean(method==='GET'?req.query?.ref:(req.body?.ref),220);
  if(!refValida(ref)) return res.status(403).json({ok:false,error:'Acesso inválido.'});
  const session=await store.buscar(ref).catch(()=>null);
  if(!session || session.status!==STATUS.APPROVED) return res.status(403).json({ok:false,error:'Acesso não confirmado.'});

  if(method==='GET'){
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:true,draft:session.raioxV2Draft||null,uploads:session.raioxV2Uploads||[],report:session.raioxV2Report||null,usage:session.raioxV2Cost||null});
  }

  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'desconhecido';
  if(!await limitarTaxa(store,`raiox-v2-draft:${ip}`,60)) return res.status(429).json({ok:false,error:'Muitos salvamentos em sequência.'});
  const d=sanitize(req.body?.draft||{},session);
  await store.atualizar(ref,{raioxV2Draft:d});
  return res.status(200).json({ok:true,savedAt:d.updatedAt});
}
