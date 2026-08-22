import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET='raiox-evidencias';
const ACCEPTED=new Set(['image/jpeg','image/png','image/webp']);
const MAX_BYTES=8_000_000;
const CHANNELS=new Set(['Instagram','LinkedIn','Google Perfil da Empresa','Site / landing page','WhatsApp Business','YouTube','TikTok','E-mail','Outro']);
const HMAC_SECRET=Deno.env.get('RAIOX_EVIDENCE_HMAC_SECRET')||'';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ALLOWED_ORIGINS=(Deno.env.get('ALLOWED_ORIGINS')||'https://ymnegocios.com.br').split(',').map(x=>x.trim()).filter(Boolean);

function cors(req:Request){
  const origin=req.headers.get('origin')||'';
  const allowed=ALLOWED_ORIGINS.includes(origin)?origin:(ALLOWED_ORIGINS[0]||'https://ymnegocios.com.br');
  return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'content-type,x-ym-evidence-token','Vary':'Origin'};
}
function json(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'}});}
function b64urlBytes(v:string){
  const s=v.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(v.length/4)*4,'=');
  const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;
}
function b64urlText(v:string){return new TextDecoder().decode(b64urlBytes(v));}
function equalBytes(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;}
async function verifyToken(token:string){
  if(!HMAC_SECRET||HMAC_SECRET.length<32)throw new Error('secret_not_configured');
  const parts=String(token||'').split('.');if(parts.length!==2)throw new Error('token_invalid');
  const [body,sig]=parts;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(HMAC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));
  if(!equalBytes(expected,b64urlBytes(sig)))throw new Error('token_signature');
  let p:any;try{p=JSON.parse(b64urlText(body));}catch{throw new Error('token_payload');}
  const now=Math.floor(Date.now()/1000);
  if(p?.v!=='RX_EVIDENCE_TOKEN_1.0'||!p?.ref||!p?.exp||p.exp<now)throw new Error('token_expired');
  if(!/^ym_raiox_\d{10,}_(manual|mestre)?[a-f0-9]{8,}$/.test(String(p.ref)))throw new Error('ref_invalid');
  return p;
}
function safeInt(v:FormDataEntryValue|null){const n=Number(String(v||''));return Number.isInteger(n)&&n>0&&n<=10000?n:null;}
function channelSlug(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'canal';}
function ext(type:string){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg';}
async function sha256Hex(bytes:ArrayBuffer){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return Array.from(h).map(x=>x.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{ok:false,error:'Método não permitido.'});
  let payload:any;
  try{payload=await verifyToken(req.headers.get('x-ym-evidence-token')||'');}
  catch{return json(req,403,{ok:false,error:'Acesso de upload inválido ou expirado.'});}
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,503,{ok:false,error:'Armazenamento temporariamente indisponível.'});

  let fd:FormData;try{fd=await req.formData();}catch{return json(req,400,{ok:false,error:'Formulário de upload inválido.'});}
  const file=fd.get('file');const channel=String(fd.get('channel')||'').trim();
  if(!(file instanceof File))return json(req,400,{ok:false,error:'Imagem ausente.'});
  if(!CHANNELS.has(channel))return json(req,400,{ok:false,error:'Canal inválido.'});
  if(!ACCEPTED.has(file.type))return json(req,415,{ok:false,error:'Formato de imagem não permitido.'});
  if(file.size<=0||file.size>MAX_BYTES)return json(req,413,{ok:false,error:'Imagem acima do limite permitido.'});

  const supabase=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {count,error:countError}=await supabase.from('raiox_evidence').select('id',{count:'exact',head:true}).eq('intake_ref',payload.ref).is('deleted_at',null);
  if(countError)return json(req,503,{ok:false,error:'Não foi possível validar o limite de evidências.'});
  const max=Math.max(1,Math.min(Number(payload.max_files)||5,5));if((count||0)>=max)return json(req,409,{ok:false,error:'Limite de evidências atingido.'});

  const bytes=await file.arrayBuffer();const hash=await sha256Hex(bytes);const id=crypto.randomUUID();
  const path=`${payload.ref}/${channelSlug(channel)}-${id}.${ext(file.type)}`;
  const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,new Uint8Array(bytes),{contentType:file.type,upsert:false,cacheControl:'0'});
  if(uploadError)return json(req,502,{ok:false,error:'Não foi possível armazenar a imagem.'});

  const row={id,intake_ref:payload.ref,channel,source_url:String(fd.get('source_url')||'').trim()||null,storage_provider:'supabase_storage',storage_file_id:path,mime_type:file.type,size_bytes:file.size,width:safeInt(fd.get('width')),height:safeInt(fd.get('height')),sha256:hash,upload_status:'uploaded',retention_until:new Date(Date.now()+180*24*60*60*1000).toISOString()};
  const {data,error:insertError}=await supabase.from('raiox_evidence').insert(row).select('id,intake_ref,channel,storage_provider,storage_file_id,mime_type,size_bytes,width,height,upload_status,created_at').single();
  if(insertError){await supabase.storage.from(BUCKET).remove([path]);return json(req,502,{ok:false,error:'Não foi possível registrar a evidência.'});}

  return json(req,200,{ok:true,evidence:{evidence_id:data.id,channel:data.channel,storage_provider:data.storage_provider,storage_file_id:data.storage_file_id,mime_type:data.mime_type,size_bytes:data.size_bytes,width:data.width,height:data.height,upload_status:data.upload_status,created_at:data.created_at}});
});
