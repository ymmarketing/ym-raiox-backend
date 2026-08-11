export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false});
  try{
    const r=await fetch('https://srzdikgztpdtwbggwniz.supabase.co/functions/v1/motor-request-magic-link',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'ymmarketingenegocios@gmail.com',next:'/CRM'}),cache:'no-store'
    });
    const data=await r.json().catch(()=>({}));
    return res.status(r.status).json({ok:r.ok,error:data.error||null,message:data.message||null});
  }catch(e){return res.status(500).json({ok:false,error:'smoke_bridge_failed'})}
}
