export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false});
  try{
    const r=await fetch('https://srzdikgztpdtwbggwniz.supabase.co/functions/v1/crm-production-import-temp',{cache:'no-store'});
    const text=await r.text();
    let data; try{data=JSON.parse(text)}catch{data={raw:text.slice(0,500)}}
    return res.status(r.status).json(data);
  }catch(e){return res.status(500).json({ok:false,error:'bridge_failed',detail:String(e?.message||e)})}
}
