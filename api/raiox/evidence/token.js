import { aplicarCors, exigirMetodo } from '../../../lib/cors.js';
import { store, STATUS, temRedis } from '../../../lib/store.js';
import { refValida, erroSeguro, limitarTaxa, log } from '../../../lib/security.js';
import { evidenceTokenConfigured, mintEvidenceToken } from '../../../lib/raiox-evidence-token.js';

function parseBody(req){
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{body=null;}}
  return body&&typeof body==='object'?body:null;
}

export default async function handler(req,res){
  if(aplicarCors(req,res))return;
  if(exigirMetodo(req,res,'POST'))return;
  if(!temRedis)return erroSeguro(res,503,'Upload de evidências temporariamente indisponível.',{causa:'storage_de_sessao_ausente'});
  if(!evidenceTokenConfigured)return erroSeguro(res,503,'Upload de evidências temporariamente indisponível.',{causa:'evidence_secret_ausente'});

  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'desconhecido';
  const rate=await limitarTaxa(store,`evidence-token:${ip}`,10);
  if(!rate)return erroSeguro(res,429,'Muitas tentativas. Aguarde um minuto.',{ip});

  const body=parseBody(req),ref=body&&body.ref;
  if(!ref||!refValida(ref))return erroSeguro(res,403,'Acesso não autorizado.',{causa:'ref_invalida'});

  let registro;
  try{registro=await store.buscar(ref);}catch(e){return erroSeguro(res,503,'Serviço temporariamente indisponível.',{motivo:e.message});}
  if(!registro||registro.status!==STATUS.APPROVED){
    log('warn','Tentativa de obter token de evidência sem acesso aprovado.',{ref,status:registro?.status||'inexistente'});
    return erroSeguro(res,403,'Acesso não autorizado.');
  }

  const minted=mintEvidenceToken({ref,maxFiles:5});
  return res.status(200).json({
    ok:true,
    token_version:'RX_EVIDENCE_TOKEN_1.0',
    upload_token:minted.token,
    expires_at:minted.expires_at,
    upload_url:process.env.RAIOX_EVIDENCE_UPLOAD_URL||null,
    analyze_url:process.env.RAIOX_EVIDENCE_ANALYZE_URL||null,
    limits:{max_files:5,max_bytes:8000000,accepted_types:['image/jpeg','image/png','image/webp']}
  });
}
