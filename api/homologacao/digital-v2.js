const FRONT_COMMIT='b57c1ce1e6783f5e25ce60a29fafc2dffe91fdc1';
const PREVIEW=`https://cdn.jsdelivr.net/gh/ymmarketing/ymnegocios@${FRONT_COMMIT}/raio-x-v2-preview.html`;

export default async function handler(req,res){
  if(String(req.method||'').toUpperCase()!=='GET')return res.status(405).json({ok:false,error:'Método não permitido.'});
  const mode=req.query?.mode==='form'?'form':'ym';
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  return res.redirect(302,`${PREVIEW}?mode=${mode}`);
}
