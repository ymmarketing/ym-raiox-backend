/**
 * GET /api/acesso/validacao-raiox-v2?token=...
 * Cria uma sessão de homologação sem cobrança e redireciona para o Raio-X V2.
 * Token de validação: uso único.
 */
import crypto from 'node:crypto';
import { aplicarCors } from '../../lib/cors.js';
import { store, STATUS, temRedis } from '../../lib/store.js';
import { comparacaoSegura, limitarTaxa, sha256Hex, texto, log } from '../../lib/security.js';

const SALT='YM-RAIOX-V2-VALIDACAO-2026-08-24';
const TOKEN_HASH='0a3afaf5ff590f09215e8bae6627d3d86310261d682f3d7a38363f5d80d1368f';
const DEST='https://ymnegocios.com.br/raio-x-validacao-2026-08-24.html';

export default async function handler(req,res){
  if(aplicarCors(req,res)) return;
  if(String(req.method||'').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET, OPTIONS');
    return res.status(405).json({ok:false,error:'Método não permitido.'});
  }
  if(!temRedis) return res.status(503).send('Sessão de validação indisponível.');
  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'desconhecido';
  if(!await limitarTaxa(store,`validacao-v2:${ip}`,8)) return res.status(429).send('Muitas tentativas.');

  const token=texto(req.query?.token,120).trim();
  if(!token) return res.status(400).send('Token ausente.');
  const hash=await sha256Hex(SALT+token);
  if(!comparacaoSegura(hash,TOKEN_HASH)) return res.status(403).send('Token inválido.');

  const ref=`ym_raiox_${Date.now()}_mestre${crypto.randomBytes(8).toString('hex')}`;
  const reservou=await store.marcarCodigoResgatado(TOKEN_HASH,ref);
  if(!reservou) return res.status(403).send('Este link de validação já foi utilizado.');

  const now=new Date().toISOString();
  await store.salvar(ref,{
    ref,status:STATUS.APPROVED,paymentId:null,customer:'VALIDAÇÃO RAIO-X V2 YM',
    value:0,origem:'validacao_raiox_v2',createdAt:now,updatedAt:now
  });
  log('info','Sessão de validação Raio-X V2 criada',{ref});
  res.setHeader('Cache-Control','no-store');
  return res.redirect(302,`${DEST}?ref=${encodeURIComponent(ref)}&validacao=1`);
}
