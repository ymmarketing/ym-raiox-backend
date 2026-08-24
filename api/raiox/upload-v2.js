/**
 * POST /api/raiox/upload-v2
 * Recebe UM print comprimido, envia para OpenAI Files e vincula à sessão.
 */
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { limitarTaxa, refValida, texto, log } from '../../lib/security.js';
import { uploadImageToOpenAI, temOpenAI } from '../../lib/raiox-v2-openai.js';

export const maxDuration = 30;

function bodyObj(req){
  if(req.body && typeof req.body==='object') return req.body;
  try{return JSON.parse(String(req.body||'{}'));}catch{return {};}
}
function clean(v,max=1000){return texto(v,max).trim();}
function decodeDataUrl(v){
  const m=String(v||'').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m) throw new Error('Formato de imagem não aceito.');
  const buffer=Buffer.from(m[2],'base64');
  if(!buffer.length || buffer.length>650*1024) throw new Error('A imagem deve ter no máximo 650 KB após compressão.');
  return {mime:m[1],buffer};
}

export default async function handler(req,res){
  if(aplicarCors(req,res)) return;
  if(String(req.method||'').toUpperCase()!=='POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ok:false,error:'Método não permitido.'});
  }
  if(!temRedis) return res.status(503).json({ok:false,error:'Sessão indisponível.'});
  if(!temOpenAI) return res.status(503).json({ok:false,error:'OpenAI ainda não configurada no backend.',code:'OPENAI_NOT_CONFIGURED'});

  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'desconhecido';
  if(!await limitarTaxa(store,`raiox-v2-upload:${ip}`,12)) return res.status(429).json({ok:false,error:'Muitos envios. Aguarde um minuto.'});

  const b=bodyObj(req);
  const ref=clean(b.ref,220);
  if(!refValida(ref)) return res.status(403).json({ok:false,error:'Acesso inválido.'});
  const session=await store.buscar(ref).catch(()=>null);
  if(!session || session.status!==STATUS.APPROVED) return res.status(403).json({ok:false,error:'Acesso não confirmado.'});
  const uploads=Array.isArray(session.raioxV2Uploads)?session.raioxV2Uploads:[];
  if(uploads.length>=6) return res.status(400).json({ok:false,error:'O limite atual é de 6 prints por Raio-X.'});

  try{
    const {mime,buffer}=decodeDataUrl(b.data_url);
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const name=(clean(b.name,120).replace(/[^a-zA-Z0-9._-]+/g,'_')||`print-${Date.now()}.${ext}`).slice(0,120);
    const uploaded=await uploadImageToOpenAI({buffer,mime,name});
    const item={
      file_id:uploaded.file_id,
      name:name,
      context:clean(b.context,1200),
      bytes:uploaded.bytes,
      uploadedAt:new Date().toISOString()
    };
    await store.atualizar(ref,{raioxV2Uploads:[...uploads,item]});
    log('info','Print vinculado ao Raio-X V2',{ref,file_id:item.file_id,bytes:item.bytes});
    return res.status(200).json({ok:true,file:item});
  }catch(e){
    return res.status(400).json({ok:false,error:clean(e?.message||'Falha no upload.',300)});
  }
}
