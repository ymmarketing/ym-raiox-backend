import { aplicarCors } from '../../lib/cors.js';
import { temOpenAI, OPENAI_MODEL, REPORT_VERSION_V2 } from '../../lib/raiox-v2-openai.js';

export default async function handler(req,res){
  if(aplicarCors(req,res)) return;
  if(String(req.method||'').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET, OPTIONS');return res.status(405).json({ok:false});
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,openai_configured:temOpenAI,model:OPENAI_MODEL,report_version:REPORT_VERSION_V2});
}
